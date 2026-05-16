use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::{Duration, Instant};

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use tauri::ipc::{Channel, Response};

const FLUSH_INTERVAL: Duration = Duration::from_millis(4);
const READ_BUF: usize = 16 * 1024;

/// An agent PTY session — same underlying PTY infrastructure as terminal
/// sessions, but spawned as a direct command (no shell integration scripts).
struct AgentSession {
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    #[allow(dead_code)]
    master: Mutex<Box<dyn MasterPty + Send>>,
}

impl Drop for AgentSession {
    fn drop(&mut self) {
        if let Ok(mut k) = self.killer.lock() {
            let _ = k.kill();
        }
    }
}

pub struct AgentState {
    sessions: RwLock<HashMap<String, Arc<AgentSession>>>,
    next_id: AtomicU32,
}

impl Default for AgentState {
    fn default() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            next_id: AtomicU32::new(1),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentConfig {
    pub workspace_id: String,
    pub command: String,
    pub args: Vec<String>,
    pub cwd: String,
    pub env: HashMap<String, String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct AgentSessionInfo {
    pub id: String,
    pub workspace_id: String,
    pub pty_id: u32,
}

/// Spawn an agent as a PTY subprocess. The PTY gives the agent a proper TTY,
/// which many CLI agents (Claude Code, Aider) require for correct behavior.
fn spawn_agent_pty(
    config: &AgentConfig,
    cols: u16,
    rows: u16,
    on_data: Channel<Response>,
    on_exit: Channel<i32>,
) -> Result<(Arc<AgentSession>, PtySize), String> {
    let pty_system = native_pty_system();
    let size = PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    };
    let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(&config.command);
    for arg in &config.args {
        cmd.arg(arg);
    }

    // Set environment variables
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("NOVA_AGENT", "1");

    // Merge custom env
    for (k, v) in &config.env {
        cmd.env(k, v);
    }

    // Set working directory
    let cwd = PathBuf::from(&config.cwd);
    if cwd.is_dir() {
        cmd.cwd(cwd);
    } else if let Some(home) = dirs::home_dir() {
        cmd.cwd(home);
    }

    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let killer = child.clone_killer();
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer: Arc<Mutex<Box<dyn Write + Send>>> = Arc::new(Mutex::new(
        pair.master.take_writer().map_err(|e| e.to_string())?,
    ));

    let session = Arc::new(AgentSession {
        killer: Mutex::new(killer),
        writer: writer.clone(),
        master: Mutex::new(pair.master),
    });

    let pending: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::with_capacity(READ_BUF)));
    let done = Arc::new(AtomicBool::new(false));
    let spawn_at = Instant::now();

    // Reader thread — reads from PTY master, buffers data
    let pending_r = pending.clone();
    let reader_thread = thread::Builder::new()
        .name("nova-agent-reader".into())
        .spawn(move || {
            let mut buf = [0u8; READ_BUF];
            let mut logged_first = false;
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if !logged_first {
                            logged_first = true;
                            log::info!(
                                "agent pty first byte after {}ms",
                                spawn_at.elapsed().as_millis()
                            );
                        }
                        let mut g = pending_r.lock().unwrap();
                        g.extend_from_slice(&buf[..n]);
                    }
                    Err(e) => {
                        log::debug!("agent pty reader ended: {e}");
                        break;
                    }
                }
            }
        })
        .expect("spawn agent pty reader thread");

    // Flusher thread — sends buffered data to frontend every 4ms
    let on_data_flush = on_data.clone();
    let pending_f = pending.clone();
    let done_f = done.clone();
    thread::Builder::new()
        .name("nova-agent-flusher".into())
        .spawn(move || loop {
            thread::sleep(FLUSH_INTERVAL);
            let chunk = {
                let mut g = pending_f.lock().unwrap();
                if g.is_empty() {
                    if done_f.load(Ordering::Acquire) {
                        break;
                    }
                    continue;
                }
                std::mem::take(&mut *g)
            };
            if let Err(e) = on_data_flush.send(Response::new(chunk)) {
                log::debug!("agent flusher exiting, channel closed: {e}");
                break;
            }
        })
        .expect("spawn agent pty flusher thread");

    // Waiter thread — waits for child exit, sends final data + exit code
    let on_data_exit = on_data;
    let pending_e = pending;
    let done_e = done;
    thread::Builder::new()
        .name("nova-agent-waiter".into())
        .spawn(move || {
            let code = match child.wait() {
                Ok(status) => status.exit_code() as i32,
                Err(e) => {
                    log::warn!("agent pty child wait failed: {e}");
                    -1
                }
            };

            // Wait for reader to hit EOF
            #[cfg(windows)]
            {
                let deadline = Instant::now() + Duration::from_millis(50);
                while Instant::now() < deadline && !reader_thread.is_finished() {
                    thread::sleep(Duration::from_millis(5));
                }
            }
            #[cfg(not(windows))]
            if let Err(e) = reader_thread.join() {
                log::error!("agent pty reader thread panicked: {e:?}");
            }

            // Send any remaining buffered data
            let tail = std::mem::take(&mut *pending_e.lock().unwrap());
            if !tail.is_empty() {
                if let Err(e) = on_data_exit.send(Response::new(tail)) {
                    log::debug!("agent final-data send failed: {e}");
                }
            }
            done_e.store(true, Ordering::Release);
            if let Err(e) = on_exit.send(code) {
                log::debug!("agent exit send failed: {e}");
            }
        })
        .expect("spawn agent pty waiter thread");

    Ok((session, size))
}

