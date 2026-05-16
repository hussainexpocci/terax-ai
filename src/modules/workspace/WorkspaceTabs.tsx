import { useCallback } from 'react';
import { useWorkspaceStore } from './stores/workspaceStore';
import { Button } from '@/components/ui/button';
import { FolderOpenIcon, Add01Icon, Delete01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { open } from '@tauri-apps/plugin-dialog';
import { cn } from '@/lib/utils';

export function WorkspaceTabs() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setActive = useWorkspaceStore((s) => s.setActiveWorkspace);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace);

  const handleOpenFolder = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Open Workspace Folder',
    });
    if (selected) {
      createWorkspace(selected as string);
    }
  }, [createWorkspace]);

  const handleAddWorkspace = useCallback(async () => {
    await handleOpenFolder();
  }, [handleOpenFolder]);

  const handleClose = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      removeWorkspace(id);
    },
    [removeWorkspace],
  );

  if (workspaces.length === 0) {
    return (
      <div className="flex items-center gap-2 border-b border-border/60 bg-card px-3 py-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => void handleOpenFolder()}
        >
          <HugeiconsIcon icon={FolderOpenIcon} className="h-3.5 w-3.5" />
          Open Folder
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 border-b border-border/60 bg-card px-2 py-1">
      <div className="flex items-center gap-1 overflow-x-auto">
        {workspaces.map((ws) => (
          <button
            key={ws.id}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors',
              ws.id === activeId
                ? 'bg-primary/10 text-foreground'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            )}
            onClick={() => setActive(ws.id)}
          >
            <HugeiconsIcon icon={FolderOpenIcon} className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-[120px] truncate">{ws.name}</span>
            <span
              className="ml-1 flex h-4 w-4 items-center justify-center rounded-sm hover:bg-destructive/20 hover:text-destructive"
              onClick={(e) => handleClose(e, ws.id)}
            >
              <HugeiconsIcon icon={Delete01Icon} className="h-3 w-3" />
            </span>
          </button>
        ))}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="ml-1 h-7 w-7 shrink-0 p-0"
        onClick={() => void handleAddWorkspace()}
      >
        <HugeiconsIcon icon={Add01Icon} className="h-4 w-4" />
      </Button>
    </div>
  );
}
