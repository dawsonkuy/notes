import test from 'node:test';
import assert from 'node:assert/strict';
import { backupFilename, makeBackupPayload, mergeWorkspaceNotes, parseWorkspaceBackup, serializeWorkspaceBackup } from '../src/backupData';
import { newNote, type Workspace } from '../src/model';
import { decryptNote, encryptNote } from '../src/security';
import { randomBytes } from 'node:crypto';
test('full backup includes all notes, deleted notes, custom names and rich formatting', () => {
  const note = { ...newNote('a'), text: 'Heading\nTask', customName: 'Named note', content: [
    { insert: 'Heading' }, { insert: '\n', attributes: { header: 2 as const } },
    { insert: 'Task' }, { insert: '\n', attributes: { list: 'unchecked' as const } },
  ] };
  const trash = { ...newNote('b'), text: 'Restore me', deletedAt: '2026-11-11T00:00:00.000Z' };
  const workspace: Workspace = { tabs: [note, trash], activeId: 'a' };
  const date = new Date('2026-11-11T18:00:00.000Z');
  const backup = makeBackupPayload(workspace, date);
  assert.equal(backup.format, 'bestpad-workspace-backup');
  assert.equal(backup.version, 1);
  assert.equal(backup.exportedAt, date.toISOString());
  assert.equal(backup.workspace.tabs[1].deletedAt, trash.deletedAt);
  assert.deepEqual(JSON.parse(serializeWorkspaceBackup(workspace, date)), backup);
  assert.equal(backupFilename(date), 'bestpad-notes-2026-11-11T18-00-00-000Z.json');
});
test('invalid or empty workspaces cannot be exported as if they were valid backups', () => {
  assert.throws(() => serializeWorkspaceBackup({ tabs: [], activeId: '' }), /invalid/);
  assert.throws(() => serializeWorkspaceBackup({ tabs: [newNote('a'), newNote('a')], activeId: 'a' }), /invalid/);
});

test('folder-only backup restores folders even when all note IDs already exist', () => {
  const same = newNote('shared-note');
  const current: Workspace = { tabs: [same], folders: [], activeId: same.id };
  const imported: Workspace = {
    tabs: [{ ...same }],
    activeId: same.id,
    folders: [
      { id: 'root-folder', name: 'Plans', parentId: null, pinned: true },
      { id: 'child-folder', name: 'Drafts', parentId: 'root-folder' },
    ],
  };
  const first = mergeWorkspaceNotes(current, parseWorkspaceBackup(serializeWorkspaceBackup(imported)), () => 'unused');
  assert.equal(first.added, 0);
  assert.equal(first.foldersAdded, 2);
  assert.equal(first.skipped, 1);
  assert.equal(first.workspace.activeId, 'shared-note');
  assert.equal(first.workspace.folders?.[0].pinned, true);
  assert.equal(first.workspace.folders?.[1].parentId, 'root-folder');
  const again = mergeWorkspaceNotes(first.workspace, imported, () => 'should-not-remap');
  assert.equal(again.added, 0);
  assert.equal(again.foldersAdded, 0);
  assert.equal(again.workspace.folders?.length, 2);
});

test('reimporting a backup reuses existing folder IDs without overwriting existing notes', () => {
  const original = { ...newNote('existing'), text: 'Keep current edits' };
  const imported: Workspace = {
    activeId: 'existing',
    folders: [{ id: 'folder', name: 'Original title', pinned: true }],
    tabs: [
      { ...original, text: 'Stale backup contents' },
      { ...newNote('backup-note'), text: 'Restored', folderId: 'folder', content: [{ insert: 'Restored\\n' }] },
    ],
  };
  const current: Workspace = {
    tabs: [original],
    folders: [{ id: 'folder', name: 'My renamed folder' }],
    activeId: 'existing',
  };
  const first = mergeWorkspaceNotes(current, imported, () => 'should-not-generate');
  assert.equal(first.added, 1);
  assert.equal(first.foldersAdded, 0);
  assert.equal(first.workspace.tabs[0].text, 'Keep current edits');
  assert.equal(first.workspace.folders?.[0].name, 'My renamed folder');
  assert.equal(first.workspace.tabs[1].folderId, 'folder');
  assert.deepEqual(first.workspace.tabs[1].content, imported.tabs[1].content);
  const second = mergeWorkspaceNotes(first.workspace, imported, () => 'should-not-generate');
  assert.equal(second.added, 0);
  assert.equal(second.foldersAdded, 0);
  assert.equal(second.workspace.folders?.length, 1);
  assert.equal(second.workspace.tabs.length, 2);
});

