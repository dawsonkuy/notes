import test from 'node:test';
import assert from 'node:assert/strict';
import { breakParagraph, fromBlocks, newNote, safeOps, toBlocks, validWorkspace } from '../src/model';
import { fromHSV, initialAppearance, restoreAppearance, saveTheme, toHSV } from '../src/appearance';
let counter = 0; const id = () => `block-${++counter}`;
test('legacy text and trailing newlines round-trip without loss', () => {
  for (const text of ['', 'One line', 'One\nTwo', 'One\n\n', '\n\n']) { const note = { ...newNote('note'), text }; assert.equal(fromBlocks(note, toBlocks(note, id)).text, text); }
});
test('website headings, checklists, dividers and unknown note metadata survive editing', () => {
  const note = { ...newNote('note'), customName: 'A title', extra: 'preserved', text: 'Heading\nTask\n\n', content: [{ insert: 'Heading' }, { insert: '\n', attributes: { header: 1 as const } }, { insert: 'Task' }, { insert: '\n', attributes: { list: 'checked' as const } }, { insert: { divider: true as const } }, { insert: '\n\n' }] };
  const result = fromBlocks(note, toBlocks(note, id)); assert.equal(result.text, note.text); assert.equal(result.extra, 'preserved'); assert.equal(result.customName, 'A title'); assert.ok(result.content!.some(op => op.attributes?.header === 1)); assert.ok(result.content!.some(op => op.attributes?.list === 'checked')); assert.ok(result.content!.some(op => typeof op.insert !== 'string' && op.insert.divider)); assert.ok(safeOps(result));
});
test('unsafe or stale rich content falls back to plain text', () => {
  const note = { ...newNote('note'), text: 'Keep this', content: [{ insert: 'Stale\n' }] }; assert.equal(safeOps(note), null); assert.equal(toBlocks(note, id)[0].text, 'Keep this');
  assert.equal(validWorkspace({ tabs: [newNote('same'), newNote('same')], activeId: 'same' }), false);
});
test('themes cap at four, preserve snapshots and validate restored values', () => {
  let state = initialAppearance(); for (let i = 0; i < 6; i++) state = saveTheme(state, `Theme ${i}`, `theme-${i}`); assert.equal(state.themes.length, 4); state.colors.primary = '#112233'; assert.equal(state.themes[0].colors.primary, '#0c1422');
  const restored = restoreAppearance({ ...state, themes: [...state.themes, ...state.themes] }); assert.equal(restored.themes.length, 4); assert.equal(restoreAppearance({ colors: { font: 'bad' } }).colors.font, '#f1f4f9');
});
test('color-wheel conversion preserves color across brightness and hue', () => { for (const hex of ['#000000', '#ffffff', '#112233', '#ff0000', '#35bd82', '#aabbcc']) assert.equal(fromHSV(toHSV(hex)), hex); });

test('Return after heading creates a normal-sized editable paragraph and keeps heading formatting', () => {
  const blocks = [{ id: 'heading', text: 'Today', heading: 1 as const }];
  const result = breakParagraph(blocks, 'heading', { start: 5, end: 5 }, id)!;
  assert.equal(result.blocks.length, 2);
  assert.equal(result.blocks[0].heading, 1);
  assert.equal(result.blocks[1].heading, undefined);
  assert.deepEqual(result.focus, { id: result.blocks[1].id, start: 0, end: 0 });
  const persisted = fromBlocks(newNote('note'), result.blocks);
  assert.equal(persisted.text, 'Today\n');
  assert.equal(toBlocks(persisted, id)[0].heading, 1);
  assert.equal(toBlocks(persisted, id)[1].heading, undefined);
});
test('Return in the middle of heading or over a selection preserves all remaining text', () => {
  const initial = [{ id: 'heading', text: 'ABCDEF', heading: 1 as const }];
  const result = breakParagraph(initial, 'heading', { start: 2, end: 4 }, id)!;
  assert.equal(result.blocks[0].text, 'AB');
  assert.equal(result.blocks[1].text, 'EF');
  assert.equal(result.blocks[1].heading, undefined);
  assert.equal(fromBlocks(newNote('note'), result.blocks).text, 'AB\nEF');
});
test('Empty heading navigates into existing body, empty checklist exits list, and normal Return inserts body', () => {
  const heading = [{ id: 'heading', text: '', heading: 1 as const }, { id: 'body', text: '' }];
  const next = breakParagraph(heading, 'heading', { start: 0, end: 0 }, id)!;
  assert.equal(next.blocks, heading);
  assert.equal(next.focus.id, 'body');
  const list = breakParagraph([{ id: 'list', text: '', list: 'unchecked' as const }], 'list', { start: 0, end: 0 }, id)!;
  assert.equal(list.blocks[0].list, undefined);
  const body = breakParagraph([{ id: 'body', text: 'Hello' }], 'body', { start: 5, end: 5 }, id)!;
  assert.equal(body.blocks[1].heading, undefined);
});
test('Return after an inserted heading reuses the existing empty body paragraph', () => {
  const blocks = [{ id: 'heading', text: 'Title', heading: 1 as const }, { id: 'body', text: '' }];
  const result = breakParagraph(blocks, 'heading', { start: 5, end: 5 }, id)!;
  assert.equal(result.blocks, blocks);
  assert.equal(result.focus.id, 'body');
});

