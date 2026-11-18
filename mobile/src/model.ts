export type ListStyle = 'checked' | 'unchecked' | 'bullet' | 'ordered';
export type InlineStyle = { bold?: true; italic?: true; underline?: true };
export type InlineRun = InlineStyle & { text: string };
export type Op = { insert: string | { divider: true }; attributes?: { header?: 1 | 2 | 3; list?: ListStyle; bold?: boolean; italic?: boolean; underline?: boolean } };
export type Folder = { id: string; name: string; parentId?: string | null; order?: number; pinned?: boolean };
export type Note = { folderId?: string | null; order?: number; pinned?: boolean; sealed?: import('./security').Sealed; id: string; text: string; filename: string; customName?: string | null; deletedAt?: string; content?: Op[]; [key: string]: unknown };
export type Workspace = { folders?: Folder[]; tabs: Note[]; activeId: string };
export type Block = { id: string; text: string; heading?: 1 | 2 | 3; list?: ListStyle; divider?: boolean; runs?: InlineRun[] };
// Inline runs are indexed by UTF-16 units, matching TextInput selections.
export function inlineStyles(block: Block): InlineStyle[] {
  const runs = block.runs;
  if (!runs || runs.map(run => run.text).join('') !== block.text) return Array.from({ length: block.text.length }, () => ({}));
  return runs.flatMap(run => Array.from({ length: run.text.length }, () => ({
    ...(run.bold ? { bold: true as const } : {}),
    ...(run.italic ? { italic: true as const } : {}),
    ...(run.underline ? { underline: true as const } : {}),
  })));
}
export function styledRuns(text: string, styles: InlineStyle[]): InlineRun[] | undefined {
  if (!text || !styles.some(style => style.bold || style.italic || style.underline)) return undefined;
  const runs: InlineRun[] = [];
  for (let i = 0; i < text.length; i++) {
    const attrs = styles[i] || {}, last = runs[runs.length - 1];
    if (last && Boolean(last.bold) === Boolean(attrs.bold) && Boolean(last.italic) === Boolean(attrs.italic) && Boolean(last.underline) === Boolean(attrs.underline)) last.text += text[i];
    else runs.push({ text: text[i], ...(attrs.bold ? { bold: true as const } : {}), ...(attrs.italic ? { italic: true as const } : {}), ...(attrs.underline ? { underline: true as const } : {}) });
  }
  return runs;
}
export function sliceInlineRuns(block: Block, start: number, end: number): InlineRun[] | undefined {
  return styledRuns(block.text.slice(start, end), inlineStyles(block).slice(start, end));
}
export function applyInlineStyle(blocks: Block[], id: string, selection: { start: number; end: number }, kind: 'bold' | 'italic' | 'underline'): { blocks: Block[]; enabled: boolean } | null {
  const block = blocks.find(item => item.id === id && !item.divider);
  if (!block) return null;
  const start = Math.max(0, Math.min(block.text.length, selection.start)), end = Math.max(start, Math.min(block.text.length, selection.end));
  if (start === end) return null;
  const styles = inlineStyles(block), enabled = !styles.slice(start, end).every(style => style[kind]);
  for (let i = start; i < end; i++) styles[i] = { ...styles[i], [kind]: enabled ? (true as const) : undefined };
  return { blocks: blocks.map(item => item.id === id ? { ...item, runs: styledRuns(item.text, styles) } : item), enabled };
}
export const noteName = (note: Note) => (typeof note.customName === 'string' && note.customName) || note.text.split(/\r?\n/, 1)[0].trim().slice(0, 80) || 'Untitled';
export const isTrashed = (note: Note) => typeof note.deletedAt === 'string' && note.deletedAt.length > 0;
// The app keeps one blank note internally for legacy workspaces and safe editing.
// Hide only that untouched placeholder; never hide actual, named, pinned, or filed notes.
export function starterNoteId(workspace: Workspace): string | null {
  if (workspace.folders?.length) return null;
  const notes = workspace.tabs.filter(note => !isTrashed(note));
  if (notes.length !== 1) return null;
  const note = notes[0];
  if (note.text || note.customName || note.filename !== 'Untitled' || note.order != null || note.pinned || note.folderId || note.sealed) return null;
  if (Array.isArray(note.content) && !note.content.every(op => op && typeof op.insert === 'string' && op.insert === '\n' && !op.attributes)) return null;
  return note.id;
}
export const newNote = (id: string): Note => ({ id, text: '', filename: 'Untitled', customName: null });
export function validWorkspace(value: unknown): value is Workspace {
  const v = value as Workspace | null;
  return Boolean(v && Array.isArray(v.tabs) && v.tabs.length && v.tabs.every(note => note && typeof note.id === 'string' && typeof note.text === 'string' && typeof note.filename === 'string') && new Set(v.tabs.map(note => note.id)).size === v.tabs.length && typeof v.activeId === 'string' && (v.folders === undefined || (Array.isArray(v.folders) && v.folders.every(folder => folder && typeof folder.id === 'string' && typeof folder.name === 'string' && (folder.parentId == null || typeof folder.parentId === 'string')) && new Set(v.folders.map(folder => folder.id)).size === v.folders.length)));
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
    const attrs: NonNullable<Op['attributes']> = {};
    if ([1, 2, 3].includes(op.attributes?.header as number)) attrs.header = op.attributes!.header;
    else if (['checked', 'unchecked', 'bullet', 'ordered'].includes(op.attributes?.list as string)) attrs.list = op.attributes!.list;
    if (op.attributes?.bold === true) attrs.bold = true;
    if (op.attributes?.italic === true) attrs.italic = true;
    if (op.attributes?.underline === true) attrs.underline = true;
    ops.push(Object.keys(attrs).length ? { insert: op.insert, attributes: attrs } : { insert: op.insert });
  }
  return ops.filter(op => typeof op.insert === 'string').map(op => op.insert).join('') === note.text + '\n' ? ops : null;
}
export function toBlocks(note: Note, id: () => string): Block[] {
  const ops = safeOps(note);
  if (!ops) return note.text.split('\n').map(text => ({ id: id(), text }));
  const blocks: Block[] = []; let text = ''; let styles: InlineStyle[] = [];
  for (const op of ops) {
    if (typeof op.insert !== 'string') { blocks.push({ id: id(), text: '', divider: true }); continue; }
    for (const part of op.insert.split(/(\n)/)) {
      if (part === '\n') {
        blocks.push({ id: id(), text, runs: styledRuns(text, styles), heading: op.attributes?.header, list: op.attributes?.list });
        text = ''; styles = [];
      } else if (part) {
        text += part;
        styles.push(...Array.from({ length: part.length }, () => ({ ...(op.attributes?.bold ? { bold: true as const } : {}), ...(op.attributes?.italic ? { italic: true as const } : {}), ...(op.attributes?.underline ? { underline: true as const } : {}) })));
      }
    }
  }
  if (text || !blocks.length) blocks.push({ id: id(), text, runs: styledRuns(text, styles) });
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
    blocks: [...blocks.slice(0, index), { ...block, text: block.text.slice(0, start), runs: sliceInlineRuns(block, 0, start) }, { ...nextBlock, runs: sliceInlineRuns(block, end, block.text.length) }, ...blocks.slice(index + 1)],
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
  const mergedText = previous.text + block.text;
  const mergedRuns = styledRuns(mergedText, [...inlineStyles(previous), ...inlineStyles(block)]);
  return { blocks: blocks.filter(item => item.id !== id).map(item => item.id === previous.id ? { ...item, text: mergedText, runs: mergedRuns } : item), focus: { id: previous.id, start: previous.text.length, end: previous.text.length } };
}
// Use native selection to anchor edits. Prefix/suffix diffs alone cannot
// locate inserts/deletions inside repeated characters and corrupt inline runs.
export function inferTextEditRange(before: string, after: string, selection?: { start: number; end: number }) {
  if (selection && selection.start >= 0 && selection.start <= selection.end && selection.end <= before.length) {
    const { start, end } = selection;
    const insertedLength = after.length - before.length + end - start;
    if (insertedLength >= 0 && after.startsWith(before.slice(0, start)) && after.endsWith(before.slice(end))) {
      return { start, end, insertedLength };
    }
    // Collapsed Backspace deletes before the caret, not at the caret.
    if (start === end && after.length < before.length) {
      const deletionStart = start - (before.length - after.length);
      if (deletionStart >= 0 && after === before.slice(0, deletionStart) + before.slice(start)) {
        return { start: deletionStart, end: start, insertedLength: 0 };
      }
    }
  }
  // Native predictive replacements can affect words outside the selection.
  let start = 0, suffix = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  while (suffix < before.length - start && suffix < after.length - start && before.at(-1 - suffix) === after.at(-1 - suffix)) suffix++;
  return { start, end: before.length - suffix, insertedLength: after.length - start - suffix };
}
// Normalize pasted line endings and keep the caret just after the inserted text.
export function replaceParagraphText(blocks: Block[], id: string, value: string, newId: () => string, selection?: { start: number; end: number }, typingStyle?: InlineStyle): { blocks: Block[]; focus?: ParagraphFocus } | null {
  const index = blocks.findIndex(block => block.id === id && !block.divider);
  if (index < 0) return null;
  const block = blocks[index], text = value.replace(/\r\n?/g, '\n');
  if (text === block.text) return { blocks };
  const { start: editStart, end: editEnd, insertedLength } = inferTextEditRange(block.text, text, selection);
  const oldStyles = inlineStyles(block);
  const inherited: InlineStyle = typingStyle || oldStyles[Math.max(0, editStart - 1)] || oldStyles[editStart] || {};
  const styles = [...oldStyles.slice(0, editStart), ...Array.from({ length: insertedLength }, () => ({ ...inherited })), ...oldStyles.slice(editEnd)];
  if (!text.includes('\n')) return { blocks: blocks.map(item => item.id === id ? { ...item, text, runs: styledRuns(text, styles) } : item) };
  // The caret lands after the inserted text, not after unchanged suffix text.
  const insertionEnd = editStart + insertedLength;
  const inserted = text.slice(0, insertionEnd).split('\n');
  let start = 0;
  const replacement: Block[] = text.split('\n').map((line, i) => {
    const runs = styledRuns(line, styles.slice(start, start + line.length));
    start += line.length + 1;
    return i === 0 ? { ...block, text: line, runs } : { id: newId(), text: line, runs, list: block.list === 'checked' ? 'unchecked' as const : block.list };
  });
  const target = replacement[Math.min(inserted.length - 1, replacement.length - 1)], offset = inserted.at(-1)!.length;
  return { blocks: [...blocks.slice(0, index), ...replacement, ...blocks.slice(index + 1)], focus: { id: target.id, start: offset, end: offset } };
}
export function fromBlocks(note: Note, blocks: Block[]): Note {
  const content: Op[] = [];
  const editable = blocks.length ? blocks : [{ id: 'empty', text: '' }];
  for (const block of editable) {
    if (block.divider) { content.push({ insert: { divider: true } }); continue; }
    if (block.text) {
      const runs = block.runs?.map(run => run.text).join('') === block.text ? block.runs : undefined;
      if (runs?.length) runs.forEach(run => {
        const attrs = { ...(run.bold ? { bold: true } : {}), ...(run.italic ? { italic: true } : {}), ...(run.underline ? { underline: true } : {}) };
        content.push(Object.keys(attrs).length ? { insert: run.text, attributes: attrs } : { insert: run.text });
      });
      else content.push({ insert: block.text });
    }
    const attributes = block.heading ? { header: block.heading } : block.list ? { list: block.list } : undefined;
    content.push(attributes ? { insert: '\n', attributes } : { insert: '\n' });
  }
  if (editable.at(-1)?.divider) content.push({ insert: '\n' });
  return { ...note, text: content.filter(op => typeof op.insert === 'string').map(op => op.insert).join('').slice(0, -1), content };
}
