import { useEffect, useRef, useState } from 'react';
import { useAgentStore } from './stores/agentStore';
import { AgentSelector } from './AgentSelector';
import { AgentStatusIndicator } from './AgentStatusIndicator';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HugeiconsIcon } from '@hugeicons/react';
import { SentIcon, StopIcon } from '@hugeicons/core-free-icons';

interface AgentPanelProps {
  workspaceId: string;
  workspaceRoot: string;
  shell: string;
}

export function AgentPanel({
  workspaceId,
  workspaceRoot,
  shell,
}: AgentPanelProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const refreshAgents = useAgentStore((s) => s.refreshAgents);
  const agents = useAgentStore((s) => s.agents);
  const sessionState = useAgentStore((s) => s.getSession(workspaceId));
  const spawnAgent = useAgentStore((s) => s.spawnAgent);
  const sendMessage = useAgentStore((s) => s.sendMessage);
  const stopAgent = useAgentStore((s) => s.stopAgent);
  const [selectedAgentId, setSelectedAgentId] = useState('');

  useEffect(() => {
    void refreshAgents();
  }, [refreshAgents]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sessionState?.messages, sessionState?.lifecycle]);

  const handleSpawn = async () => {
    if (!selectedAgentId) return;
    const agent = agents.find((a) => a.id === selectedAgentId);
    if (!agent?.installed) return;

    await spawnAgent(workspaceId, selectedAgentId, {
      workspaceRoot,
      shell,
      env: {},
    });
  };

  const handleSend = async () => {
    if (!input.trim() || !sessionState?.session) return;
    const msg = input.trim();
    setInput('');
    await sendMessage(workspaceId, msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const isRunning =
    sessionState?.lifecycle === 'RUNNING' ||
    sessionState?.lifecycle === 'SPAWNING';

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <AgentSelector
          agents={agents}
          selectedId={selectedAgentId}
          onSelect={setSelectedAgentId}
        />
        <AgentStatusIndicator
          lifecycle={sessionState?.lifecycle ?? 'UNSET'}
        />
        <div className="flex-1" />
        {sessionState?.session && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => void stopAgent(workspaceId)}
          >
            <HugeiconsIcon icon={StopIcon} className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Messages / Output */}
      <ScrollArea className="flex-1 px-3 py-2" ref={scrollRef}>
        {!sessionState?.session && sessionState?.lifecycle === 'UNSET' && (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-sm">Select an agent to get started</p>
              <p className="mt-1 text-xs">
                Choose from the dropdown above and click spawn
              </p>
            </div>
          </div>
        )}

        {sessionState && (
          <div className="space-y-2">
            {sessionState.messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-md px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-primary/10 text-foreground'
                    : msg.role === 'system'
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-muted/50 text-muted-foreground'
                }`}
              >
                <span className="font-medium">{msg.role}: </span>
                {msg.content}
              </div>
            ))}

            {sessionState.error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Error: {sessionState.error}
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border/60 p-3">
        {!sessionState?.session && sessionState?.lifecycle !== 'SPAWNING' ? (
          <Button
            className="w-full"
            onClick={() => void handleSpawn()}
            disabled={!selectedAgentId || isRunning}
          >
            {isRunning ? 'Spawning...' : 'Spawn Agent'}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="min-h-[40px] resize-none"
              disabled={!sessionState?.session || isRunning}
            />
            <Button
              size="icon"
              onClick={() => void handleSend()}
              disabled={!input.trim() || !sessionState?.session || isRunning}
            >
              <HugeiconsIcon icon={SentIcon} className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
