import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AgentInfo } from './adapters/AgentAdapter';

interface AgentSelectorProps {
  agents: AgentInfo[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function AgentSelector({
  agents,
  selectedId,
  onSelect,
}: AgentSelectorProps) {
  return (
    <Select value={selectedId} onValueChange={onSelect}>
      <SelectTrigger className="h-7 w-[160px] text-xs">
        <SelectValue placeholder="Select agent" />
      </SelectTrigger>
      <SelectContent>
        {agents.map((agent) => (
          <SelectItem
            key={agent.id}
            value={agent.id}
            disabled={!agent.installed}
          >
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  agent.installed ? 'bg-green-500' : 'bg-gray-400'
                }`}
              />
              <span>{agent.name}</span>
              {agent.version && (
                <span className="text-muted-foreground">{agent.version}</span>
              )}
              {!agent.installed && (
                <span className="text-muted-foreground">(not installed)</span>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
