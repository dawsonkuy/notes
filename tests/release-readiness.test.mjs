import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const file = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
test('native and web support a password reset from an emailed link', () => {
  const web = file('auth.js'), login = file('mobile/src/app/login.tsx');
  assert.match(web, /resetPasswordForEmail/);
  assert.match(web, /PASSWORD_RECOVERY/);
  assert.match(web, /updateUser\(\{ password:/);
  assert.ok(web.includes("redirectTo: 'https://bestpad.app/'"));
  assert.match(login, /resetPasswordForEmail/);
  assert.ok(login.includes("redirectTo: 'https://bestpad.app/'"));
  assert.doesNotMatch(web, /aesthetic-starlight/);
});
test('iOS EAS configuration, non-transparent icon, and real file backups are available', () => {
  const app = JSON.parse(file('mobile/app.json')).expo;
  const eas = JSON.parse(file('mobile/eas.json'));
  assert.equal(app.ios.bundleIdentifier, 'app.bestpad.mobile');
  assert.equal(app.ios.supportsTablet, false);
  assert.notEqual(app.ios.infoPlist.ITSAppUsesNonExemptEncryption, false);
  assert.equal(eas.cli.appVersionSource, 'remote');
  assert.equal(eas.build.production.autoIncrement, true);
  assert.match(JSON.stringify(app.plugins), /expo-file-system/);
  const lock = JSON.parse(file('mobile/package-lock.json'));
  const packageFile = JSON.parse(file('mobile/package.json'));
  assert.equal(packageFile.dependencies['expo-file-system'], '58.0.13');
  assert.equal(lock.packages[''].dependencies['expo-file-system'], packageFile.dependencies['expo-file-system']);
  assert.equal(lock.packages['node_modules/expo-file-system'].version, '58.0.13');
});
test('mobile conflict recovery writes backup before exposing destructive replace', () => {
  const home = file('mobile/src/app/(tabs)/index.tsx');
  const settings = file('mobile/src/app/(tabs)/settings.tsx');
  assert.doesNotMatch(home, /Export all/);
  assert.match(settings, /Export JSON backup/);
  assert.match(settings, /await saveWorkspaceBackup\(store\.getSnapshot\(\)\.workspace\)/);
  assert.match(home, /Rename/);
  assert.match(home, /Back up local notes, then use cloud copy/);
  assert.ok(home.indexOf('await saveWorkspaceBackup(store.getSnapshot().workspace, true)') >= 0);
  assert.ok(home.indexOf('await saveWorkspaceBackup(store.getSnapshot().workspace, true)') < home.indexOf('store.useCloudCopy()'));
  assert.match(file('mobile/src/backup.ts'), /Paths\.document/);
  assert.match(file('mobile/src/backup.ts'), /requireExternalCopy && !shared/);
  assert.match(home, /saveWorkspaceBackup\(store\.getSnapshot\(\)\.workspace, true\)/);
});

test('support page is accessible in both Settings pages and bundled with the website', () => {
  assert.match(file('mobile/src/app/(tabs)/settings.tsx'), /https:\/\/bestpad\.app\/support\.html/);
  assert.match(file('index.html'), /href="\/support\.html"/);
  assert.match(file('build.mjs'), /'support\.html'/);
  assert.match(file('server.mjs'), /'\/support\.html'/);
  assert.match(file('support.html'), /Help &amp; support/);
});

test('web note search is removed without affecting the note library', () => {
  const html = file('index.html'), script = file('app.js');
  assert.doesNotMatch(html, /id="note-search"|id="search-empty"/);
  assert.doesNotMatch(script, /note-search|search-empty/);
  assert.match(script, /features\.treeEntries\(workspaceValue\(\), expandedFolders\)/);
});

test('tapping the iOS BestPad logo restores the main notes library', () => {
  const home = file('mobile/src/app/(tabs)/index.tsx');
  assert.match(home, /accessibilityLabel="BestPad home"/);
  assert.match(home, /onPress=\{showAllNotes\}/);
  const action = home.match(/function showAllNotes\(\) \{([\s\S]*?)\n  \}/)?.[1];
  assert.ok(action, 'Home action must exist');
  assert.match(action, /setShowTrash\(false\)/);
  assert.match(action, /setHomeRevision\(version => version \+ 1\)/);
  assert.ok(home.includes('key={`home-${homeRevision}'), 'home tap resets library scroll and expansion');
});

test('web cloud save turns green after server confirms unchanged notes and folders', () => {
  const app = file('app.js');
  // Prevent a regression that compared {tabs, folders} to tabs alone,
  // incorrectly leaving cloudDirty true and retrying forever.
  assert.doesNotMatch(app, /cloudDirty = notesPayload\(\) !== JSON\.stringify\(snapshot\.tabs\)/);
  assert.match(app, /cloudDirty = notesPayload\(\) !== JSON\.stringify\(\{ tabs: snapshot\.tabs, folders: snapshot\.folders \|\| \[\] \}\)/);
  assert.match(app, /cloudDirty \? 'Saved locally · waiting to sync…' : 'Saved to cloud'/);
  assert.match(file('style.css'), /footer\[data-save-state=waiting\] \.save-indicator/);
});

test('cloud request deadlines and safe reconnect keep web editing state protected', () => {
  const web = file('app.js'), html = file('index.html');
  assert.match(web, /async function cloudRequest\(query/);
  assert.match(web, /query\.abortSignal\(controller\.signal\)/);
  assert.match(web, /async function recoverCloud\(\)/);
  assert.doesNotMatch(web, /cloudUser = null; loadAccount\(userId\)/);
  assert.match(web, /JSON\.stringify\(\{ tabs: remote\.tabs, folders: remote\.folders \|\| \[\] \}\) === localNotes/);
  assert.match(web, /JSON\.stringify\(\{ tabs: local\.tabs, folders: local\.folders \|\| \[\] \}\)/);
  const share = web.match(/async function shareTab\(tab\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(share);
  assert.doesNotMatch(share, /\$\('save-status'\)/);
  assert.match(share, /\$\('action-status'\)/);
  assert.match(html, /id="action-status"/);
  assert.match(file('auth.js'), /window\.bestpadHasUnsyncedChanges/);
  assert.match(web, /window\.bestpadHasUnsyncedChanges =/);
});

test('four preset themes and saved themes render outside the custom color dropdown', () => {
  const web = file('appearance.js'), native = file('mobile/src/app/(tabs)/settings.tsx');
  for (const name of ['Paper', 'Cloud', 'Midnight', 'Evergreen']) assert.match(web, new RegExp("name: '" + name + "'"));
  assert.match(web, /data-preset-themes/);
  assert.match(web, /data-saved-themes/);
  assert.match(web, /data-custom-panel hidden/);
  assert.ok(web.indexOf('data-saved-themes') < web.indexOf('data-custom-panel'));
  assert.match(native, /builtInThemes\.map/);
  assert.match(native, /appearance\.themes\.map/);
  assert.match(native, /accessibilityState=\{\{ expanded: customOpen \}\}/);
  assert.match(native, /Notes are not synced yet/);
  assert.match(native, /current\.status !== 'saved'/);
});

test('iOS Notes home actions are in one row and folders keep left alignment', () => {
  const home = file('mobile/src/app/(tabs)/index.tsx');
  const library = file('mobile/src/components/OrganizedLibrary.tsx');
  assert.match(home, /accessibilityLabel="New note"/);
  assert.match(home, /accessibilityLabel="New folder"/);
  assert.match(home, /Open Trash/);
  assert.doesNotMatch(home, /showTrash \? 'Trash' : 'Notes'/);
  assert.doesNotMatch(home, /Export all notes as JSON backup/);
  assert.doesNotMatch(library, /marginLeft: item\.depth \* 18/);
  assert.match(library, /marginLeft: 0/);
  const settings = file('mobile/src/app/(tabs)/settings.tsx');
  assert.match(settings, /\{\x60SAVED THEMES · \$\{appearance\.themes\.length\}\/4\x60\}/);
});

test('iOS inline typing style and web formatting toolbar remain selectable while typing', () => {
  const mobile = file('mobile/src/app/editor/[id].tsx');
  const web = file('app.js'), html = file('index.html');
  assert.match(mobile, /currentTypingFormat\(block, toolbarCursor, toolbarTypingStyle\)\.bold/);
  assert.match(mobile, /currentTypingFormat\(block, toolbarCursor, toolbarTypingStyle\)\.italic/);
  assert.match(mobile, /setHeading\(1\)/);
  assert.match(mobile, /setHeading\(2\)/);
  assert.match(mobile, /setHeading\(3\)/);
  assert.match(html, /id="editor-format-toolbar"/);
  for (const level of ['1','2','3']) assert.match(html, new RegExp('data-heading="' + level + '"'));
  for (const format of ['bold','italic']) assert.match(html, new RegExp('data-inline-format="' + format + '"'));
  assert.match(web, /current === requested \? false : requested/);
  assert.match(web, /richEditor\.format\(kind, enabled, 'user'\)/);
});

test('folder pin controls and browser bundle support saved pinned folders', () => {
  const native = file('mobile/src/components/OrganizedLibrary.tsx');
  const store = file('mobile/src/workspace.ts');
  const source = file('mobile/src/organization.ts');
  const browser = file('app.js');
  const bundle = file('note-features.js');
  assert.match(native, /'Pin folder'/);
  assert.match(native, /'Unpin folder'/);
  assert.match(store, /folders: \(workspace\.folders \|\| \[\]\)\.map\(folder => folder\.id === id \? \{ \.\.\.folder, pinned: !folder\.pinned \}/);
  assert.match(source, /pinned: Boolean\(folder\.pinned\)/);
  assert.match(bundle, /pinned: Boolean\(folder\.pinned\)/);
  assert.match(browser, /'Unpin folder' : 'Pin folder'/);
  assert.match(browser, /folders = folders\.map\(folder => folder\.id === id \? \{ \.\.\.folder, pinned: !folder\.pinned \}/);
});
