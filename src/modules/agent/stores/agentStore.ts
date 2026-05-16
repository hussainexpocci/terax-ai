import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import type {
  AgentConfig,
  AgentInfo,
  AgentLifecycle,
  AgentMessage,
  AgentSession,
} from '../adapters/AgentAdapter';
import { createAgentAdapter } from '../adapters/GenericCLIAdapter';

type AgentSessionState = {
  session: AgentSession | null;
  messages: AgentMessage[];
  lifecycle: AgentLifecycle;
  error: string | null;
};

type State = {
  agents: AgentInfo[];
  agentsLoading: boolean;
  sessions: Record<string, AgentSessionState>;
  refreshAgents: () => Promise<void>;
  spawnAgent: (
    workspaceId: string,
    agentId: string,
    config: AgentConfig,
  ) => Promise<AgentSession | null>;
  sendMessage: (workspaceId: string, message: string) => Promise<void>;
  stopAgent: (workspaceId: string) => Promise<void>;
  getSession: (workspaceId: string) => AgentSessionState | undefined;
  clearSession: (workspaceId: string) => void;
};

const activeAdapters = new Map<string, {
  stop: () => void;
}>();

export const useAgentStore = create<State>((set, get) => ({
  agents: [],
  agentsLoading: false,
  sessions: {},

  refreshAgents: async () => {
    set({ agentsLoading: true });
    try {
      const agents = await invoke<AgentInfo[]>('agent_list_installed');
      set({ agents, agentsLoading: false });
    } catch {
      set({ agents: [], agentsLoading: false });
    }
  },

  spawnAgent: async (workspaceId: string, agentId: string, config: AgentConfig) => {
    const existing = get().sessions[workspaceId];
    if (existing?.session) {
      await get().stopAgent(workspaceId);
    }

    const adapter = createAgentAdapter(agentId);
    if (!adapter) {
      set({
        sessions: {
          ...get().sessions,
          [workspaceId]: {
            session: null,
            messages: [],
            lifecycle: 'ERROR',
            error: `Unknown agent: ${agentId}`,
          },
        },
      });
      return null;
    }

    const sessionState: AgentSessionState = {
      session: null,
      messages: [],
      lifecycle: 'SPAWNING',
      error: null,
    };

    set((s) => ({
      sessions: { ...s.sessions, [workspaceId]: sessionState },
    }));

    try {
      const session = await adapter.spawn({
        workspaceRoot: config.workspaceRoot,
        shell: config.shell,
        env: config.env,
      });

      const cleanup = adapter.onMessage(session, (msg: AgentMessage) => {
        set((s) => {
          const sess = s.sessions[workspaceId];
          if (!sess) return s;
          return {
            sessions: {
              ...s.sessions,
              [workspaceId]: {
                ...sess,
                messages: [...sess.messages, msg],
              },
            },
          };
        });
      });

      adapter.onLifecycleChange(session, (lc: AgentLifecycle) => {
        set((s) => {
          const sess = s.sessions[workspaceId];
          if (!sess) return s;
          return {
            sessions: {
              ...s.sessions,
              [workspaceId]: {
                ...sess,
                lifecycle: lc,
                session: { ...sess.session!, lifecycle: lc },
              },
            },
          };
        });
      });

      activeAdapters.set(workspaceId, {
        stop: () => {
          cleanup();
        },
      });

      set((s) => ({
        sessions: {
          ...s.sessions,
          [workspaceId]: {
            ...s.sessions[workspaceId]!,
            session,
          },
        },
      }));

      return session;
    } catch (e) {
      const error = String(e);
      set((s) => ({
        sessions: {
          ...s.sessions,
          [workspaceId]: {
            session: null,
            messages: [],
            lifecycle: 'ERROR',
            error,
          },
        },
      }));
      return null;
    }
  },

  sendMessage: async (workspaceId: string, message: string) => {
    const sess = get().sessions[workspaceId];
    if (!sess?.session) return;

    const userMsg: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };

    set((s) => ({
      sessions: {
        ...s.sessions,
        [workspaceId]: {
          ...s.sessions[workspaceId]!,
          messages: [...s.sessions[workspaceId]!.messages, userMsg],
          lifecycle: 'RUNNING',
        },
      },
    }));

    const adapter = createAgentAdapter(
      get().agents.find((a) => a.installed)?.id ?? 'claude-code',
    );
    if (!adapter) return;

    try {
      await adapter.sendMessage(sess.session, message);
    } catch (e) {
      set((s) => ({
        sessions: {
          ...s.sessions,
          [workspaceId]: {
            ...s.sessions[workspaceId]!,
            lifecycle: 'ERROR',
            error: String(e),
          },
        },
      }));
    }
  },

  stopAgent: async (workspaceId: string) => {
    const sess = get().sessions[workspaceId];
    if (!sess?.session) return;

    set((s) => ({
      sessions: {
        ...s.sessions,
        [workspaceId]: {
          ...s.sessions[workspaceId]!,
          lifecycle: 'STOPPING',
        },
      },
    }));

    const cleanup = activeAdapters.get(workspaceId);
    if (cleanup) {
      cleanup.stop();
      activeAdapters.delete(workspaceId);
    }

    try {
      await invoke('agent_pty_close', { id: sess.session.id });
    } catch {
      // Already closed
    }
  },

  getSession: (workspaceId: string) => get().sessions[workspaceId],

  clearSession: (workspaceId: string) => {
    set((s) => {
      const next = { ...s.sessions };
      delete next[workspaceId];
      return { sessions: next };
    });
  },
}));
