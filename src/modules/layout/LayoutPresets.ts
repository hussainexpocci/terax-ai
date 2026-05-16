export type LayoutPreset =
  | 'ai-terminal'
  | 'ai-editor'
  | 'ai-editor-terminal'
  | 'full-ide'
  | 'focus';

export interface LayoutConfig {
  preset: LayoutPreset;
  sizes: Record<string, number>;
}

export const LAYOUT_PRESETS: Record<LayoutPreset, { label: string; panels: { id: string; defaultSize: number }[] }> = {
  'ai-terminal': {
    label: 'AI + Terminal',
    panels: [
      { id: 'ai', defaultSize: 60 },
      { id: 'terminal', defaultSize: 40 },
    ],
  },
  'ai-editor': {
    label: 'AI + Editor',
    panels: [
      { id: 'ai', defaultSize: 40 },
      { id: 'editor', defaultSize: 60 },
    ],
  },
  'ai-editor-terminal': {
    label: 'AI + Editor + Terminal',
    panels: [
      { id: 'ai', defaultSize: 35 },
      { id: 'editor', defaultSize: 40 },
      { id: 'terminal', defaultSize: 25 },
    ],
  },
  'full-ide': {
    label: 'Full IDE',
    panels: [
      { id: 'explorer', defaultSize: 15 },
      { id: 'editor', defaultSize: 50 },
      { id: 'terminal', defaultSize: 20 },
      { id: 'ai', defaultSize: 15 },
    ],
  },
  'focus': {
    label: 'Focus',
    panels: [
      { id: 'ai', defaultSize: 100 },
    ],
  },
};
