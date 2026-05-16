import type { AgentLifecycle } from './adapters/AgentAdapter';

interface AgentStatusIndicatorProps {
  lifecycle: AgentLifecycle;
}

const STATUS_CONFIG: Record<AgentLifecycle, { color: string; label: string }> = {
  UNSET: { color: 'bg-gray-400', label: 'Not started' },
  SPAWNING: { color: 'bg-yellow-500', label: 'Spawning' },
  READY: { color: 'bg-green-500', label: 'Ready' },
  RUNNING: { color: 'bg-blue-500', label: 'Running' },
  PAUSED: { color: 'bg-orange-500', label: 'Paused' },
  STOPPING: { color: 'bg-yellow-500', label: 'Stopping' },
  STOPPED: { color: 'bg-gray-500', label: 'Stopped' },
  ERROR: { color: 'bg-red-500', label: 'Error' },
};

export function AgentStatusIndicator({
  lifecycle,
}: AgentStatusIndicatorProps) {
  const config = STATUS_CONFIG[lifecycle];
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className={`h-2 w-2 rounded-full ${config.color}`} />
      <span className="text-muted-foreground">{config.label}</span>
    </div>
  );
}
