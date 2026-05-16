import { invoke, Channel } from '@tauri-apps/api/core';
import type {
  AgentAdapter,
  AgentConfig,
  AgentInfo,
  AgentLifecycle,
  AgentMessage,
  AgentSession,
  FileChange,
} from './AgentAdapter';

/**
 * Strips ANSI escape sequences from terminal output.
 * PTY output contains color codes, cursor movements, etc.
 * We need clean text for parsing.
 */
function stripAnsi(raw: string): string {
  return raw
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b\^[^\x1b]*\x1b\\/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

/**
 * Detects if a CLI agent is likely "ready for input" based on output patterns.
 * Different agents use different prompts/indicators.
 */
function detectReadyState(output: string, readyPatterns: RegExp[]): boolean {
  const clean = stripAnsi(output);
  const lines = clean.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return false;

  const lastLines = lines.slice(-3).join('\n');
  return readyPatterns.some((p) => p.test(lastLines));
}

/**
 * Detects if the agent is actively working/processing.
 */
function detectRunningState(output: string, runningPatterns: RegExp[]): boolean {
  const clean = stripAnsi(output);
  return runningPatterns.some((p) => p.test(clean));
}

/**
 * Extracts file change notifications from agent output.
 * Many agents announce file edits in a recognizable format.
 */
function extractFileChanges(output: string, filePatterns: RegExp[]): FileChange[] {
  const clean = stripAnsi(output);
  const changes: FileChange[] = [];
  const seen = new Set<string>();

  for (const pattern of filePatterns) {
    const matches = clean.matchAll(pattern);
    for (const match of matches) {
      const path = match[1];
      if (!path || seen.has(path)) continue;
      seen.add(path);
      changes.push({
        path,
        type: match[2] as FileChange['type'] ?? 'modified',
      });
    }
  }

  return changes;
}

/**
 * Generic CLI adapter configuration.
 * Allows users to define custom agents without writing code.
 */
export interface GenericAgentConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  readyPatterns?: RegExp[];
  runningPatterns?: RegExp[];
  filePatterns?: RegExp[];
  initialPrompt?: string;
}

/**
 * Default patterns for known agents.
 * These are starting points — they'll be refined with real recordings.
 */
const KNOWN_AGENT_PROFILES: Record<string, Omit<GenericAgentConfig, 'id' | 'name' | 'command'>> = {
  'claude-code': {
    args: [],
    readyPatterns: [
      />$/,
      /What do you want to do\?/,
      /Press Enter to continue/,
    ],
    runningPatterns: [
      /Thinking\.{3}/,
      /Working\.{3}/,
      /Writing to/,
      /Reading/,
      /Searching/,
    ],
    filePatterns: [
      /(?:Writing|Editing|Reading)\s+([^\s\n]+)/g,
      /(src\/[^\s\n]+\.\w+)/g,
    ],
  },
  opencode: {
    args: [],
    readyPatterns: [
      />$/,
      /Enter a message/,
      /What would you like to do\?/,
    ],
    runningPatterns: [
      /Thinking/,
      /Working/,
      /Processing/,
    ],
    filePatterns: [
      /(?:Creating|Editing|Writing)\s+([^\s\n]+)/g,
    ],
  },
  aider: {
    args: [],
    readyPatterns: [
      />\s*$/,
      /Use \/help/,
      /Add files with \/add/,
    ],
    runningPatterns: [
      /Aider v/,
      /Committed/,
      /Applied/,
    ],
    filePatterns: [
      /(?:Added|Modified|Created)\s+([^\s\n]+)/g,
    ],
  },
  'gemini-cli': {
    args: [],
    readyPatterns: [
      />$/,
      /Enter your prompt/,
    ],
    runningPatterns: [
      /Thinking/,
      /Processing/,
    ],
    filePatterns: [
      /(?:Writing|Editing)\s+([^\s\n]+)/g,
    ],
  },
};

