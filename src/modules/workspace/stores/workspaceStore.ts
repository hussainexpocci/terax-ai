import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface WorkspaceConfig {
  name: string;
  root: string;
  agent?: string;
  shell?: string;
  layout?: string;
}

export interface PersistedWorkspace {
  id: string;
  name: string;
  root: string;
  agent?: string;
  layout?: string;
}

interface WorkspaceState {
  id: string;
  name: string;
  root: string;
  config: WorkspaceConfig;
  agentState: 'UNSET' | 'SPAWNING' | 'READY' | 'RUNNING' | 'STOPPED' | 'ERROR';
}

interface WorkspaceStoreState {
  workspaces: WorkspaceState[];
  activeWorkspaceId: string | null;
  nextId: number;
  createWorkspace: (root: string, name?: string) => string;
  removeWorkspace: (id: string) => void;
  setActiveWorkspace: (id: string) => void;
  updateWorkspaceConfig: (id: string, config: Partial<WorkspaceConfig>) => void;
  setWorkspaceAgentState: (id: string, state: WorkspaceState['agentState']) => void;
  getWorkspace: (id: string) => WorkspaceState | undefined;
  activeWorkspace: () => WorkspaceState | undefined;
}

function generateId(): string {
  return `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultName(root: string): string {
  const parts = root.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] ?? 'Untitled';
}

export const useWorkspaceStore = create<WorkspaceStoreState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      activeWorkspaceId: null,
      nextId: 1,

      createWorkspace: (root: string, name?: string) => {
        const id = generateId();
        const wsName = name ?? defaultName(root);
        const workspace: WorkspaceState = {
          id,
          name: wsName,
          root,
          config: { name: wsName, root },
          agentState: 'UNSET',
        };
        set((s) => ({
          workspaces: [...s.workspaces, workspace],
          activeWorkspaceId: id,
          nextId: s.nextId + 1,
        }));
        return id;
      },

      removeWorkspace: (id: string) => {
        set((s) => {
          const remaining = s.workspaces.filter((w) => w.id !== id);
          let newActive = s.activeWorkspaceId;
          if (newActive === id) {
            newActive = remaining.length > 0 ? remaining[0].id : null;
          }
          return {
            workspaces: remaining,
            activeWorkspaceId: newActive,
          };
        });
      },

      setActiveWorkspace: (id: string) => {
        set({ activeWorkspaceId: id });
      },

      updateWorkspaceConfig: (id: string, config: Partial<WorkspaceConfig>) => {
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === id ? { ...w, config: { ...w.config, ...config } } : w,
          ),
        }));
      },

      setWorkspaceAgentState: (id: string, state: WorkspaceState['agentState']) => {
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === id ? { ...w, agentState: state } : w,
          ),
        }));
      },

      getWorkspace: (id: string) => {
        return get().workspaces.find((w) => w.id === id);
      },

      activeWorkspace: () => {
        const { workspaces, activeWorkspaceId } = get();
        return workspaces.find((w) => w.id === activeWorkspaceId);
      },
    }),
    {
      name: 'nova-workspaces',
      partialize: (state) => ({
        workspaces: state.workspaces.map((w) => ({
          id: w.id,
          name: w.name,
          root: w.root,
          agent: w.config.agent,
          layout: w.config.layout,
        })) as PersistedWorkspace[],
        activeWorkspaceId: state.activeWorkspaceId,
        nextId: state.nextId,
      }),
      merge: (persisted, currentState) => {
        const p = persisted as {
          workspaces: PersistedWorkspace[];
          activeWorkspaceId: string | null;
          nextId: number;
        };
        const workspaces: WorkspaceState[] = (p.workspaces ?? []).map((w) => ({
          id: w.id,
          name: w.name,
          root: w.root,
          config: {
            name: w.name,
            root: w.root,
            agent: w.agent,
            layout: w.layout,
          },
          agentState: 'UNSET',
        }));
        return {
          ...currentState,
          workspaces,
          activeWorkspaceId: p.activeWorkspaceId,
          nextId: p.nextId ?? workspaces.length + 1,
        };
      },
    },
  ),
);
