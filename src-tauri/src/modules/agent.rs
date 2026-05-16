use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentConfig {
    pub workspace_id: String,
    pub command: String,
    pub args: Vec<String>,
    pub cwd: String,
    pub env: std::collections::HashMap<String, String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct AgentSession {
    pub id: String,
    pub workspace_id: String,
    pub pty_id: u32,
}

#[tauri::command]
pub async fn agent_pty_open(
    _state: tauri::State<'_, crate::modules::pty::PtyState>,
    _config: AgentConfig,
    _app: tauri::AppHandle,
) -> Result<AgentSession, String> {
    // TODO: spawn agent as hidden PTY subprocess
    // This will reuse portable-pty infrastructure from modules::pty
    // but tag the session as "agent" type so it doesn't appear in terminal tabs
    Err("agent_pty_open not yet implemented".into())
}

#[tauri::command]
pub async fn agent_pty_write(
    _session_id: String,
    _data: String,
) -> Result<(), String> {
    // TODO: write to agent PTY stdin
    Err("agent_pty_write not yet implemented".into())
}

#[tauri::command]
pub async fn agent_pty_close(
    _session_id: String,
) -> Result<(), String> {
    // TODO: gracefully terminate agent PTY
    Err("agent_pty_close not yet implemented".into())
}

#[tauri::command]
pub async fn agent_list_installed(
    _app: tauri::AppHandle,
) -> Result<Vec<AgentInfo>, String> {
    // TODO: check which CLI agents are available on PATH
    // e.g. `which claude`, `which opencode`, `which aider`, etc.
    Ok(vec![])
}

#[derive(Clone, Debug, Serialize)]
pub struct AgentInfo {
    pub id: String,
    pub name: String,
    pub command: String,
    pub installed: bool,
    pub version: Option<String>,
}
