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
  assert.match(app, /cloudConfirmedNotes = JSON\.stringify\(\{ tabs: snapshot\.tabs, folders: snapshot\.folders \|\| \[\] \}\)/);
  assert.match(app, /cloudDirty = notesPayload\(\) !== cloudConfirmedNotes/);
  assert.match(app, /cloudConfirmedNotes !== null && notesPayload\(\) === cloudConfirmedNotes/);
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
  // Individual text runs receive Bold/Italic/Underline; never the whole input.
  assert.match(mobile, /Platform\.OS === 'ios' \? \(\s*<Text>/);
  assert.match(mobile, /run\.bold/);
  assert.match(mobile, /run\.italic/);
  assert.match(mobile, /run\.underline/);
  assert.doesNotMatch(mobile, /currentTypingFormat/);
  assert.match(mobile, /inferTextEditRange/);
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

test('iOS Face ID stays opt-in, uses native biometric keychain, and keeps password fallback', () => {
  const config = JSON.parse(file('mobile/app.json')).expo;
  const securePlugin = config.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-secure-store');
  assert.match(securePlugin?.[1]?.faceIDPermission || '', /Face ID/);
  const pkg = JSON.parse(file('mobile/package.json'));
  const lock = JSON.parse(file('mobile/package-lock.json'));
  assert.equal(pkg.dependencies['expo-secure-store'], '~58.0.3');
  assert.equal(lock.packages['node_modules/expo-secure-store'].version, '58.0.3');
  const vault = file('mobile/src/biometric.ts');
  assert.match(vault, /requireAuthentication: true/);
  assert.match(vault, /WHEN_UNLOCKED_THIS_DEVICE_ONLY/);
  assert.match(vault, /Constants\.appOwnership === 'expo'/);
  const editor = file('mobile/src/app/editor/[id].tsx');
  assert.match(editor, /Enable Face ID/);
  assert.match(editor, /Disable Face ID/);
  const password = file('mobile/src/components/NotePassword.tsx');
  assert.match(password, /Unlock with Face ID/);
  assert.match(password, /Unlock with password/);
  assert.match(file('mobile/src/workspace.ts'), /unlockWithKey\(id: string/);
});

test('protected notes require confirmation before disabling encryption or sharing plaintext', () => {
  const ios = file('mobile/src/app/editor/[id].tsx');
  const web = file('app.js');
  assert.match(ios, /function confirmRemovePassword\(\)/);
  assert.match(ios, /Remove password protection\?/);
  assert.match(ios, /This note will no longer be encrypted/);
  assert.match(ios, /onPress: confirmRemovePassword/);
  assert.match(ios, /function shareNoteContents\(\)/);
  assert.match(ios, /Share protected note\?/);
  assert.match(ios, /Share unencrypted copy/);
  assert.match(ios, /onPress=\{shareNoteContents\}/);
  assert.match(ios, /const visible = store\.visibleNote\(note\.id\)/);
  assert.match(ios, /current\?\.sealed \|\| !visible \|\| visible\.sealed/);
  assert.match(web, /Share protected note\? The shared or copied text will be unencrypted/);
  assert.match(web, /if \(!confirm\('Remove password protection\?/);
});

test('all iOS pressable buttons and navigation honor the saved haptics toggle', () => {
  const context = file('mobile/src/context.tsx');
  const haptics = file('mobile/src/components/HapticPressable.tsx');
  const settings = file('mobile/src/app/(tabs)/settings.tsx');
  const nav = file('mobile/src/app/(tabs)/_layout.tsx');
  assert.match(context, /bestpad:mobile:haptics/);
  assert.match(context, /hapticsEnabled, setHapticsEnabled, hapticsReady/);
  assert.match(context, /hapticsEnabled && Platform\.OS !== 'web'/);
  assert.match(haptics, /tapFeedback\(\)/);
  assert.match(nav, /listeners=\{\{ tabPress: tapFeedback \}\}/);
  assert.match(settings, /accessibilityRole="switch" accessibilityLabel="Haptic feedback"/);
  assert.match(settings, /disabled=\{!hapticsReady\} haptic=\{false\} onPress=\{toggleHaptics\}/);
  for (const path of [
    'mobile/src/components/ui.tsx',
    'mobile/src/components/OrganizedLibrary.tsx',
    'mobile/src/app/editor/[id].tsx',
    'mobile/src/app/(tabs)/settings.tsx',
    'mobile/src/app/(tabs)/index.tsx',
  ]) assert.match(file(path), /import \{ Pressable \} from .*HapticPressable/);
  const library = file('mobile/src/components/OrganizedLibrary.tsx');
  assert.doesNotMatch(library, /Haptics\.(?:selection|impact)Async/);
});

test('iOS settings have seven built-in themes and inline custom theme at the end', () => {
  const config = file('mobile/src/appearance.ts');
  for (const theme of ['Amber Hour', 'Deep Sea', 'Violet']) assert.ok(config.includes(`name: '${theme}'`));
  assert.equal((config.match(/id: 'preset-/g) || []).length, 7);
  const settings = file('mobile/src/app/(tabs)/settings.tsx');
  assert.match(settings, /fontSize: 16, fontWeight: '700', letterSpacing: \.6/);
  assert.ok(settings.indexOf('builtInThemes.map') < settings.indexOf('accessibilityLabel="Custom theme"'));
  assert.ok(settings.indexOf('appearance.themes.map') < settings.indexOf('accessibilityLabel="Custom theme"'));
  assert.doesNotMatch(settings, /<SettingsSection title="Custom theme">/);
  assert.ok(settings.indexOf('accessibilityLabel="Custom theme"') < settings.indexOf('<SettingsSection title="Haptics">'));
});

test('pinned notes and folders show iOS pin emoji; three-dot note menu omits redundant movement', () => {
  const library = file('mobile/src/components/OrganizedLibrary.tsx');
  assert.match(library, /\{item\.pinned && <Text accessibilityLabel="Pinned"[^>]*>📌<\/Text>\}/);
  assert.doesNotMatch(library, /label="Move up"|label="Move down"|label="Move…"/);
  assert.doesNotMatch(library, /\{moving && sheet/);
  assert.match(library, /onLongPress=\{event => startDrag/);
  const webMenu = file('app.js').match(/function openTabMenu\(tab, anchor\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(webMenu);
  assert.doesNotMatch(webMenu, /'Move up'|'Move down'|'Move to folder…'/);
});

test('native and browser password inputs have no maximum character restriction', () => {
  const native = file('mobile/src/components/NotePassword.tsx');
  const login = file('mobile/src/app/login.tsx');
  const html = file('index.html');
  assert.match(native, /accessibilityLabel="Note password"/);
  assert.match(login, /accessibilityLabel="Password"/);
  assert.doesNotMatch(native, /maxLength/);
  assert.doesNotMatch(login, /maxLength/);
  for (const id of ['auth-password', 'recovery-password', 'recovery-confirm', 'note-password', 'note-password-confirm']) {
    const element = html.match(new RegExp('<input[^>]*id="' + id + '"[^>]*>'))?.[0];
    assert.ok(element, `Missing password input ${id}`);
    assert.doesNotMatch(element, /maxlength\s*=/i);
  }
});

test('switching haptics ON ticks, switching OFF stays silent', () => {
  const context = file('mobile/src/context.tsx');
  const pressable = file('mobile/src/components/HapticPressable.tsx');
  const settings = file('mobile/src/app/(tabs)/settings.tsx');
  const toggle = context.match(/const toggleHaptics = useCallback\(\(\) => \{([\s\S]*?)\}, \[hapticsEnabled\]\);/)?.[1];
  assert.ok(toggle, 'toggle must be able to access current preference');
  assert.match(toggle, /if \(!hapticsEnabled && Platform\.OS !== 'web'\) void Haptics\.selectionAsync\(\)/);
  assert.match(toggle, /setHapticsEnabled\(enabled => !enabled\)/);
  assert.match(pressable, /haptic = true/);
  assert.match(pressable, /if \(haptic && props\.accessibilityRole !== 'none'\) tapFeedback\(\)/);
  assert.match(settings, /haptic=\{false\} onPress=\{toggleHaptics\}/);
});

test('Handwritten and Elegant font choices persist and render in real editor', () => {
  const appearance = file('mobile/src/appearance.ts');
  const settings = file('mobile/src/app/(tabs)/settings.tsx');
  const editor = file('mobile/src/app/editor/[id].tsx');
  assert.match(appearance, /key: 'handwritten', name: 'Handwritten'/);
  assert.match(appearance, /key: 'elegant', name: 'Elegant'/);
  assert.match(appearance, /'Noteworthy'/);
  assert.match(appearance, /'Didot'/);
  assert.match(appearance, /noteFonts\.some\(option => option\.key === value\.font\)/);
  assert.match(settings, /noteFonts\.map\(font => <Pressable/);
  assert.match(settings, /fontFamily: noteFontFamily\(font\.key, Platform\.OS === 'ios'\)/);
  assert.match(editor, /const fontFamily = noteFontFamily\(appearance\.font, Platform\.OS === 'ios'\)/);
});

test('legacy note unlock field centers the password text and caret', () => {
  const password = file('mobile/src/components/NotePassword.tsx');
  const field = password.slice(password.indexOf('accessibilityLabel="Note password"'));
  assert.ok(field.startsWith('accessibilityLabel="Note password"'));
  assert.match(field.slice(0, 500), /textAlign: 'center', textAlignVertical: 'center'/);
});

test('iOS Sign out is displayed only for signed-in users at the bottom above account deletion', () => {
  const settings = file('mobile/src/app/(tabs)/settings.tsx');
  const account = settings.indexOf('<SettingsSection title="Account">');
  const legal = settings.indexOf('<SettingsSection title="Legal & privacy">');
  const signOut = settings.indexOf("{session && <View style={{ marginBottom: 12 }}><Button label={busy ? 'Signing out…' : 'Sign out'}");
  const deletion = settings.indexOf('<SettingsSection title="Account deletion">');
  assert.ok(account >= 0 && legal > account && signOut > legal && deletion > signOut);
  assert.equal(settings.split("label={busy ? 'Signing out…' : 'Sign out'}").length - 1, 1);
  assert.match(settings.slice(signOut, deletion), /onPress=\{\(\) => \{ void signOut\(\); \}\}/);
  assert.match(settings.slice(account, legal), /<SaveStatus status=\{snapshot\.status\}/);
});

test('new note protection is unavailable in iOS while existing protected notes can still unlock', () => {
  const editor = file('mobile/src/app/editor/[id].tsx');
  const unlock = file('mobile/src/components/NotePassword.tsx');
  const workspace = file('mobile/src/workspace.ts');
  assert.doesNotMatch(editor, /setProtectOpen|protectOpen|<NotePassword[^>]* protect/);
  assert.match(editor, /if \(!secured\) return;/);
  assert.match(editor, /snapshot\.workspace\.tabs\.some\(item => item\.id === note\.id && Boolean\(item\.sealed\)\)/);
  assert.match(editor, /if \(note\.sealed\) return <NotePassword/);
  assert.match(editor, /onPress: confirmRemovePassword/);
  assert.doesNotMatch(unlock, /store\.protect\(|Confirm note password|Create note password/);
  assert.match(unlock, /await store\.unlock\(id, password\)/);
  assert.match(workspace, /visibleNote\(id: string\)/);
});

test('web disables creation of protected notes without hiding existing encrypted notes', () => {
  const browser = file('app.js');
  const html = file('index.html');
  const tabMenu = browser.match(/function openTabMenu\(tab, anchor\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(tabMenu);
  assert.doesNotMatch(tabMenu, /Password protect…/);
  assert.match(tabMenu, /tab\.sealed \? \[\['🔒', 'Open protected note'/);
  assert.match(browser, /\$\('password-note'\)\.hidden = !storedActive\(\)\?\.sealed/);
  assert.match(browser, /if \(!original\?\.sealed\) return;/);
  assert.match(html, /<button id="password-note" type="button" hidden>Unlock note<\/button>/);
  assert.match(browser, /const password = await askNotePassword\(!original\.sealed\)/);
});
