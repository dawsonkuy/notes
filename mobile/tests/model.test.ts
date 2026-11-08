import test from 'node:test';
import assert from 'node:assert/strict';
import { fromBlocks, newNote, safeOps, toBlocks, validWorkspace } from '../src/model';
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
