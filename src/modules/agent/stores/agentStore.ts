import { invoke, Channel } from '@tauri-apps/api/core';
import { create } from 'zustand';
import type {
  AgentConfig,
  AgentInfo,
  AgentLifecycle,
  AgentMessage,
  AgentSession,
} from '../adapters/AgentAdapter';

type AgentSessionState = {
  session: AgentSession | null;
  messages: AgentMessage[];
  lifecycle: AgentLifecycle;
  error: string | null;
  rawData: string;
};

type State = {
  agents: AgentInfo[];
  agentsLoading: boolean;
  sessions: Record<string, AgentSessionState>;
  refreshAgents: () => Promise<void>;
  spawnAgent: (
    workspaceId: string,
    config: AgentConfig,
  ) => Promise<AgentSession | null>;
  sendMessage: (workspaceId: string, message: string) => Promise<void>;
  stopAgent: (workspaceId: string) => Promise<void>;
  getSession: (workspaceId: string) => AgentSessionState | undefined;
  clearSession: (workspaceId: string) => void;
};

export const useAgentStore = create<State>((set, get) => ({
  agents: [],
  agentsLoading: false,
  sessions: {},

  refreshAgents: async () => {
    set({ agentsLoading: true });
    try {
      const agents = await invoke<AgentInfo[]>('agent_list_installed');
      set({ agents, agentsLoading: false });
    } catch (e) {
      set({ agents: [], agentsLoading: false });
    }
  },

  spawnAgent: async (workspaceId: string, config: AgentConfig) => {
    const existing = get().sessions[workspaceId];
    if (existing?.session) {
      await get().stopAgent(workspaceId);
    }

    const sessionState: AgentSessionState = {
      session: null,
      messages: [],
      lifecycle: 'SPAWNING',
      error: null,
      rawData: '',
    };

    set((s) => ({
      sessions: { ...s.sessions, [workspaceId]: sessionState },
    }));

    try {
      const dataChannel = new Channel<string>();
      const exitChannel = new Channel<number>();

      let accumulatedRaw = '';

      dataChannel.onmessage = (data: string) => {
        accumulatedRaw += data;
        set((s) => {
          const sess = s.sessions[workspaceId];
          if (!sess) return s;
          return {
            sessions: {
              ...s.sessions,
              [workspaceId]: {
                ...sess,
                rawData: accumulatedRaw,
                lifecycle: sess.lifecycle === 'SPAWNING' ? 'READY' : sess.lifecycle,
              },
            },
          };
        });
      };

      exitChannel.onmessage = (code: number) => {
        set((s) => {
          const sess = s.sessions[workspaceId];
          if (!sess) return s;
          return {
            sessions: {
              ...s.sessions,
              [workspaceId]: {
                ...sess,
                lifecycle: code === 0 ? 'STOPPED' : 'ERROR',
              },
            },
          };
        });
      };

      const result = await invoke<AgentSession>('agent_pty_open', {
        config: {
          ...config,
          workspace_id: workspaceId,
        },
        cols: 120,
        rows: 40,
        on_data: dataChannel,
        on_exit: exitChannel,
      });

      set((s) => {
        const sess = s.sessions[workspaceId];
        if (!sess) return s;
        return {
          sessions: {
            ...s.sessions,
            [workspaceId]: {
              ...sess,
              session: result,
              lifecycle: 'READY',
            },
          },
        };
      });

      return result;
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
            rawData: '',
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

    try {
      await invoke('agent_pty_write', {
        id: sess.session.id,
        data: message + '\n',
      });
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

    try {
      await invoke('agent_pty_close', { id: sess.session.id });
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

  getSession: (workspaceId: string) => get().sessions[workspaceId],

  clearSession: (workspaceId: string) => {
    set((s) => {
      const next = { ...s.sessions };
      delete next[workspaceId];
      return { sessions: next };
    });
  },
}));