export class GenericCLIAdapter implements AgentAdapter {
  id: string;
  name: string;
  command: string;
  private readyPatterns: RegExp[];
  private runningPatterns: RegExp[];
  private filePatterns: RegExp[];
  private initialPrompt?: string;
  private messageCallbacks = new Map<string, (msg: AgentMessage) => void>();
  private lifecycleCallbacks = new Map<string, (lc: AgentLifecycle) => void>();
  private fileChangeCallbacks = new Map<string, (change: FileChange) => void>();
  private rawBuffers = new Map<string, string>();
  private lastParsedLength = new Map<string, number>();

  constructor(config: GenericAgentConfig) {
    this.id = config.id;
    this.name = config.name;
    this.command = config.command;

    const profile = KNOWN_AGENT_PROFILES[config.id] ?? {};
    this.readyPatterns = config.readyPatterns ?? profile.readyPatterns ?? [/>$/];
    this.runningPatterns = config.runningPatterns ?? profile.runningPatterns ?? [];
    this.filePatterns = config.filePatterns ?? profile.filePatterns ?? [];
    this.initialPrompt = config.initialPrompt;
  }

  async isInstalled(): Promise<boolean> {
    try {
      const agents = await invoke<AgentInfo[]>('agent_list_installed');
      return agents.some((a) => a.command === this.command && a.installed);
    } catch {
      return false;
    }
  }

  async spawn(config: AgentConfig): Promise<AgentSession> {
    const dataChannel = new Channel<string>();
    const exitChannel = new Channel<number>();

    let lifecycle: AgentLifecycle = 'SPAWNING';
    const setLifecycle = (lc: AgentLifecycle) => {
      lifecycle = lc;
      this.lifecycleCallbacks.forEach((cb) => cb(lc));
    };

    const rawResult = await invoke<{ id: string; workspace_id: string; pty_id: number }>(
      'agent_pty_open',
      {
        config: {
          workspace_id: config.workspaceRoot,
          command: this.command,
          args: this.constructor === GenericCLIAdapter ? [] : [],
          cwd: config.workspaceRoot,
          env: config.env ?? {},
        },
        cols: 120,
        rows: 40,
        on_data: dataChannel,
        on_exit: exitChannel,
      },
    );

    const session: AgentSession = {
      id: rawResult.id,
      workspaceId: rawResult.workspace_id,
      lifecycle,
      ptyId: String(rawResult.pty_id),
    };

    this.rawBuffers.set(session.id, '');
    this.lastParsedLength.set(session.id, 0);

    dataChannel.onmessage = (data: string) => {
      const buffer = this.rawBuffers.get(session.id) ?? '';
      this.rawBuffers.set(session.id, buffer + data);

      const messages = this.parseNewOutput(session.id);
      for (const msg of messages) {
        this.messageCallbacks.forEach((cb) => cb(msg));
      }

      const fileChanges = this.extractNewFileChanges(session.id);
      for (const change of fileChanges) {
        this.fileChangeCallbacks.forEach((cb) => cb(change));
      }

      const fullOutput = this.rawBuffers.get(session.id) ?? '';
      if (lifecycle === 'SPAWNING' && detectReadyState(fullOutput, this.readyPatterns)) {
        setLifecycle('READY');
      } else if (lifecycle === 'READY' && detectRunningState(fullOutput, this.runningPatterns)) {
        setLifecycle('RUNNING');
      } else if (lifecycle === 'RUNNING' && detectReadyState(fullOutput, this.readyPatterns)) {
        setLifecycle('READY');
      }
    };

    exitChannel.onmessage = (code: number) => {
      setLifecycle(code === 0 ? 'STOPPED' : 'ERROR');
      this.rawBuffers.delete(session.id);
      this.lastParsedLength.delete(session.id);
    };

    setLifecycle('READY');

    if (this.initialPrompt) {
      await this.sendMessage(session, this.initialPrompt);
    }

    return session;
  }

