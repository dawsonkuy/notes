export type ListStyle = 'checked' | 'unchecked' | 'bullet' | 'ordered';
export type Op = { insert: string | { divider: true }; attributes?: { header?: 1 | 2 | 3; list?: ListStyle } };
export type Note = { id: string; text: string; filename: string; customName?: string | null; deletedAt?: string; content?: Op[]; [key: string]: unknown };
export type Workspace = { tabs: Note[]; activeId: string };
export type Block = { id: string; text: string; heading?: 1 | 2 | 3; list?: ListStyle; divider?: boolean };
export const noteName = (note: Note) => (typeof note.customName === 'string' && note.customName) || note.text.split(/\r?\n/, 1)[0].trim().slice(0, 80) || 'Untitled';
export const isTrashed = (note: Note) => typeof note.deletedAt === 'string' && note.deletedAt.length > 0;
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
    else if (['checked', 'unchecked', 'bullet', 'ordered'].includes(op.attributes?.list as string)) result.attributes = { list: op.attributes!.list };
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
export type ParagraphFocus = { id: string; start: number; end: number };
// Each mobile text field represents exactly one paragraph. Handle Return by
// creating a separate body paragraph instead of inserting a newline into a heading.
export function breakParagraph(blocks: Block[], id: string, selection: { start: number; end: number }, newId: () => string): { blocks: Block[]; focus: ParagraphFocus } | null {
  const index = blocks.findIndex(block => block.id === id && !block.divider);
  if (index < 0) return null;
  const block = blocks[index];
  const start = Math.max(0, Math.min(block.text.length, selection.start));
  const end = Math.max(start, Math.min(block.text.length, selection.end));
  if (block.list && !block.text) {
    return { blocks: blocks.map(item => item.id === id ? { ...item, list: undefined } : item), focus: { id, start: 0, end: 0 } };
  }
  if (block.heading) {
    const next = blocks[index + 1];
    // Insert Heading already creates a body block. Do not add a second empty
    // paragraph when Return is pressed at the end of the heading.
    if (next && !next.heading && !next.list && !next.divider &&
        (!block.text || (start === end && end === block.text.length && !next.text))) {
      return { blocks, focus: { id: next.id, start: 0, end: 0 } };
    }
  }
  // Lists continue in the same style; completed tasks create unchecked items.
  const nextBlock: Block = { id: newId(), text: block.text.slice(end), ...(block.list ? { list: block.list === 'checked' ? 'unchecked' as const : block.list } : {}) };
  return {
    blocks: [...blocks.slice(0, index), { ...block, text: block.text.slice(0, start) }, nextBlock, ...blocks.slice(index + 1)],
    focus: { id: nextBlock.id, start: 0, end: 0 }
  };
}
// Backspace at a paragraph's start first removes its formatting, then joins it.
export function joinBackward(blocks: Block[], id: string, selection: { start: number; end: number }): { blocks: Block[]; focus: ParagraphFocus } | null {
  const index = blocks.findIndex(block => block.id === id && !block.divider);
  if (index < 0 || selection.start !== 0 || selection.end !== 0) return null;
  const block = blocks[index];
  if (block.heading || block.list) return { blocks: blocks.map(item => item.id === id ? { ...item, heading: undefined, list: undefined } : item), focus: { id, start: 0, end: 0 } };
  if (index === 0) return null;
  const previous = blocks[index - 1];
  if (previous.divider) return { blocks: blocks.filter(item => item.id !== previous.id), focus: { id, start: 0, end: 0 } };
  return { blocks: blocks.filter(item => item.id !== id).map(item => item.id === previous.id ? { ...item, text: previous.text + block.text } : item), focus: { id: previous.id, start: previous.text.length, end: previous.text.length } };
}
// Normalize pasted line endings and keep the caret just after the inserted text.
export function replaceParagraphText(blocks: Block[], id: string, value: string, newId: () => string, selection?: { start: number; end: number }): { blocks: Block[]; focus?: ParagraphFocus } | null {
  const index = blocks.findIndex(block => block.id === id && !block.divider);
  if (index < 0) return null;
  const block = blocks[index], text = value.replace(/\r\n?/g, '\n');
  if (!text.includes('\n')) return { blocks: blocks.map(item => item.id === id ? { ...item, text } : item) };
  let prefix = 0, suffix = 0;
  while (prefix < block.text.length && prefix < text.length && block.text[prefix] === text[prefix]) prefix++;
  while (suffix < block.text.length - prefix && suffix < text.length - prefix && block.text.at(-1 - suffix) === text.at(-1 - suffix)) suffix++;
  let insertionEnd = text.length - suffix;
  if (selection && selection.start >= 0 && selection.end >= selection.start && selection.end <= block.text.length) {
    const before = block.text.slice(0, selection.start), after = block.text.slice(selection.end);
    if (text.startsWith(before) && text.endsWith(after) && text.length >= before.length + after.length) insertionEnd = text.length - after.length;
  }
  const inserted = text.slice(0, insertionEnd).split('\n');
  const replacement: Block[] = text.split('\n').map((line, i) => i === 0 ? { ...block, text: line } : { id: newId(), text: line, list: block.list === 'checked' ? 'unchecked' : block.list });
  const target = replacement[Math.min(inserted.length - 1, replacement.length - 1)], offset = inserted.at(-1)!.length;
  return { blocks: [...blocks.slice(0, index), ...replacement, ...blocks.slice(index + 1)], focus: { id: target.id, start: offset, end: offset } };
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
