import test from 'node:test';
import assert from 'node:assert/strict';
import { recordEditorEdit, travelEditorHistory, type EditorCheckpoint, type EditorHistory } from '../src/editorHistory';

function checkpoint(text: string, offset = text.length): EditorCheckpoint {
  return { blocks: [{ id: 'paragraph', text }], selection: { id: 'paragraph', start: offset, end: offset } };
}
const empty = (): EditorHistory => ({ past: [], future: [] });

test('typing groups continuous keystrokes into one undo and redo preserves caret', () => {
  let history = recordEditorEdit(empty(), checkpoint(''), { kind: 'typing', id: 'paragraph' }, 1000);
  history = recordEditorEdit(history, checkpoint('h'), { kind: 'typing', id: 'paragraph' }, 1100);
  history = recordEditorEdit(history, checkpoint('he'), { kind: 'typing', id: 'paragraph' }, 1200);
  assert.equal(history.past.length, 1);
  const undone = travelEditorHistory(history, checkpoint('hey'), 'undo')!;
  assert.equal(undone.checkpoint.blocks[0].text, '');
  assert.deepEqual(undone.checkpoint.selection, { id: 'paragraph', start: 0, end: 0 });
  const redone = travelEditorHistory(undone.history, undone.checkpoint, 'redo')!;
  assert.equal(redone.checkpoint.blocks[0].text, 'hey');
  assert.equal(redone.checkpoint.selection.start, 3);
});

test('command edits, typing pauses and cursor jumps break undo groups', () => {
  let history = recordEditorEdit(empty(), checkpoint('a'), { kind: 'typing', id: 'paragraph' }, 1000);
  history = recordEditorEdit(history, checkpoint('ab'), { kind: 'typing', id: 'paragraph' }, 2000);
  history = recordEditorEdit(history, checkpoint('abc'), { kind: 'command' }, 2100);
  history = { ...history, lastTyping: undefined };
  history = recordEditorEdit(history, checkpoint('abcd', 1), { kind: 'typing', id: 'paragraph' }, 2150);
  assert.equal(history.past.length, 4);
});

test('editing after undo discards redo and preserves full formatted blocks', () => {
  const styled = { blocks: [{ id: 'paragraph', text: 'Bold', runs: [{ text: 'Bold', bold: true as const }] }], selection: { id: 'paragraph', start: 4, end: 4 } };
  let history = recordEditorEdit(empty(), checkpoint(''), { kind: 'command' }, 1);
  const undo = travelEditorHistory(history, styled, 'undo')!;
  assert.equal(undo.history.future[0].blocks[0].runs?.[0].bold, true);
  history = recordEditorEdit(undo.history, checkpoint(''), { kind: 'typing', id: 'paragraph' }, 2);
  assert.equal(travelEditorHistory(history, checkpoint('changed'), 'redo'), null);
});
