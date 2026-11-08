export type Op = { insert: string | { divider: true }; attributes?: { header?: 1 | 2 | 3; list?: 'checked' | 'unchecked' } };
export type Note = { id: string; text: string; filename: string; customName?: string | null; content?: Op[]; [key: string]: unknown };
export type Workspace = { tabs: Note[]; activeId: string };
export type Block = { id: string; text: string; heading?: 1 | 2 | 3; list?: 'checked' | 'unchecked'; divider?: boolean };
export const noteName = (note: Note) => (typeof note.customName === 'string' && note.customName) || note.text.split(/\r?\n/, 1)[0].trim().slice(0, 80) || 'Untitled';
export const newNote = (id: string): Note => ({ id, text: '', filename: 'Untitled', customName: null });
export function validWorkspace(value: unknown): value is Workspace {
  const v = value as Workspace | null;
  return Boolean(v && Array.isArray(v.tabs) && v.tabs.length && v.tabs.every(note => note && typeof note.id === 'string' && typeof note.text === 'string' && typeof note.filename === 'string') && new Set(v.tabs.map(note => note.id)).size === v.tabs.length && typeof v.activeId === 'string');
}
export function safeOps(note: Note): Op[] | null {
  if (!Array.isArray(note.content)) return null;
  const ops: Op[] = [];
  for (const op of note.content) {
    if (!op) return null;
    if (typeof op.insert !== 'string') {
      if (!op.insert || op.insert.divider !== true || Object.keys(op.insert).length !== 1) return null;
      ops.push({ insert: { divider: true } }); continue;
    }
    const result: Op = { insert: op.insert };
    if ([1, 2, 3].includes(op.attributes?.header as number)) result.attributes = { header: op.attributes!.header };
    else if (['checked', 'unchecked'].includes(op.attributes?.list as string)) result.attributes = { list: op.attributes!.list };
    ops.push(result);
  }
  return ops.filter(op => typeof op.insert === 'string').map(op => op.insert).join('') === note.text + '\n' ? ops : null;
}
export function toBlocks(note: Note, id: () => string): Block[] {
  const ops = safeOps(note);
  if (!ops) return note.text.split('\n').map(text => ({ id: id(), text }));
  const blocks: Block[] = []; let text = '';
  for (const op of ops) {
    if (typeof op.insert !== 'string') { blocks.push({ id: id(), text: '', divider: true }); continue; }
    const lines = op.insert.split('\n');
    lines.forEach((line, i) => {
      text += line;
      if (i < lines.length - 1) { blocks.push({ id: id(), text, heading: op.attributes?.header, list: op.attributes?.list }); text = ''; }
    });
  }
  if (text || !blocks.length) blocks.push({ id: id(), text });
  return blocks;
}
export function fromBlocks(note: Note, blocks: Block[]): Note {
  const content: Op[] = [];
  const editable = blocks.length ? blocks : [{ id: 'empty', text: '' }];
  for (const block of editable) {
    if (block.divider) { content.push({ insert: { divider: true } }); continue; }
    if (block.text) content.push({ insert: block.text });
    const attributes = block.heading ? { header: block.heading } : block.list ? { list: block.list } : undefined;
    content.push(attributes ? { insert: '\n', attributes } : { insert: '\n' });
  }
  if (editable.at(-1)?.divider) content.push({ insert: '\n' });
  return { ...note, text: content.filter(op => typeof op.insert === 'string').map(op => op.insert).join('').slice(0, -1), content };
}
