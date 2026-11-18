import type { Block } from './model';

export type EditorSelection = { id: string; start: number; end: number };
export type EditorCheckpoint = { blocks: Block[]; selection: EditorSelection };
export type EditorHistory = {
  past: EditorCheckpoint[];
  future: EditorCheckpoint[];
  lastTyping?: { id: string; at: number };
};
export type EditOrigin = { kind: 'typing'; id: string } | { kind: 'command' };

export function recordEditorEdit(history: EditorHistory, before: EditorCheckpoint, origin: EditOrigin, now: number): EditorHistory {
  const grouped = origin.kind === 'typing' && history.lastTyping?.id === origin.id &&
    now >= history.lastTyping.at && now - history.lastTyping.at < 850 && history.past.length > 0;
  return {
    past: grouped ? history.past : [...history.past, before].slice(-100),
    future: [],
    lastTyping: origin.kind === 'typing' ? { id: origin.id, at: now } : undefined,
  };
}

export function travelEditorHistory(history: EditorHistory, current: EditorCheckpoint, direction: 'undo' | 'redo'):
  { history: EditorHistory; checkpoint: EditorCheckpoint } | null {
  if (direction === 'undo') {
    if (!history.past.length) return null;
    return {
      checkpoint: history.past[history.past.length - 1],
      history: { past: history.past.slice(0, -1), future: [...history.future, current], lastTyping: undefined },
    };
  }
  if (!history.future.length) return null;
  return {
    checkpoint: history.future[history.future.length - 1],
    history: { past: [...history.past, current].slice(-100), future: history.future.slice(0, -1), lastTyping: undefined },
  };
}