test('bulleted and ordered lists survive cross-device rich-content round trips', () => {
  const note = { ...newNote('list-note'), text: 'Tasks\nFirst\nSecond\nDone', content: [
    { insert: 'Tasks' }, { insert: '\n', attributes: { header: 2 as const } },
    { insert: 'First' }, { insert: '\n', attributes: { list: 'bullet' as const } },
    { insert: 'Second' }, { insert: '\n', attributes: { list: 'ordered' as const } },
    { insert: 'Done' }, { insert: '\n', attributes: { list: 'checked' as const } },
  ] };
  const parsed = toBlocks(note, id);
  assert.equal(parsed[0].heading, 2);
  assert.equal(parsed[1].list, 'bullet');
  assert.equal(parsed[2].list, 'ordered');
  assert.equal(parsed[3].list, 'checked');
  const saved = fromBlocks(note, parsed);
  assert.equal(saved.text, note.text);
  assert.deepEqual(saved.content, note.content);
  assert.ok(safeOps(saved));
});
test('Return continues bullet and numbered lists; blank list item exits cleanly', () => {
  for (const type of ['bullet', 'ordered', 'unchecked'] as const) {
    const first = [{ id: 'test', text: 'One', list: type }];
    const next = breakParagraph(first, 'test', { start: 3, end: 3 }, id)!;
    assert.equal(next.blocks[1].list, type);
    const exit = breakParagraph([{ id: 'empty', text: '', list: type }], 'empty', { start: 0, end: 0 }, id)!;
    assert.equal(exit.blocks[0].list, undefined);
  }
  const checked = breakParagraph([{ id: 'task', text: 'Done', list: 'checked' as const }], 'task', { start: 4, end: 4 }, id)!;
  assert.equal(checked.blocks[1].list, 'unchecked');
});
test('unknown list formatting is discarded without dropping plain text', () => {
  const n = { ...newNote('unsafe'), text: 'item', content: [{ insert: 'item' }, { insert: '\n', attributes: { list: 'spoofed' as 'bullet' } }] };
  assert.deepEqual(safeOps(n), [{ insert: 'item' }, { insert: '\n' }]);
});

test('Backspace removes heading or list formatting before joining paragraphs', async () => {
  const { joinBackward } = await import('../src/model');
  const blocks = [{ id: 'a', text: 'Before' }, { id: 'b', text: 'Heading', heading: 1 as const }];
  const unformatted = joinBackward(blocks, 'b', { start: 0, end: 0 })!;
  assert.equal(unformatted.blocks.length, 2); assert.equal(unformatted.blocks[1].heading, undefined);
  const merged = joinBackward(unformatted.blocks, 'b', { start: 0, end: 0 })!;
  assert.equal(merged.blocks[0].text, 'BeforeHeading'); assert.equal(merged.focus.start, 6);
  assert.equal(joinBackward(blocks, 'b', { start: 0, end: 3 }), null);
  for (const list of ['bullet', 'ordered', 'checked', 'unchecked'] as const) {
    const result = joinBackward([{ id: 'first', text: 'Item', list }], 'first', { start: 0, end: 0 })!;
    assert.equal(result.blocks[0].text, 'Item'); assert.equal(result.blocks[0].list, undefined);
  }
});
test('Backspace removes a divider without dropping the following paragraph', async () => {
  const { joinBackward } = await import('../src/model');
  const result = joinBackward([{ id: 'a', text: '', divider: true }, { id: 'b', text: 'Keep' }], 'b', { start: 0, end: 0 })!;
  assert.deepEqual(result.blocks, [{ id: 'b', text: 'Keep' }]); assert.equal(result.focus.id, 'b');
});
test('multiline paste normalizes Windows line endings and keeps the caret before untouched text', async () => {
  const { replaceParagraphText } = await import('../src/model');
  const result = replaceParagraphText([{ id: 'a', text: 'Hello world', heading: 2 }, { id: 'b', text: 'After' }], 'a', 'Hello one\r\ntwo world', id, { start: 5, end: 5 })!;
  assert.deepEqual(result.blocks.map(block => block.text), ['Hello one', 'two world', 'After']);
  assert.equal(result.blocks[0].heading, 2); assert.equal(result.blocks[1].heading, undefined);
  assert.equal(result.focus?.id, result.blocks[1].id); assert.equal(result.focus?.start, 3);
  assert.equal(fromBlocks(newNote('paste'), result.blocks).text, 'Hello one\ntwo world\nAfter');
});