#[tauri::command]
pub fn agent_pty_open(
    state: tauri::State<AgentState>,
    config: AgentConfig,
    cols: u16,
    rows: u16,
    on_data: Channel<Response>,
    on_exit: Channel<i32>,
) -> Result<AgentSessionInfo, String> {
    let workspace_id = config.workspace_id.clone();
    let (session, _) = spawn_agent_pty(&config, cols, rows, on_data, on_exit).map_err(|e| {
        log::error!("agent_pty_open failed: {e}");
        e
    })?;

    let id_num = state.next_id.fetch_add(1, Ordering::Relaxed);
    let id = format!("agent-{id_num}");
    let pty_id = id_num;

    state.sessions.write().unwrap().insert(id.clone(), session);
    log::info!(
        "agent pty opened id={id} workspace={workspace_id} command={}",
        config.command
    );

    Ok(AgentSessionInfo {
        id,
        workspace_id,
        pty_id,
    })
}

#[tauri::command]
pub fn agent_pty_write(
    state: tauri::State<AgentState>,
    id: String,
    data: String,
) -> Result<(), String> {
    let session = state
        .sessions
        .read()
        .unwrap()
        .get(&id)
        .cloned()
        .ok_or_else(|| {
            log::warn!("agent_pty_write: unknown id={id}");
            "no session".to_string()
        })?;

    let result = session
        .writer
        .lock()
        .unwrap()
        .write_all(data.as_bytes())
        .map_err(|e| {
            log::debug!("agent_pty_write id={id} failed: {e}");
            e.to_string()
        });
    result
}

#[tauri::command]
pub fn agent_pty_close(state: tauri::State<AgentState>, id: String) -> Result<(), String> {
    let session = state.sessions.write().unwrap().remove(&id);
    if let Some(s) = session {
        if let Err(e) = s.killer.lock().unwrap().kill() {
            log::debug!("agent_pty_close: kill id={id} returned {e}");
        }
        log::info!("agent pty closed id={id}");
        // Drop on detached thread to avoid blocking Tauri worker
        thread::Builder::new()
            .name(format!("nova-agent-drop-{id}"))
            .spawn(move || {
                let t0 = std::time::Instant::now();
                drop(s);
                log::info!(
                    "agent pty session id={id} dropped in {}ms",
                    t0.elapsed().as_millis()
                );
            })
            .expect("spawn agent drop thread");
    } else {
        log::debug!("agent_pty_close: unknown id={id}");
    }
    Ok(())
}

#[derive(Clone, Debug, Serialize)]
pub struct AgentInfo {
    pub id: String,
    pub name: String,
    pub command: String,
    pub installed: bool,
    pub version: Option<String>,
}

/// Check which CLI agents are available on the system PATH.
#[tauri::command]
pub fn agent_list_installed() -> Result<Vec<AgentInfo>, String> {
    let agents = [
        ("claude-code", "Claude Code", "claude"),
        ("opencode", "OpenCode", "opencode"),
        ("aider", "Aider", "aider"),
        ("gemini-cli", "Gemini CLI", "gemini"),
        ("codex-cli", "Codex CLI", "codex"),
        ("aicommit2", "Aicommit2", "aicommit2"),
    ];

    let mut result = Vec::new();
    for (id, name, cmd) in &agents {
        let installed = find_command(cmd).is_some();
        let version = if installed {
            get_version(cmd).ok()
        } else {
            None
        };
        result.push(AgentInfo {
            id: id.to_string(),
            name: name.to_string(),
            command: cmd.to_string(),
            installed,
            version,
        });
    }

    Ok(result)
}

fn find_command(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
        // Also check with .exe extension on Windows
        #[cfg(windows)]
        {
            let candidate_exe = dir.join(format!("{name}.exe"));
            if candidate_exe.is_file() {
                return Some(candidate_exe);
            }
            // And .cmd/.bat for npm-installed tools
            let candidate_cmd = dir.join(format!("{name}.cmd"));
            if candidate_cmd.is_file() {
                return Some(candidate_cmd);
            }
            let candidate_bat = dir.join(format!("{name}.bat"));
            if candidate_bat.is_file() {
                return Some(candidate_bat);
            }
        }
    }
    None
}

fn get_version(cmd: &str) -> Result<String, String> {
    let output = std::process::Command::new(cmd)
        .arg("--version")
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout);
        Ok(version.trim().to_string())
    } else {
        // Try -v as fallback
        let output = std::process::Command::new(cmd)
            .arg("-v")
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout);
            Ok(version.trim().to_string())
        } else {
            Err("could not determine version".into())
        }
    }
}
