import test from 'node:test';
import assert from 'node:assert/strict';
import { backupFilename, makeBackupPayload, serializeWorkspaceBackup } from '../src/backupData';
import { newNote, type Workspace } from '../src/model';
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
