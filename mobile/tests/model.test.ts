import test from 'node:test';
import assert from 'node:assert/strict';
import { breakParagraph, fromBlocks, inlineStyles, newNote, replaceParagraphText, safeOps, starterNoteId, toBlocks, validWorkspace } from '../src/model';
import { builtInThemes, fromHSV, initialAppearance, restoreAppearance, saveTheme, toHSV } from '../src/appearance';
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

test('bold and italic from web round-trip through mobile without losing inline spans', async () => {
  const { applyInlineStyle, replaceParagraphText } = await import('../src/model');
  const note = { ...newNote('formatted'), text: 'One bold italic end', content: [
    { insert: 'One ' }, { insert: 'bold', attributes: { bold: true } },
    { insert: ' ' }, { insert: 'italic', attributes: { italic: true } },
    { insert: ' end\n' },
  ] };
  const original = toBlocks(note, id);
  assert.deepEqual(original[0].runs?.map(run => [run.text, Boolean(run.bold), Boolean(run.italic)]), [
    ['One ', false, false], ['bold', true, false], [' ', false, false],
    ['italic', false, true], [' end', false, false],
  ]);
  const edited = applyInlineStyle(original, original[0].id, { start: 4, end: 8 }, 'italic')!;
  assert.ok(edited.enabled);
  const saved = fromBlocks(note, edited.blocks);
  assert.ok(safeOps(saved));
  assert.equal(saved.text, note.text);
  assert.deepEqual(toBlocks(saved, id)[0].runs?.find(run => run.text === 'bold'), { text: 'bold', bold: true, italic: true });
  const next = replaceParagraphText(edited.blocks, edited.blocks[0].id, 'One bold! italic end', id, { start: 8, end: 8 })!;
  const persisted = fromBlocks(note, next.blocks);
  assert.equal(persisted.text, 'One bold! italic end');
  assert.ok(persisted.content?.some(op => op.insert === 'bold!' && op.attributes?.bold && op.attributes?.italic));
});
test('splitting and rejoining formatted paragraphs preserves exact inline text', async () => {
  const { applyInlineStyle, joinBackward } = await import('../src/model');
  const start = [{ id: 'a', text: 'Hello world' }];
  const marked = applyInlineStyle(start, 'a', { start: 6, end: 11 }, 'bold')!.blocks;
  const split = breakParagraph(marked, 'a', { start: 6, end: 6 }, id)!;
  assert.equal(split.blocks[1].runs?.[0].text, 'world');
  const joined = joinBackward(split.blocks, split.blocks[1].id, { start: 0, end: 0 })!;
  const saved = fromBlocks(newNote('note'), joined.blocks);
  assert.equal(saved.text, 'Hello world');
  assert.deepEqual(toBlocks(saved, id)[0].runs?.find(run => run.bold), { text: 'world', bold: true });
});

test('four built-in BestPad themes have strong text contrast and survive preference restoration', () => {
  assert.deepEqual(builtInThemes.map(t => t.name), ['Paper', 'Cloud', 'Midnight', 'Evergreen']);
  function luminance(hex: string) {
    const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  }
  function contrast(a: string, b: string) {
    const first = luminance(a), second = luminance(b);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  }
  for (const theme of builtInThemes) {
    assert.ok(contrast(theme.colors.font, theme.colors.primary) >= 7, theme.name + ' primary contrast');
    assert.ok(contrast(theme.colors.font, theme.colors.secondary) >= 7, theme.name + ' secondary contrast');
    const customized = restoreAppearance({ ...initialAppearance(theme.mode), selected: theme.id, colors: theme.colors });
    assert.equal(customized.selected, theme.id);
  }
  const saved = saveTheme(initialAppearance('dark'), 'My custom', 'my-custom');
  const restored = restoreAppearance(JSON.parse(JSON.stringify(saved)));
  assert.equal(restored.themes[0].name, 'My custom');
  assert.equal(restored.selected, 'my-custom');
});

test('mobile typing after Bold and Italic activation saves actual styled characters, not only toolbar state', () => {
  const original = [{ id: 'line', text: '' }];
  const start = replaceParagraphText(original, 'line', 'Bold', id, { start: 0, end: 0 }, { bold: true });
  assert.ok(start);
  assert.equal(start.blocks[0].runs?.[0].bold, true);
  const append = replaceParagraphText(start.blocks, 'line', 'Bold and italic', id, { start: 4, end: 4 }, { bold: true, italic: true });
  assert.ok(append);
  const styles = inlineStyles(append.blocks[0]);
  assert.equal(styles[0].bold, true);
  assert.equal(styles[0].italic, undefined);
  assert.equal(styles[6].bold, true);
  assert.equal(styles[6].italic, true);
  const serialized = fromBlocks(newNote('note'), append.blocks);
  assert.ok(serialized.content?.some(op => op.attributes?.bold && op.attributes?.italic));
  const restored = toBlocks(serialized, id);
  assert.ok(inlineStyles(restored[0]).some(s => s.bold && s.italic));
});

test('applying heading formatting before typing preserves H1/H2 in the saved note', () => {
  for (const heading of [1, 2] as const) {
    const blocks = [{ id: 'heading', text: '', heading }];
    const result = replaceParagraphText(blocks, 'heading', 'New heading', id);
    assert.ok(result);
    const saved = fromBlocks(newNote('note'), result.blocks);
    assert.ok(saved.content?.some(op => op.insert === '\n' && op.attributes?.header === heading));
  }
});