test('backup import restores empty notes and preserves protected-note IDs', () => {
  const current: Workspace = { tabs: [newNote('current')], activeId: 'current' };
  const sealed = { v: 1 as const, salt: 'a'.repeat(32), iv: 'b'.repeat(24), ciphertext: 'ab', iterations: 600000 };
  const imported: Workspace = {
    tabs: [newNote('blank'), { ...newNote('secret'), text: '', filename: 'Locked note', sealed, folderId: 'private' }],
    activeId: 'blank', folders: [{ id: 'private', name: 'Private', pinned: true }],
  };
  const merged = mergeWorkspaceNotes(current, imported, () => 'unused');
  assert.equal(merged.added, 2);
  assert.equal(merged.foldersAdded, 1);
  assert.equal(merged.workspace.activeId, 'current');
  assert.equal(merged.workspace.tabs.find(note => note.id === 'blank')?.text, '');
  assert.equal(merged.workspace.tabs.find(note => note.id === 'secret')?.id, 'secret');
  assert.deepEqual(merged.workspace.tabs.find(note => note.id === 'secret')?.sealed, sealed);
  assert.equal(merged.workspace.tabs.find(note => note.id === 'secret')?.folderId, 'private');
});

test('a folder ID colliding with an existing note ID is remapped without losing child placement', () => {
  const current: Workspace = { tabs: [newNote('collision')], activeId: 'collision' };
  const imported: Workspace = {
    tabs: [{ ...newNote('new-note'), text: 'Hello', folderId: 'collision' }],
    activeId: 'new-note',
    folders: [{ id: 'collision', name: 'From backup' }],
  };
  const result = mergeWorkspaceNotes(current, imported, () => 'remapped-folder');
  assert.equal(result.foldersAdded, 1);
  assert.equal(result.workspace.folders?.[0].id, 'remapped-folder');
  assert.equal(result.workspace.tabs[1].folderId, 'remapped-folder');
});

test('export and import round-trip restores encrypted content, rich formatting, folders and Trash', () => {
  const secretKey = new Uint8Array(randomBytes(32));
  const privateNote = {
    ...newNote('protected-note'),
    text: 'Private heading\\nImportant details',
    filename: 'Private note',
    customName: 'Private note',
    folderId: 'secure-folder',
    content: [
      { insert: 'Private heading' },
      { insert: '\\n', attributes: { header: 2 as const } },
      { insert: 'Important details' },
      { insert: '\\n', attributes: { bold: true } },
    ],
  };
  const protectedNote = encryptNote(
    privateNote, secretKey,
    { salt: 'ab'.repeat(16), iterations: 600000 },
    length => new Uint8Array(randomBytes(length)),
  );
  const deletedNote = { ...newNote('trashed-note'), text: 'Recover this too', deletedAt: '2026-11-11T00:00:00.000Z' };
  const exported: Workspace = {
    tabs: [protectedNote, deletedNote],
    folders: [{ id: 'secure-folder', name: 'Private', pinned: true }],
    activeId: protectedNote.id,
  };
  const serialized = serializeWorkspaceBackup(exported);
  assert.doesNotMatch(serialized, /Private heading|Important details/);
  const parsed = parseWorkspaceBackup(serialized);
  const restored = mergeWorkspaceNotes(
    { tabs: [newNote('original')], activeId: 'original' },
    parsed,
    () => 'unused',
  );
  assert.equal(restored.added, 2);
  assert.equal(restored.foldersAdded, 1);
  assert.equal(restored.workspace.folders?.[0].name, 'Private');
  assert.equal(restored.workspace.folders?.[0].pinned, true);
  assert.equal(restored.workspace.tabs.find(note => note.id === 'trashed-note')?.deletedAt, deletedNote.deletedAt);
  const recovered = restored.workspace.tabs.find(note => note.id === 'protected-note')!;
  assert.ok(recovered.sealed, 'import must not accidentally remove encryption');
  assert.equal(recovered.text, '', 'encrypted plaintext must not appear in the imported workspace');
  const opened = decryptNote(recovered, secretKey);
  assert.equal(opened.text, privateNote.text);
  assert.equal(opened.customName, privateNote.customName);
  assert.deepEqual(opened.content, privateNote.content);
  assert.equal(opened.folderId, 'secure-folder');
});
