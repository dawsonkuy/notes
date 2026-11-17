import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const js = read('app.js');
const html = read('index.html');
const mobile = read('mobile/src/app/editor/[id].tsx');
const model = read('mobile/src/model.ts');
test('web Add menu keeps lists while heading controls live in the format bar', () => {
  assert.match(html, />Add <svg/);
  for (const kind of ['bold', 'italic']) {
    assert.ok(html.includes('data-inline-format="' + kind + '"'), kind);
    assert.ok(js.includes("'"+kind+"'"), kind);
  }
  for (const level of [1, 2, 3]) assert.ok(html.includes('data-heading="' + level + '"'), 'heading ' + level + ' in persistent formatting toolbar');
  for (const level of [1, 2, 3]) assert.ok(!html.includes('data-insert="heading-' + level + '"'), 'heading ' + level + ' should not appear in Add');
  for (const kind of ['bullet-list', 'numbered-list', 'checklist']) {
    assert.ok(html.includes('data-insert="' + kind + '"'), kind);
  }
  assert.match(js, /kind\.startsWith\('heading-'\)|heading-\[123\]/);
  assert.match(js, /listType = kind === 'checklist'/);
});
test('mobile Add sheet keeps lists while all headings are in the formatting bar', () => {
  for (const kind of ['bullet-list', 'numbered-list', 'checklist']) {
    assert.ok(mobile.includes("kind: '" + kind + "'"), kind);
  }
  for (const level of [1, 2, 3]) assert.ok(mobile.includes('<ToolbarAction label="H' + level + '"'), 'heading ' + level + ' should be in format bar');
  for (const level of [1, 2, 3]) assert.ok(!mobile.includes("{ kind: 'heading-" + level + "'"), 'heading ' + level + ' should not appear in Add sheet');
  assert.match(mobile, /orderedNumber\(blocks, index\)/);
  assert.match(mobile, /onSubmitEditing=\{\(\) => returnFromParagraph\(block\)\}/);
});
test('both platforms preserve numbered, bullet and checklist styles in existing JSON', () => {
  for (const format of ['checked', 'unchecked', 'bullet', 'ordered']) {
    assert.ok(js.includes("'" + format + "'"), format + ' missing in web');
    assert.ok(model.includes("'" + format + "'"), format + ' missing in mobile');
  }
  assert.match(model, /block\.list === 'checked' \? 'unchecked'/);
});

test('iOS bottom formatting bar and native inline serialization exist', () => {
  for (const label of ['Add', 'H1', 'H2', 'H3', 'B', 'I']) assert.ok(mobile.includes('<ToolbarAction label="' + label + '"'), label);
  assert.match(mobile, /applyInlineStyle\(/);
  assert.match(mobile, /block\.runs\.map\(/);
  assert.match(model, /styledRuns\(/);
  assert.match(js, /formats: \['header', 'list', 'divider', 'bold', 'italic'\]/);
});