test('underline combines with bold and italic, survives sync, and applies to newly typed text', async () => {
  const { applyInlineStyle } = await import('../src/model');
  const note = { ...newNote('underline'), text: 'One under and bold', content: [
    { insert: 'One ' }, { insert: 'under', attributes: { underline: true } },
    { insert: ' and ' }, { insert: 'bold', attributes: { bold: true, italic: true } }, { insert: '\n' },
  ] };
  const blocks = toBlocks(note, id);
  assert.equal(blocks[0].runs?.find(run => run.text === 'under')?.underline, true);
  const selection = { start: note.text.indexOf('bold'), end: note.text.length };
  const underlined = applyInlineStyle(blocks, blocks[0].id, selection, 'underline')!;
  assert.equal(underlined.enabled, true);
  const saved = fromBlocks(note, underlined.blocks);
  assert.ok(safeOps(saved));
  assert.ok(saved.content?.some(op => op.insert === 'bold' && op.attributes?.bold && op.attributes?.italic && op.attributes?.underline));
  const removed = applyInlineStyle(underlined.blocks, underlined.blocks[0].id, selection, 'underline')!;
  assert.equal(removed.enabled, false);
  assert.ok(!fromBlocks(note, removed.blocks).content?.some(op => op.insert === 'bold' && op.attributes?.underline));

  const plain = { ...newNote('typing'), text: 'hello' };
  const initial = toBlocks(plain, id);
  const typed = replaceParagraphText(initial, initial[0].id, 'hello!', id, { start: 5, end: 5 }, { underline: true })!;
  assert.ok(fromBlocks(plain, typed.blocks).content?.some(op => op.insert === '!' && op.attributes?.underline));
});

test('only an untouched starter note is treated as an empty library', () => {
  const starter = newNote('starter');
  const workspace = { tabs: [starter], activeId: starter.id };
  assert.equal(starterNoteId(workspace), starter.id);
  assert.equal(starterNoteId({ ...workspace, tabs: [{ ...starter, content: [{ insert: '\n' }] }] }), starter.id);
  for (const note of [
    { ...starter, text: 'A note' },
    { ...starter, customName: 'My note' },
    { ...starter, pinned: true },
    { ...starter, order: 1 },
    { ...starter, folderId: 'folder' },
    { ...starter, content: [{ insert: '\n', attributes: { header: 1 as const } }] },
  ]) assert.equal(starterNoteId({ ...workspace, tabs: [note] }), null);
  assert.equal(starterNoteId({ ...workspace, tabs: [starter, newNote('two')] }), null);
  assert.equal(starterNoteId({ ...workspace, folders: [{ id: 'folder', name: 'Folder' }] }), null);
  assert.equal(starterNoteId({ ...workspace, tabs: [starter, { ...newNote('old'), deletedAt: new Date().toISOString() }] }), starter.id);
});

test('typing inside repeated characters preserves styles at the selected position', () => {
  const original = [{
    id: 'repeated', text: 'aaaa',
    runs: [{ text: 'aa', bold: true as const }, { text: 'aa' }],
  }];
  // The fifth 'a' belongs *between* the two bold and two plain characters,
  // not at the end just because a prefix diff cannot distinguish the 'a's.
  const inserted = replaceParagraphText(original, 'repeated', 'aaaaa', id, { start: 2, end: 2 }, { italic: true })!;
  const styles = inlineStyles(inserted.blocks[0]);
  assert.deepEqual(styles.map(style => [Boolean(style.bold), Boolean(style.italic)]), [
    [true, false], [true, false], [false, true], [false, false], [false, false],
  ]);
  const saved = fromBlocks(newNote('persist'), inserted.blocks);
  assert.ok(safeOps(saved));
  assert.deepEqual(inlineStyles(toBlocks(saved, id)[0]), styles);
});

test('Backspace inside repeated characters deletes the character before the caret', () => {
  const original = [{
    id: 'repeated', text: 'aaaa',
    runs: [{ text: 'a', bold: true as const }, { text: 'aaa' }],
  }];
  // Caret at index 1 deletes the bold character at index 0, not the final 'a'.
  const deleted = replaceParagraphText(original, 'repeated', 'aaa', id, { start: 1, end: 1 })!;
  assert.equal(deleted.blocks[0].text, 'aaa');
  assert.deepEqual(inlineStyles(deleted.blocks[0]), [{}, {}, {}]);
  // A multi-character native Backspace works the same way.
  const many = replaceParagraphText(original, 'repeated', 'aa', id, { start: 2, end: 2 })!;
  assert.deepEqual(inlineStyles(many.blocks[0]), [{}, {}]);
});

test('selected inline formatting and subsequent plain typing never restyle an entire paragraph', () => {
  const start = [{ id: 'line', text: 'one two three' }];
  const marked = applyInlineStyle(start, 'line', { start: 4, end: 7 }, 'underline')!.blocks;
  const typed = replaceParagraphText(marked, 'line', 'one two! three', id, { start: 7, end: 7 }, { underline: undefined })!;
  const saved = fromBlocks(newNote('format'), typed.blocks);
  const styles = inlineStyles(toBlocks(saved, id)[0]);
  assert.equal(styles[0].underline, undefined);
  assert.equal(styles[4].underline, true);
  assert.equal(styles[6].underline, true);
  assert.equal(styles[7].underline, undefined);
  assert.equal(styles.at(-1)?.underline, undefined);
});
