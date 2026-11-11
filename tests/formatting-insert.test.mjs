import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const js = read('app.js');
const html = read('index.html');
const mobile = read('mobile/src/app/editor/[id].tsx');
const model = read('mobile/src/model.ts');
test('web Insert menu exposes all heading sizes and list types', () => {
  for (const kind of ['heading-1', 'heading-2', 'heading-3', 'bullet-list', 'numbered-list', 'checklist']) {
    assert.ok(html.includes('data-insert="' + kind + '"'), kind);
  }
  assert.match(js, /kind\.startsWith\('heading-'\)|heading-\[123\]/);
  assert.match(js, /listType = kind === 'checklist'/);
});
test('mobile Insert sheet exposes matching headings and lists', () => {
  for (const kind of ['heading-1', 'heading-2', 'heading-3', 'bullet-list', 'numbered-list', 'checklist']) {
    assert.ok(mobile.includes("kind: '" + kind + "'"), kind);
  }
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