  async sendMessage(session: AgentSession, message: string): Promise<void> {
    try {
      await invoke('agent_pty_write', {
        id: session.id,
        data: message + '\n',
      });
    } catch (e) {
      const errMsg = String(e);
      this.messageCallbacks.forEach((cb) =>
        cb({
          id: crypto.randomUUID(),
          role: 'system',
          content: `Failed to send message: ${errMsg}`,
          timestamp: Date.now(),
        }),
      );
    }
  }

  onMessage(session: AgentSession, cb: (msg: AgentMessage) => void): () => void {
    const key = `${session.id}:${crypto.randomUUID()}`;
    this.messageCallbacks.set(key, cb);
    return () => this.messageCallbacks.delete(key);
  }

  onLifecycleChange(
    session: AgentSession,
    cb: (lc: AgentLifecycle) => void,
  ): () => void {
    const key = `${session.id}:${crypto.randomUUID()}`;
    this.lifecycleCallbacks.set(key, cb);
    return () => this.lifecycleCallbacks.delete(key);
  }

  onFileChange(session: AgentSession, cb: (change: FileChange) => void): () => void {
    const key = `${session.id}:${crypto.randomUUID()}`;
    this.fileChangeCallbacks.set(key, cb);
    return () => this.fileChangeCallbacks.delete(key);
  }

  async pause(_session: AgentSession): Promise<void> {
    // PTY doesn't support pause natively; we'd need to send Ctrl+Z
    // For now, this is a no-op
  }

  async resume(_session: AgentSession): Promise<void> {
    // Resume with Ctrl+Z equivalent
  }

  async stop(session: AgentSession): Promise<void> {
    try {
      await invoke('agent_pty_close', { id: session.id });
    } catch {
      // Already closed or error
    }
  }

  /**
   * Parse only the new output since last parse.
   * Returns structured messages from the raw PTY stream.
   */
  private parseNewOutput(sessionId: string): AgentMessage[] {
    const buffer = this.rawBuffers.get(sessionId) ?? '';
    const lastLen = this.lastParsedLength.get(sessionId) ?? 0;

    if (buffer.length <= lastLen) return [];

    const newOutput = buffer.slice(lastLen);
    this.lastParsedLength.set(sessionId, buffer.length);

    const clean = stripAnsi(newOutput).trim();
    if (!clean) return [];

    return [
      {
        id: crypto.randomUUID(),
        role: 'agent',
        content: clean,
        raw: newOutput,
        timestamp: Date.now(),
      },
    ];
  }

  /**
   * Extract file changes from the full buffer.
   * Only returns new changes not yet reported.
   */
  private extractNewFileChanges(sessionId: string): FileChange[] {
    const buffer = this.rawBuffers.get(sessionId) ?? '';
    return extractFileChanges(buffer, this.filePatterns);
  }
}

/**
 * Factory function to create adapters for known agents.
 */
export function createAgentAdapter(agentId: string): GenericCLIAdapter | null {
  const profiles: Record<string, GenericAgentConfig> = {
    'claude-code': {
      id: 'claude-code',
      name: 'Claude Code',
      command: 'claude',
      ...KNOWN_AGENT_PROFILES['claude-code'],
    },
    opencode: {
      id: 'opencode',
      name: 'OpenCode',
      command: 'opencode',
      ...KNOWN_AGENT_PROFILES.opencode,
    },
    aider: {
      id: 'aider',
      name: 'Aider',
      command: 'aider',
      ...KNOWN_AGENT_PROFILES.aider,
    },
    'gemini-cli': {
      id: 'gemini-cli',
      name: 'Gemini CLI',
      command: 'gemini',
      ...KNOWN_AGENT_PROFILES['gemini-cli'],
    },
  };

  const profile = profiles[agentId];
  if (!profile) return null;

  return new GenericCLIAdapter(profile);
}
