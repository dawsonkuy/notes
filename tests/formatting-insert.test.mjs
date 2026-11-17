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
  const addMenu = html.match(/<div id="add-menu"[\s\S]*?<\/div>/)?.[0];
  assert.ok(addMenu, 'web Add menu exists');
  for (const kind of ['bold', 'italic', 'underline']) {
    assert.ok(html.includes('data-inline-format="' + kind + '"'), kind);
    assert.ok(js.includes("'"+kind+"'"), kind);
    assert.ok(!addMenu.includes('data-inline-format="' + kind + '"'), kind + ' must not be in Add');
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
  // Bold/Italic should only be available as the persistent B/I buttons.
  const addSheet = mobile.slice(mobile.indexOf('<Modal visible={insertOpen}'));
  assert.doesNotMatch(addSheet, /<Button label="Bold"/);
  assert.doesNotMatch(addSheet, /<Button label="Italic"/);
  for (const label of ['B', 'I', 'U']) assert.ok(mobile.includes('<ToolbarAction label="' + label + '"'), label + ' stays in the toolbar');
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
  for (const label of ['Add', 'H1', 'H2', 'H3', 'B', 'I', 'U']) assert.ok(mobile.includes('<ToolbarAction label="' + label + '"'), label);
  assert.match(mobile, /applyInlineStyle\(/);
  assert.match(mobile, /block\.runs\.map\(/);
  assert.match(model, /styledRuns\(/);
  assert.match(js, /formats: \['header', 'list', 'divider', 'bold', 'italic', 'underline'\]/);
});

test('underline is supported on both clients without removing existing inline styles', () => {
  assert.ok(html.includes('data-inline-format="underline"'));
  assert.match(js, /op\.attributes\?\.underline === true/);
  assert.match(model, /op\.attributes\?\.underline === true/);
  assert.ok(mobile.includes("inlineActive('underline')"));
  assert.ok(mobile.includes("toggleInline('underline')"));
});
test('folder menus omit move controls while note actions still allow moving', () => {
  const folderMenu = js.slice(js.indexOf('function openFolderMenu('), js.indexOf('function isLocked()'));
  assert.doesNotMatch(folderMenu, /Move up|Move down|Move to folder/);
  const noteMenu = js.slice(js.indexOf('function openTabMenu('), js.indexOf('function renderTabs('));
  assert.match(noteMenu, /Move to folder/);
  const nativeLibrary = read('mobile/src/components/OrganizedLibrary.tsx');
  assert.match(nativeLibrary, /menu\.kind === 'note' &&/);
  assert.match(nativeLibrary, /Haptics\.impactAsync/);
  assert.match(read('mobile/src/components/AnimatedLibraryRow.tsx'), /scale: lift/);
});

test('settings show Themes immediately beneath the website card and use standard deletion controls', () => {
  const settings = read('mobile/src/app/(tabs)/settings.tsx');
  const website = settings.indexOf('Use Bestpad on any device');
  const themes = settings.indexOf('<SettingsSection title="Themes">');
  const backups = settings.indexOf('<SettingsSection title="Backups & recovery">');
  assert.ok(website !== -1 && themes > website && backups > themes);
  assert.ok(settings.includes('textAlign: \'center\''));
  assert.match(settings, /<Button label=\{deleting \? 'Deleting account…' : 'Delete account'\} icon="trash-outline" danger/);
  assert.match(settings, /<SettingsSection title="Account deletion">/);
});
test('drag tick fires on distinct crossed items, rather than every pointer movement', () => {
  const library = read('mobile/src/components/OrganizedLibrary.tsx');
  assert.match(library, /crossedItem !== lastPassedItem\.current/);
  assert.match(library, /now - lastPassFeedbackAt\.current >= 75/);
  assert.match(library, /Haptics\.selectionAsync\(\)/);
  assert.match(js, /crossedItem !== drag\.lastPassedItem/);
  assert.match(js, /navigator\.vibrate\(6\)/);
});
