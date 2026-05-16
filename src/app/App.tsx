import { WorkspaceTabs, WorkspaceShell, useWorkspaceStore } from '@/modules/workspace';
import { ThemeProvider } from '@/modules/theme';
import { useEffect } from 'react';

export default function App() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);

  // Auto-create a default workspace on first launch
  useEffect(() => {
    if (workspaces.length === 0) {
      // Don't auto-create — let user choose their folder
    }
  }, [workspaces.length, createWorkspace]);

  return (
    <ThemeProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        <WorkspaceTabs />
        <div className="min-h-0 flex-1">
          {workspaces.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <div className="text-center">
                <p className="text-lg font-medium">Welcome to Nova</p>
                <p className="mt-1 text-sm">Open a folder to get started</p>
              </div>
            </div>
          ) : (
            workspaces.map((ws) => (
              <WorkspaceShell
                key={ws.id}
                workspaceId={ws.id}
                active={ws.id === activeWorkspaceId}
              />
            ))
          )}
        </div>
      </div>
    </ThemeProvider>
  );
}
