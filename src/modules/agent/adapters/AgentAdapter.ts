export type AgentLifecycle =
  | 'UNSET'
  | 'SPAWNING'
  | 'READY'
  | 'RUNNING'
  | 'PAUSED'
  | 'STOPPING'
  | 'STOPPED'
  | 'ERROR';

export interface AgentMessage {
  id: string;
  role: 'agent' | 'user' | 'system' | 'tool';
  content: string;
  raw?: string;
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
  ptyId: string;
}

export interface AgentInfo {
  id: string;
  name: string;
  command: string;
  installed: boolean;
  version: string | null;
}

export interface AgentAdapter {
  id: string;
  name: string;
  command: string;
  isInstalled(): Promise<boolean>;
  spawn(config: AgentConfig): Promise<AgentSession>;
  sendMessage(session: AgentSession, message: string): Promise<void>;
  onMessage(
    session: AgentSession,
    cb: (msg: AgentMessage) => void,
  ): () => void;
  onLifecycleChange(
    session: AgentSession,
    cb: (lc: AgentLifecycle) => void,
  ): () => void;
  onFileChange(
    session: AgentSession,
    cb: (change: FileChange) => void,
  ): () => void;
  pause(session: AgentSession): Promise<void>;
  resume(session: AgentSession): Promise<void>;
  stop(session: AgentSession): Promise<void>;
}
