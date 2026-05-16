# NOVA.md

> **Nova IDE** — AI-first, agent-agnostic, multi-workspace development environment.
> Forked from [Terax AI](https://github.com/crynta/terax-ai) · Rebuilt for the post-VSCode era.

---

## Vision

Stop juggling terminals. Nova is one lightweight app (~10MB) where you run multiple projects simultaneously, each with its own agent, terminal, editor, and file explorer — all visible at once, all isolated, all yours.

- **Multiple workspaces side-by-side** — switch instantly, see everything at a glance
- **Any CLI agent per workspace** — OpenCode, Claude Code, Gemini CLI, Aider, pi.dev, custom
- **Files you can see and edit** — full file explorer + CodeMirror editor per workspace
- **Zero accounts, zero telemetry** — your keys, your machine, your code

---

## What Terax Already Gives Us (Don't Rebuild)

Understanding the existing codebase is critical. Terax is not a blank slate.

### Already Working in Terax v0.5.9

**Terminal** — xterm.js + WebGL renderer, multi-tab, native PTY backend via `portable-pty`, shell integration (cwd reporting via OSC sequences), inline search, background streaming when tabs are hidden.

**Editor** — CodeMirror 6, language support for TS/JS/Rust/Python/HTML/CSS/JSON/Markdown, inline AI autocomplete, edit diffs, Vim mode, 7 prebuilt themes.

**File Explorer** — Catppuccin icon theme via Material Icon Theme resolver, fuzzy search, keyboard navigation, inline rename, context actions.

**AI Panel** — BYOK (OpenAI, Anthropic, Google, Groq, xAI, Cerebras, LM Studio), voice input, edit diffs, multi-agent/sub-agents, snippets/skills, `TERAX.md` project memory, tool approval flow.

**Web Preview** — auto-detects local dev servers.

**Quality** — ~7MB bundle, OS keychain for keys, no telemetry, cross-platform.

### Terax Architecture (Understand Before Touching)

```
Two-process model:
  Rust (src-tauri/)     ← owns all OS access: PTY, FS, keychain, shell
  React (src/)          ← everything goes through invoke() calls

Key Rust commands:
  pty_open / pty_write / pty_resize / pty_close   ← PTY sessions
  fs::tree::* / fs::file::* / fs::mutate::*       ← file explorer + editor IO
  shell::shell_run_command                          ← one-shot AI tool exec (NOT the PTY)

Frontend modules (src/modules/):
  terminal/   ← TerminalStack, one xterm per tab, hidden not unmounted
  editor/     ← EditorStack mirrors TerminalStack
  explorer/   ← file tree, icon resolver, context actions
  tabs/       ← useTabs = source of truth (kind: "terminal" | "editor")
  ai/         ← agent, sessions, composer, tools, security
  header/     ← top bar + inline search
  statusbar/  ← bottom bar, cwd breadcrumb
  shortcuts/  ← keymap registry + useGlobalShortcuts
  theme/      ← next-themes provider

AI key storage: OS keychain via keyring (NEVER localStorage, NEVER disk)
Session storage: tauri-plugin-store → terax-ai-sessions.json
State: Zustand stores
UI: shadcn/ui (style: radix-luma, base: mist, icons: hugeicons)
CSS: Tailwind v4 via @theme in src/App.css — no tailwind.config.*
Animations: motion (Framer Motion successor)
Resizable layout: react-resizable-panels (ALREADY INSTALLED)
Path alias: @/* → src/*
```

### Critical Constraints (Never Violate)

- All OS access through Rust `invoke()` — frontend never touches FS/processes directly
- Keys always OS keychain — never `localStorage`, never disk, never settings store
- `shell_run_command` is for AI tools only — PTY sessions are separate, don't conflate
- Tabs are hidden via `invisible pointer-events-none` — NOT unmounted (PTYs keep streaming)
- `lib/security.ts` deny-list applies to BOTH read and write paths — don't bypass
- New Tauri plugins need: `Cargo.toml` dep + `.plugin(...)` in `lib.rs` + capability entry in `capabilities/default.json`

---

## Core Philosophy

1. **Multi-workspace is the product** — everything else is scaffolding
2. **Any CLI agent, no lock-in** — OpenCode, Claude Code, Aider, Gemini CLI, pi.dev, custom commands
3. **See your files while the agent works** — file explorer + editor always visible, always in sync
4. **Lightweight stays lightweight** — don't sacrifice Terax's 7MB/7s startup advantage
5. **Your machine, your rules** — no accounts, no telemetry, local agents work offline

---

## Target Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Nova                                    [Workspace 1] [Workspace 2] [+] │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────┐   │
│  │  WORKSPACE 1: my-api        │  │  WORKSPACE 2: frontend          │   │
│  │                             │  │                                 │   │
│  │  [Agent: Claude Code ▾]     │  │  [Agent: OpenCode ▾]            │   │
│  │  ┌─────────────────────┐   │  │  ┌─────────────────────────┐   │   │
│  │  │  AI Panel           │   │  │  │  AI Panel               │   │   │
│  │  │  (agent running)    │   │  │  │  (idle)                 │   │   │
│  │  └─────────────────────┘   │  │  └─────────────────────────┘   │   │
│  │  ┌──────────┬──────────┐   │  │  ┌──────────┬──────────────┐   │   │
│  │  │ Explorer │ Editor   │   │  │  │ Explorer │ Terminal     │   │   │
│  │  │          │          │   │  │  │          │              │   │   │
│  │  │ src/     │ main.rs  │   │  │  │ app/     │ $ opencode   │   │   │
│  │  │  ├─ lib  │ fn main()│   │  │  │  ├─ ui   │ > working..  │   │   │
│  │  │  └─ api  │ ...      │   │  │  │  └─ lib  │              │   │   │
│  │  └──────────┴──────────┘   │  │  └──────────┴──────────────┘   │   │
│  └─────────────────────────────┘  └─────────────────────────────────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure (Post-Fork)

```
nova-ide/
├── src/
│   ├── modules/
│   │   ├── workspace/          # NEW: workspace manager, switcher, state
│   │   │   ├── WorkspaceShell.tsx
│   │   │   ├── WorkspaceSwitcher.tsx
│   │   │   ├── WorkspaceTabs.tsx
│   │   │   └── stores/
│   │   │       └── workspaceStore.ts
│   │   ├── agent/              # NEW: CLI agent adapter layer
│   │   │   ├── AgentPanel.tsx
│   │   │   ├── AgentSelector.tsx
│   │   │   ├── AgentStatusIndicator.tsx
│   │   │   └── adapters/
│   │   │       ├── AgentAdapter.ts       # interface definition
│   │   │       ├── ClaudeCodeAdapter.ts
│   │   │       ├── OpenCodeAdapter.ts
│   │   │       ├── AiderAdapter.ts
│   │   │       ├── GeminiCLIAdapter.ts
│   │   │       └── GenericCLIAdapter.ts
│   │   ├── terminal/           # EXTEND: already exists in Terax
│   │   ├── editor/             # EXTEND: already exists in Terax
│   │   ├── explorer/           # EXTEND: already exists in Terax
│   │   ├── tabs/               # EXTEND: already exists in Terax
│   │   ├── ai/                 # EXTEND: already exists in Terax
│   │   ├── layout/             # NEW: panel layout engine
│   │   │   ├── WorkspaceLayout.tsx
│   │   │   └── LayoutPresets.ts
│   │   ├── header/             # EXTEND: add workspace switcher
│   │   ├── statusbar/          # EXTEND: add agent status
│   │   ├── shortcuts/          # EXTEND: workspace shortcuts
│   │   └── theme/              # KEEP: unchanged
│   └── App.tsx                 # REFACTOR: coordinator, wires workspaces
├── src-tauri/
│   └── src/
│       ├── workspace.rs        # NEW: workspace commands, config I/O
│       ├── agent.rs            # NEW: CLI agent process management
│       ├── pty/                # KEEP: already exists in Terax
│       ├── fs/                 # KEEP: already exists in Terax
│       └── lib.rs              # EXTEND: register new commands
└── NOVA.md                     # this file
```

---

## Workspace Config Format (`nova.workspace.json`)

Each workspace folder can contain a `nova.workspace.json`. Nova auto-discovers it on open.

```json
{
  "name": "my-api",
  "root": "/Users/me/projects/my-api",
  "agent": {
    "type": "claude-code",
    "command": "claude",
    "args": [],
    "env": {}
  },
  "shell": "zsh",
  "env": {
    "NODE_ENV": "development"
  },
  "layout": "ai-editor-terminal",
  "tasks": {
    "dev": "cargo run",
    "test": "cargo test",
    "build": "cargo build --release"
  },
  "memory": "NOVA.md"
}
```

**Workspace state** (open files, scroll pos, terminal state, conversation) is stored separately in `nova-state.json` managed by Tauri store — not in the config file. Don't mix config and runtime state.

---

## Roadmap

### Phase 0: Foundation (Week 1–2)

**Goal:** Fork, rename, understand, structure. Don't touch features yet.

- [ ] Fork `terax-ai` → `nova-ide`
- [ ] Rename all branding: Terax → Nova, bundle id `app.nova.ide`, update `package.json`, icons, window title
- [ ] Read the entire `TERAX.md` — understand the two-process model, module layout, AI subsystem, UI conventions
- [ ] Audit existing Terax modules — map what's in each, what state they own, what Tauri commands they use
- [ ] Benchmark baseline: measure current startup time, memory at idle, memory with 1 terminal + editor open
- [ ] Verify pnpm install + `pnpm tauri dev` works cleanly
- [ ] Create new folders: `src/modules/workspace/`, `src/modules/agent/`, `src/modules/layout/`
- [ ] Add `workspace.rs` and `agent.rs` stubs to `src-tauri/src/`
- [ ] Define the Agent Process Lifecycle state machine (on paper):
  ```
  UNSET → SPAWNING → READY → RUNNING → PAUSED → STOPPING → STOPPED
                                ↓                              ↓
                              ERROR ←──────────────────────────┘
  ```
- [ ] Define `nova.workspace.json` schema (see above)
- [ ] Write this NOVA.md into the repo

**Done when:** `pnpm tauri dev` runs, new folder structure exists, you can articulate every existing Terax module's responsibility.

---

### Phase 1: Multi-Workspace Shell (Week 3–5)

**Goal:** Run 2+ workspaces simultaneously. Each workspace is a full isolated Terax instance.

#### 1.1 Workspace State Store

New store: `src/modules/workspace/stores/workspaceStore.ts`

```typescript
interface Workspace {
  id: string;                    // uuid
  name: string;
  root: string;                  // absolute path
  config: WorkspaceConfig;       // parsed nova.workspace.json
  state: WorkspaceRuntimeState;  // open files, active tab, scroll positions
  agentState: AgentLifecycle;    // UNSET | SPAWNING | READY | RUNNING | PAUSED | STOPPED | ERROR
}

interface WorkspaceStore {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  // actions
  createWorkspace(root: string): Promise<Workspace>;
  openWorkspace(root: string): Promise<Workspace>;
  closeWorkspace(id: string): void;
  setActive(id: string): void;
  updateConfig(id: string, config: Partial<WorkspaceConfig>): void;
}
```

Each workspace gets its own isolated instances of:
- `useTabs` state (terminal tabs, editor tabs)
- PTY sessions (scoped by workspace id prefix)
- File explorer root (scoped to `workspace.root`)
- Agent panel + conversation history
- CodeMirror editor state

Shared across workspaces:
- Theme
- Keyboard shortcuts
- AI API keys (keychain)
- Global settings

#### 1.2 WorkspaceShell Component

`WorkspaceShell.tsx` is the container that renders one complete workspace. It's what Terax's `App.tsx` renders today — except now multiple instances run simultaneously.

Each workspace renders independently. The inactive one is hidden (`invisible pointer-events-none`) — same pattern Terax already uses for terminal tabs. PTYs keep running.

```typescript
// App.tsx becomes a coordinator:
function App() {
  const { workspaces, activeWorkspaceId } = useWorkspaceStore();
  return (
    <div>
      <WorkspaceTabs />
      {workspaces.map(ws => (
        <WorkspaceShell
          key={ws.id}
          workspace={ws}
          active={ws.id === activeWorkspaceId}
        />
      ))}
    </div>
  );
}
```

**Memory concern:** Each hidden workspace still holds xterm instances and PTY connections. Test with 3 workspaces open — if memory exceeds 400MB total, add a "suspend" mode that kills the PTY and saves state.

#### 1.3 Workspace Switcher UI

- Horizontal tab bar at top: `[Workspace 1] [Workspace 2] [+]`
- Keyboard shortcut: `Ctrl+Shift+[1-9]` to switch by index
- Quick switcher: `Ctrl+K` opens fuzzy search over workspace names + paths
- Drag to reorder tabs
- Right-click → Close, Rename, Open in Finder

#### 1.4 Workspace Persistence

On app quit → serialize all workspace state to `nova-workspaces.json` via `tauri-plugin-store`.

On app launch → restore workspaces in the same order, re-open PTYs, restore file explorer state, restore open editor files.

```typescript
interface PersistedWorkspace {
  id: string;
  name: string;
  root: string;
  openFiles: string[];          // paths of open editor tabs
  activeFile: string | null;
  terminalCwd: string;          // last known cwd per terminal tab
  agentId: string;              // which agent was selected
  conversationId: string;       // restore conversation
  layout: LayoutPreset;
}
```

#### 1.5 Workspace Layout Engine

Each workspace has a configurable panel layout. Extend `react-resizable-panels` (already in Terax):

Built-in presets:
- `ai-terminal` — AI panel left (60%), terminal right (40%)
- `ai-editor` — AI panel left (40%), editor right (60%)
- `ai-editor-terminal` — AI panel left (35%), editor center (40%), terminal right (25%)
- `full-ide` — file explorer (15%) + editor (50%) + terminal (20%) + AI (15%)
- `focus` — AI panel full width

Users can drag to resize. Layout is persisted per workspace in `nova-state.json`.

**Done when:** You can open 3 workspaces, switch between them with `Ctrl+Shift+1/2/3`, close one, and reopen the app to find them all restored.

---

### Phase 2: CLI Agent Integration (Week 6–9)

**Goal:** Any CLI agent runs inside a workspace, visible as structured output in the AI panel.

This is the hardest phase and the core of the product. Budget extra time.

#### 2.1 AgentAdapter Interface

```typescript
// src/modules/agent/adapters/AgentAdapter.ts

export type AgentLifecycle =
  | 'UNSET' | 'SPAWNING' | 'READY' | 'RUNNING'
  | 'PAUSED' | 'STOPPING' | 'STOPPED' | 'ERROR';

export interface AgentMessage {
  id: string;
  role: 'agent' | 'user' | 'system' | 'tool';
  content: string;
  raw?: string;          // original unparsed output for debugging
  timestamp: number;
  fileChanges?: FileChange[];
}

export interface FileChange {
  path: string;
  type: 'created' | 'modified' | 'deleted';
  diff?: string;
}

export interface AgentConfig {
  workspaceRoot: string;
  shell: string;
  env: Record<string, string>;
  customArgs?: string[];
}

export interface AgentSession {
  id: string;
  workspaceId: string;
  lifecycle: AgentLifecycle;
  ptyId: string;         // underlying PTY session id (from Tauri)
}

export interface AgentAdapter {
  id: string;            // e.g. "claude-code"
  name: string;          // e.g. "Claude Code"
  command: string;       // e.g. "claude"
  isInstalled(): Promise<boolean>;
  spawn(config: AgentConfig): Promise<AgentSession>;
  sendMessage(session: AgentSession, message: string): Promise<void>;
  onMessage(session: AgentSession, cb: (msg: AgentMessage) => void): () => void;
  onLifecycleChange(session: AgentSession, cb: (lc: AgentLifecycle) => void): () => void;
  onFileChange(session: AgentSession, cb: (change: FileChange) => void): () => void;
  pause(session: AgentSession): Promise<void>;
  resume(session: AgentSession): Promise<void>;
  stop(session: AgentSession): Promise<void>;
}
```

#### 2.2 How CLI Agents Work (Critical Architecture Decision)

CLI agents are spawned as PTY subprocesses — the same `portable-pty` Terax already uses. The difference is these are **hidden PTY sessions** — not attached to a visible xterm tab.

```
User types in AI Panel input
        ↓
AgentAdapter.sendMessage()
        ↓
Rust: pty_write(agent_pty_id, message + "\n")
        ↓
Agent process receives stdin → processes → writes stdout
        ↓
Rust: PtyEvent::Data streamed back to frontend
        ↓
AgentAdapter.onMessage() parser → structured AgentMessage
        ↓
AI Panel renders as chat bubble / diff / status
```

Add a new Rust command `agent_pty_open` that creates a PTY session marked as "agent" type — same `pty_open` under the hood, but tagged so it doesn't appear in the terminal tab list.

```rust
// src-tauri/src/agent.rs
#[tauri::command]
pub async fn agent_pty_open(
    state: State<'_, PtyState>,
    workspace_id: String,
    command: String,
    args: Vec<String>,
    cwd: String,
    env: HashMap<String, String>,
    channel: Channel<PtyEvent>,
) -> Result<String, String>
```

#### 2.3 Output Parsing (The Hard Part)

**Do not attempt real-time parsing of raw terminal output.** This is the #1 way this project fails.

Instead, build a **test harness first**:

1. Record real output from each agent to files (`recordings/claude-code-session-01.txt`, etc.)
2. Write parsers against recordings — fast, reproducible, no agent running needed
3. Only integrate with live agent after parsers pass tests

Each agent has its own parser because their output formats differ:

```typescript
// Example parser structure
interface AgentOutputParser {
  agentId: string;
  // Called for each new chunk of stdout
  consume(chunk: string): AgentMessage[];
  // Detect agent "ready for input" state
  isReady(output: string): boolean;
  // Detect agent is "thinking/working"
  isRunning(output: string): boolean;
}
```

Start simple — extract user-visible text and file change notifications. Don't try to parse internal tool calls.

#### 2.4 Supported CLI Agents (Priority Order)

**Priority 1 — Build these first:**

`ClaudeCodeAdapter` — spawns `claude` CLI. Detects ready state, parses file edit notifications, surfaces errors.

`OpenCodeAdapter` — spawns `opencode`. Same pattern.

**Priority 2 — After P1 works:**

`AiderAdapter` — spawns `aider`. Has relatively structured output.

`GeminiCLIAdapter` — spawns `gemini`.

`GenericCLIAdapter` — configurable: user specifies command + optional ready-string regex + optional file-change pattern. Covers pi.dev, custom agents, anything not listed.

**For each adapter, document:**
- Install check command (e.g. `which claude`)
- How to send a message (stdin? special key sequence?)
- How to detect ready state (prompt string? timeout?)
- Known output quirks

#### 2.5 Agent Panel UI

Each workspace has one active agent. The Agent Panel replaces Terax's AI panel for CLI agents.

Layout:
```
┌─────────────────────────────────────┐
│ [Claude Code ▾]  ● READY   [⏹] [⚙] │  ← agent selector, status, stop, settings
├─────────────────────────────────────┤
│                                     │
│  > Claude Code initialized          │
│                                     │
│  You: refactor auth.rs to use       │
│       the new token validator       │
│                                     │
│  Claude Code: I'll refactor the     │
│  authentication module...           │
│                                     │
│  📄 src/auth.rs  [view diff]        │  ← file change card
│  📄 src/token.rs [view diff]        │
│                                     │
│  ✓ Done. 2 files modified.          │
│                                     │
├─────────────────────────────────────┤
│  [Type a message...]        [Send]  │
└─────────────────────────────────────┘
```

Agent selector dropdown shows: installed agents (green dot) and available but not installed agents (grey, with install instructions).

#### 2.6 File Change Visualization

When an agent modifies files:
- File explorer badge shows modified count
- Editor automatically reloads modified files (with confirmation if unsaved changes exist)
- "View Diff" card in AI panel opens a side-by-side diff using CodeMirror's merge view
- "Accept" / "Reject" buttons on each diff (where supported by the agent)

File watching: use the Rust `notify` crate (add to `Cargo.toml`). Debounce 100ms. Emit `Tauri::Event` → frontend subscribes with `listen()`.

#### 2.7 Agent Process Lifecycle Handling

Handle every state transition explicitly:

| Event | Action |
|-------|--------|
| Workspace open | If agent configured → spawn (SPAWNING → READY) |
| Workspace close | Stop agent gracefully (STOPPING → STOPPED) |
| Agent crashes | Show error banner, offer restart (ERROR) |
| App quit | Kill all agent PTYs cleanly |
| Agent hangs (timeout) | Offer "Force stop" after 30s |
| Agent not installed | Show install instructions, block spawn |

**Done when:** You can type a prompt in the Nova AI Panel for workspace 1 (Claude Code), watch it work, see file changes reflected in the editor — while workspace 2 runs OpenCode independently.

---

### Phase 3: IDE Features (Week 10–12)

**Goal:** Make Nova a complete IDE that doesn't require VSCode open alongside it.

These extend Terax's existing modules — don't rewrite, extend.

#### 3.1 File Explorer Enhancements

Terax already has a file explorer. Extend it:

- [ ] Show agent-modified file badges (from Phase 2 file watching)
- [ ] Git status indicators (M = modified, U = untracked, A = added) — requires `git.rs`
- [ ] Right-click context menu: New File, New Folder, Rename, Delete, Copy Path, Reveal in Finder
- [ ] Drag-and-drop to move files (with Rust `fs::mutate` backend)
- [ ] Show/hide hidden files toggle (`Cmd+Shift+.`)

#### 3.2 Editor Enhancements

Terax already has CodeMirror 6. Extend it:

- [ ] Multi-file tab support (Terax has tab system, extend to support multiple editor tabs per workspace)
- [ ] Dirty indicator (● in tab when unsaved)
- [ ] Auto-save on focus loss (configurable, default off)
- [ ] Breadcrumb path display
- [ ] Go to line (`Ctrl+G`)
- [ ] Find/replace within file (`Ctrl+H`)

#### 3.3 Terminal Enhancements

Terax already has multi-tab terminals. Extend:

- [ ] Terminal profile names (rename tabs: "dev server", "tests", "git")
- [ ] Quick terminal toggle (`Ctrl+\``)
- [ ] Split terminal in workspace layout (separate from workspace split)

#### 3.4 Global Search

- [ ] Fuzzy file search across workspace root: `Ctrl+P`
- [ ] Content search via ripgrep: `Ctrl+Shift+F`
  - Add `rg` invocation in Rust via `shell_run_command`
  - Stream results back as they arrive
  - Click result → open file at line in editor
- [ ] Command palette: `Ctrl+Shift+P` (list all shortcuts, workspace actions, agent commands)

#### 3.5 Git Integration (Lightweight)

Add `git.rs` to Tauri backend. Use `git2` crate (pure Rust, no git binary dependency).

Essential only:
- [ ] Git status sidebar (list of M/U/A files)
- [ ] Stage + commit UI
- [ ] Current branch in status bar
- [ ] Inline diff in editor gutter

Defer to Phase 5: full git log, merge conflict UI, branch switcher.

**Done when:** You can open Nova, work on a project entirely inside it — browse files, edit code, run terminal commands, use an agent, and see git status — without needing VSCode or a separate terminal.

---

### Phase 4: Polish & Reliability (Week 13–14)

**Goal:** Make it fast, stable, and something you actually want to use every day.

#### 4.1 Performance

- [ ] Benchmark: startup time with 0 workspaces, 1, 3 (target: <2s cold, <500ms restore)
- [ ] Benchmark: memory with 3 workspaces open (target: <400MB)
- [ ] Lazy workspace loading: only active workspace is fully rendered, others are suspended after 60s of inactivity
- [ ] Virtual scroll in file explorer for repos with >1000 files
- [ ] Debounced file watching (100ms) — already planned in Phase 2, verify under load

#### 4.2 Reliability

- [ ] Crash recovery: restore all workspaces on next launch even after unexpected quit
- [ ] Agent crash recovery: auto-restart with exponential backoff (1s, 2s, 4s, max 30s)
- [ ] Error boundaries around each panel — one panel crash doesn't kill the workspace
- [ ] Graceful PTY cleanup on window close event
- [ ] "Something went wrong" fallback UI per panel with recovery action

#### 4.3 UX Refinements

- [ ] Onboarding: first-launch wizard — open a folder, pick an agent, get started
- [ ] Agent not installed: helpful error with exact install command (e.g. `npm i -g @anthropic-ai/claude-code`)
- [ ] Empty state for new workspace: "Open a folder to get started" with a folder icon
- [ ] Keyboard shortcut reference: `Ctrl+?` opens cheatsheet
- [ ] Settings page: agents config, default shell, theme, keymap

---

### Phase 5: Advanced (Future / Backlog)

Don't build these until Phase 4 is complete and you use Nova daily.

- [ ] Git log / history viewer
- [ ] Merge conflict resolver
- [ ] LSP integration (go-to-definition, autocomplete, diagnostics) via `tower-lsp` in Rust
- [ ] Remote development (SSH into server)
- [ ] Multi-agent mode (send same prompt to 2 agents, compare output)
- [ ] Plugin/extension system
- [ ] Docker integration (view container logs, exec into container)
- [ ] Built-in HTTP client
- [ ] Ollama integration (run local models)

---

## Key Technical Decisions

### CLI Agent Communication

**Decision: Hidden PTY sessions, not pipes.**

Use Tauri's existing `portable-pty` infrastructure. Spawn agents as PTY subprocesses (not plain stdio pipes) because:
- Many CLI agents (Claude Code, Aider) behave differently or break without a TTY
- PTY gives you proper terminal emulation for agents that use ANSI codes for progress indicators
- Already battle-tested in Terax — no new Rust crates needed

**Trade-off:** Output parsing is harder (ANSI escape sequences to strip). Mitigate with a test harness of recorded sessions.

### Workspace Isolation Strategy

**Decision: Multiple store instances, single Zustand root.**

Each workspace gets scoped store slices, not separate Zustand instances. The workspace ID prefixes all PTY session IDs, all storage keys, and all event listeners. This is simpler than separate stores and avoids React context hell.

### File Watching

**Decision: Rust `notify` crate, frontend debounce.**

Add `notify = "6"` to `Cargo.toml`. Watch `workspace.root` recursively. Emit `tauri::Emitter::emit()` events. Frontend listens with `listen("file-changed", ...)` and debounces 100ms before updating file explorer and editor reload prompts.

**Skip** for Phase 2 if it blocks agent integration. Use a polling fallback (every 2s) as temporary measure.

### Output Parsing Architecture

**Decision: Per-agent stateful parsers with recording-based tests.**

Never parse live agent output without a test suite. Workflow:
1. Record a real session: `tee recording.txt` piped through the PTY
2. Write parser against the recording file
3. Tests run offline, no agent needed
4. Parser handles: message boundaries, file change notifications, error states, ready-state detection

Acceptable to ship an agent adapter that surfaces raw text if the parser isn't ready — better than nothing.

---

## Success Metrics

These are measurable. Check them at the end of each phase.

| Metric | Target | When |
|--------|--------|------|
| Startup time (cold) | < 2 seconds | Phase 4 |
| Memory (3 workspaces) | < 400MB | Phase 4 |
| Binary size | < 15MB | Phase 4 |
| Supported CLI agents | 5+ | Phase 2 |
| Workspace switch time | < 100ms | Phase 1 |
| Agent spawn time | < 3s | Phase 2 |
| Works offline (local agents) | Yes | Phase 2 |
| Zero accounts required | Always | Always |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Agent output parsing breaks on agent updates | High | High | Test harness with recordings, version detection, raw-text fallback |
| Memory exceeds limits with 3+ workspaces | Medium | High | Benchmark early (Phase 1), add workspace suspension in Phase 4 |
| PTY not working on Windows | Medium | Medium | Test on Windows in Phase 0, document platform requirements |
| Agent process leaks on crash | Medium | Medium | Rust `Drop` implementation cleans PTY on panic, test crash scenarios |
| Scope creep from Phase 5 wishlist | High | High | Finish Phase 4 before opening Phase 5 items |
| Terax's AI panel conflicts with CLI agent panel | Low | Medium | CLI agents replace the AI panel for that workspace — they're not additive |

---

## Dev Commands

```bash
# Setup
pnpm install
pnpm tauri dev          # development with hot reload

# Type checking
pnpm exec tsc --noEmit  # frontend
cd src-tauri && cargo check   # Rust
cd src-tauri && cargo clippy  # Rust lint

# Build
pnpm tauri build        # production bundle

# When adding a new Tauri plugin:
# 1. Add to src-tauri/Cargo.toml
# 2. Add .plugin(...) to lib.rs builder
# 3. Add capability entry to src-tauri/capabilities/default.json
```

---

## Build Order (Concrete Next Steps)

1. **Today:** Fork terax-ai, set up local dev, run `pnpm tauri dev` successfully
2. **This week:** Read all of Terax's modules, benchmark baseline, create new folder structure
3. **Week 2:** Implement `workspaceStore.ts`, `WorkspaceShell.tsx`, `WorkspaceTabs.tsx` — get 2 Terax instances running side-by-side
4. **Week 3:** Add workspace switcher, persistence, layout presets
5. **Week 4:** Define `AgentAdapter` interface, add `agent_pty_open` Rust command, build test harness
6. **Week 5–6:** Build Claude Code adapter + parser, get it working in the AI panel
7. **Week 7:** Build OpenCode adapter, GenericCLIAdapter
8. **Week 8:** File change visualization, diff viewer
9. **Week 9:** Buffer for agent parsing bugs (you'll need it)
10. **Week 10+:** Phase 3 IDE features, Phase 4 polish

---

## What Makes Nova Different

| | VSCode + Claude Code | Cursor | Nova |
|---|---|---|---|
| Multiple projects simultaneously | ❌ (separate windows) | ❌ | ✅ |
| Any CLI agent, no lock-in | ❌ | ❌ | ✅ |
| Unified workspace view | ❌ | ❌ | ✅ |
| Lightweight (< 15MB) | ❌ (200MB+) | ❌ (300MB+) | ✅ |
| No accounts required | ⚠️ (optional) | ❌ | ✅ |
| CLI-first workflow | ⚠️ | ⚠️ | ✅ |
| Custom agent support | ❌ | ❌ | ✅ |

---

*Last updated: 2026-05-16*
*Based on Terax AI v0.5.9 — https://github.com/crynta/terax-ai*
