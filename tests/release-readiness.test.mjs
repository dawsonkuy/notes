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
  assert.equal(app.ios.infoPlist.ITSAppUsesNonExemptEncryption, false);
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
  assert.match(home, /Export all/);
  assert.match(home, /Rename/);
  assert.match(home, /Back up local notes, then use cloud copy/);
  assert.ok(home.indexOf('await saveWorkspaceBackup(store.getSnapshot().workspace)') >= 0);
  assert.ok(home.indexOf('await saveWorkspaceBackup(store.getSnapshot().workspace)') < home.indexOf('store.useCloudCopy()'));
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
