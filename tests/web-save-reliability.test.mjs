import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function sourceBetween(start, end) {
  const from = app.indexOf(start);
  const to = app.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, 'missing browser source block: ' + start);
  return app.slice(from, to);
}
const cacheSource = sourceBetween('function cacheNotes() {', '\nfunction queueCloudSave() {');
const saveSource = sourceBetween('function save() {', '\nfunction setTitle() {');
const flushSource = sourceBetween('async function flushCloud() {', '\nfunction downloadWorkspaceBackup(');
const fingerprintSource = app.match(/const protectedPlainPayload = note => JSON\.stringify\(\{[\s\S]*?\}\);/)?.[0];
assert.ok(fingerprintSource);

function savedNotesFixture(extra = '') {
  const sandbox = { JSON, Error };
  const script = `
    let tabs = [{ id: 'note', text: 'Original', filename: 'Untitled', customName: null }];
    let folders = [], activeId = 'note', cloudUser = 'alice', cloudRevision = 2;
    let cloudDirty = false, cloudConflict = false, cloudReady = true;
    let cloudWriting = false, localRecoveryAvailable = true;
    let renderingNote = false, richEditor = null, storageKey = 'account';
    let savedPayload = JSON.stringify({ tabs, folders, activeId });
    let savedNotesPayload = JSON.stringify({ tabs, folders });
    let queued = 0, encrypted = 0;
    const unlockedNotes = new Map();
    const features = { encryptNote: note => {
      encrypted++;
      return { ...note, text: '', filename: 'Locked note', customName: 'Locked note',
        content: undefined, sealed: { ciphertext: String(encrypted) } };
    } };
    const editor = { value: 'Original' };
    const status = { textContent: '' };
    const $ = id => id === 'editor' ? editor : status;
    const storedActive = () => tabs[0];
    const active = () => unlockedNotes.get(activeId)?.note || tabs[0];
    const payload = () => JSON.stringify({ tabs, folders, activeId });
    const notesPayload = () => JSON.stringify({ tabs, folders });
    const refreshNames = () => {};
    const position = () => {};
    const queueCloudSave = () => { queued++; };
    const localStorage = { setItem: () => { throw new Error('Storage quota exceeded'); } };
    ${fingerprintSource}
    ${cacheSource}
    ${saveSource}
    ${extra}
  `;
  vm.runInNewContext(script, sandbox);
  return sandbox.result;
}

test('browser storage quota errors cannot prevent a pending cloud save from being queued', () => {
  const result = savedNotesFixture(`
    editor.value = 'Changed while localStorage is full';
    save();
    globalThis.result = {
      queued, cloudDirty, cacheAvailable: localRecoveryAvailable,
      status: status.textContent, text: tabs[0].text
    };
  `);
  assert.equal(result.text, 'Changed while localStorage is full');
  assert.equal(result.cloudDirty, true);
  assert.equal(result.queued, 1);
  assert.equal(result.cacheAvailable, false);
  assert.match(result.status, /Browser backup unavailable/);
});

test('unchanged password-protected notes are not re-encrypted on every save', () => {
  const result = savedNotesFixture(`
    tabs = [{ id: 'note', text: '', filename: 'Locked note', customName: 'Locked note', sealed: { ciphertext: 'original' } }];
    const plain = { id: 'note', text: 'Secret', filename: 'Secret', customName: 'Secret' };
    unlockedNotes.set('note', { note: plain, key: {}, lastPlainPayload: protectedPlainPayload(plain) });
    editor.value = 'Secret';
    save();
    const afterUnchangedSave = encrypted;
    editor.value = 'Edited secret';
    save();
    const afterRealEdit = encrypted;
    save();
    globalThis.result = { afterUnchangedSave, afterRealEdit, afterRepeatSave: encrypted,
      stored: tabs[0].sealed.ciphertext };
  `);
  assert.equal(result.afterUnchangedSave, 0);
  assert.equal(result.afterRealEdit, 1);
  assert.equal(result.afterRepeatSave, 1);
  assert.equal(result.stored, '1');
});

test('cloud flush skips a dirty flag when note contents already match confirmed cloud contents', async () => {
  const context = { JSON, Error, setTimeout, clearTimeout };
  vm.runInNewContext(`
    let tabs = [{ id: 'n', text: 'Already synced', filename: 'Note' }];
    let folders = [], activeId = 'n', cloudUser = 'alice', cloudReady = true;
    let cloudDirty = true, cloudConflict = false, cloudWriting = false;
    let cloudRevision = 3, cloudTimer, accountGeneration = 1;
    const notesPayload = () => JSON.stringify({ tabs, folders });
    let cloudConfirmedNotes = notesPayload();
    const status = { textContent: '' };
    const $ = () => status;
    let cacheWrites = 0;
    const cacheNotes = () => { cacheWrites++; return true; };
    ${flushSource}
    globalThis.verify = async () => {
      await flushCloud();
      return { cloudDirty, cloudWriting, cacheWrites, message: status.textContent };
    };
  `, context);
  const result = await context.verify();
  assert.equal(result.cloudDirty, false);
  assert.equal(result.cloudWriting, false);
  assert.equal(result.cacheWrites, 1);
  assert.equal(result.message, 'Saved to cloud');
});
