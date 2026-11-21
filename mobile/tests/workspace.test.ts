import test from 'node:test';
import assert from 'node:assert/strict';
import { ConflictError, WorkspaceStore, type Remote, type Storage } from '../src/workspace';
import { newNote, type Workspace } from '../src/model';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function fixture() {
  const data = new Map<string, string>(), rows = new Map<string, { workspace: Workspace; revision: number }>(); let count = 0, failRead = false, writes = 0;
  const storage: Storage = { getItem: async key => data.get(key) || null, setItem: async (key, value) => { data.set(key, value); } };
  const remote: Remote = { read: async user => { if (failRead) throw new Error('offline'); return structuredClone(rows.get(user) || null); }, write: async (user, workspace, revision) => { if ((rows.get(user)?.revision ?? null) !== revision) throw new ConflictError(); const next = (revision || 0) + 1; rows.set(user, { workspace: structuredClone(workspace), revision: next }); writes++; return next; } };
  const store = new WorkspaceStore(storage, remote, () => `note-${++count}`);
  const workspace = (text: string): Workspace => ({ tabs: [{ ...newNote('existing'), text }], activeId: 'existing' });
  return { data, rows, remote, store, workspace, setOffline: (value: boolean) => { failRead = value; }, writeCount: () => writes };
}
test('guest notes save locally and stay separate from signed-in workspaces', async () => {
  const f = fixture(); try { await f.store.connect(null); const note = f.store.getSnapshot().workspace.tabs[0]; f.store.updateNote({ ...note, text: 'Guest note' }); await tick(); f.rows.set('alice', { workspace: f.workspace('Alice only'), revision: 3 }); await f.store.connect('alice'); assert.equal(f.store.getSnapshot().workspace.tabs[0].text, 'Alice only'); await f.store.connect(null); assert.equal(f.store.getSnapshot().workspace.tabs[0].text, 'Guest note'); } finally { f.store.dispose(); }
});
test('signed-in updates use the existing revision and persist a local recovery copy', async () => {
  const f = fixture(); try { f.rows.set('alice', { workspace: f.workspace('Before'), revision: 3 }); await f.store.connect('alice'); f.store.updateNote({ ...f.store.getSnapshot().workspace.tabs[0], text: 'After' }); await f.store.flush(); assert.equal(f.rows.get('alice')!.revision, 4); assert.equal(f.rows.get('alice')!.workspace.tabs[0].text, 'After'); assert.equal(f.store.getSnapshot().status, 'saved'); assert.match(f.data.get('bestpad:mobile:workspace:alice')!, /After/); } finally { f.store.dispose(); }
});
test('a newer remote revision never gets silently overwritten', async () => {
  const f = fixture(); try { f.rows.set('alice', { workspace: f.workspace('Before'), revision: 1 }); await f.store.connect('alice'); f.store.updateNote({ ...f.store.getSnapshot().workspace.tabs[0], text: 'Local pending' }); f.rows.set('alice', { workspace: f.workspace('Another device'), revision: 2 }); await f.store.flush(); assert.equal(f.store.getSnapshot().status, 'conflict'); assert.equal(f.rows.get('alice')!.workspace.tabs[0].text, 'Another device'); assert.match(f.data.get('bestpad:mobile:workspace:alice')!, /Local pending/); await f.store.retry(); assert.equal(f.store.getSnapshot().status, 'conflict'); } finally { f.store.dispose(); }
});
test('offline cached changes upload after a safe read; failed reads cannot write', async () => {
  const f = fixture(); try { f.rows.set('alice', { workspace: f.workspace('Cached'), revision: 4 }); f.data.set('bestpad:mobile:workspace:alice', JSON.stringify({ ...f.workspace('Cached'), revision: 4, dirty: false })); f.setOffline(true); await f.store.connect('alice'); f.store.updateNote({ ...f.store.getSnapshot().workspace.tabs[0], text: 'Edited offline' }); await f.store.flush(); assert.equal(f.writeCount(), 0); f.setOffline(false); await f.store.retry(); await f.store.flush(); assert.equal(f.rows.get('alice')!.workspace.tabs[0].text, 'Edited offline'); assert.equal(f.rows.get('alice')!.revision, 5); } finally { f.store.dispose(); }
});
test('edits made during a cloud write are retained for a subsequent write', async () => {
  const f = fixture(); try { f.rows.set('alice', { workspace: f.workspace('Before'), revision: 1 }); await f.store.connect('alice'); const write = f.remote.write; let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let first = true; f.remote.write = async (...args) => { if (first) { first = false; await gate; } return write(...args); }; f.store.updateNote({ ...f.store.getSnapshot().workspace.tabs[0], text: 'First edit' }); const saving = f.store.flush(); f.store.updateNote({ ...f.store.getSnapshot().workspace.tabs[0], text: 'Second edit' }); release(); await saving; assert.equal(f.store.getSnapshot().status, 'pending'); await f.store.flush(); assert.equal(f.rows.get('alice')!.workspace.tabs[0].text, 'Second edit'); } finally { f.store.dispose(); }
});
test('completion of an old-account write cannot replace the current account', async () => {
  const f = fixture(); try { f.rows.set('alice', { workspace: f.workspace('Alice'), revision: 1 }); f.rows.set('bob', { workspace: f.workspace('Bob'), revision: 1 }); await f.store.connect('alice'); const write = f.remote.write; let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); f.remote.write = async (...args) => { await gate; return write(...args); }; f.store.updateNote({ ...f.store.getSnapshot().workspace.tabs[0], text: 'Alice pending' }); const saving = f.store.flush(); await f.store.connect('bob'); release(); await saving; assert.equal(f.store.getSnapshot().user, 'bob'); assert.equal(f.store.getSnapshot().workspace.tabs[0].text, 'Bob'); } finally { f.store.dispose(); }
});

test('explicit cloud-copy recovery resolves a conflict without changing cloud data', async () => {
  const f = fixture(); try { f.rows.set('alice', { workspace: f.workspace('Before'), revision: 1 }); await f.store.connect('alice'); f.store.updateNote({ ...f.store.getSnapshot().workspace.tabs[0], text: 'Local change' }); f.rows.set('alice', { workspace: f.workspace('Latest cloud'), revision: 2 }); await f.store.flush(); await f.store.useCloudCopy(); assert.equal(f.store.getSnapshot().status, 'saved'); assert.equal(f.store.getSnapshot().workspace.tabs[0].text, 'Latest cloud'); assert.equal(f.rows.get('alice')!.revision, 2); } finally { f.store.dispose(); }
});

test('live refresh loads new web notes and preserves the open note', async () => {
  const f = fixture(); try {
    f.rows.set('alice', { workspace: f.workspace('Before'), revision: 1 }); await f.store.connect('alice');
    f.rows.set('alice', { workspace: { tabs: [...f.workspace('Updated').tabs, { ...newNote('from-web'), text: 'New on web' }], activeId: 'from-web' }, revision: 2 });
    await f.store.refresh();
    assert.equal(f.store.getSnapshot().workspace.tabs.length, 2);
    assert.equal(f.store.getSnapshot().workspace.tabs[0].text, 'Updated');
    assert.equal(f.store.getSnapshot().workspace.activeId, 'existing');
    assert.equal(f.writeCount(), 0);
  } finally { f.store.dispose(); }
});
test('an in-flight refresh cannot replace local typing', async () => {
  const f = fixture(); try {
    f.rows.set('alice', { workspace: f.workspace('Before'), revision: 1 }); await f.store.connect('alice');
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    f.remote.read = async () => { await gate; return { workspace: f.workspace('Remote'), revision: 2 }; };
    const refresh = f.store.refresh(); f.store.updateNote({ ...f.store.getSnapshot().workspace.tabs[0], text: 'Local pending' }); release(); await refresh;
    assert.equal(f.store.getSnapshot().workspace.tabs[0].text, 'Local pending');
    assert.equal(f.store.getSnapshot().status, 'pending');
  } finally { f.store.dispose(); }
});

test('deleted-account cleanup removes its cache and keeps guest notes', async () => {
  const f = fixture(); try {
    await f.store.connect(null); const guest = f.store.getSnapshot().workspace.tabs[0]; f.store.updateNote({ ...guest, text: 'Guest kept' });
    f.rows.set('alice', { workspace: f.workspace('Private account notes'), revision: 1 }); await f.store.connect('alice');
    await f.store.forgetAccount('alice');
    assert.equal(f.store.getSnapshot().user, null); assert.equal(f.store.getSnapshot().workspace.tabs[0].text, 'Guest kept');
    assert.equal(f.data.get('bestpad:mobile:workspace:alice'), 'null');
  } finally { f.store.dispose(); }
});

test('trashing the last note in a folder hides only the generated placeholder', async () => {
  const { starterNoteId, isTrashed } = await import('../src/model');
  const { treeEntries } = await import('../src/organization');
  const f = fixture();
  try {
    const original = { ...newNote('inside'), text: 'Keep this', folderId: 'folder-1', order: 1 };
    const workspace: Workspace = {
      tabs: [original], activeId: original.id,
      folders: [{ id: 'folder-1', name: 'My folder', order: 0 }],
    };
    f.rows.set('alice', { workspace, revision: 1 });
    await f.store.connect('alice');
    f.store.remove(original.id);
    const after = f.store.getSnapshot().workspace;
    const placeholderId = starterNoteId(after);
    assert.ok(placeholderId, 'the auto-created blank note should be recognized even with folders');
    assert.notEqual(placeholderId, original.id);
    assert.ok(after.tabs.find(note => note.id === original.id && isTrashed(note)));
    assert.deepEqual(treeEntries(after, new Set(['folder-1']))
      .filter(entry => entry.id !== placeholderId).map(entry => entry.name), ['My folder']);
    assert.deepEqual(after.folders, workspace.folders, 'the folder must remain available');

    // Even a stale action targeting the generated blank note must not create a loop.
    f.store.remove(placeholderId);
    assert.equal(f.store.getSnapshot().workspace.tabs.length, 2);
    assert.equal(starterNoteId(f.store.getSnapshot().workspace), placeholderId);

    // Undo removes the generated placeholder without losing the restored folder note.
    f.store.restore(original.id);
    const restoredWorkspace = f.store.getSnapshot().workspace;
    const restored = restoredWorkspace.tabs.find(note => note.id === original.id);
    assert.equal(restored?.text, 'Keep this');
    assert.equal(restored?.folderId, 'folder-1');
    assert.equal(restoredWorkspace.tabs.length, 1);
    assert.equal(restoredWorkspace.activeId, original.id);

    // A deliberate new note reuses the replacement instead of revealing it beside the new note.
    f.store.remove(original.id);
    const nextPlaceholderId = starterNoteId(f.store.getSnapshot().workspace);
    assert.ok(nextPlaceholderId);
    const newId = f.store.add('folder-1');
    const withNewNote = f.store.getSnapshot().workspace;
    assert.equal(newId, nextPlaceholderId);
    assert.equal(withNewNote.tabs.length, 2);
    assert.equal(starterNoteId(withNewNote), null);
    assert.deepEqual(treeEntries(withNewNote, new Set(['folder-1'])).map(entry => entry.name),
      ['My folder', 'Untitled']);
    f.store.restore(original.id);
    assert.equal(f.store.getSnapshot().workspace.tabs.length, 2, 'restoring does not create another blank note');
  } finally { f.store.dispose(); }
});

test('Trash retains note content, restores by ID, and never permanently deletes a live note', async () => {
  const f = fixture(); try {
    const original = { ...newNote('existing'), text: 'Keep this', customName: 'Named note', content: [{ insert: 'Keep this\n' }] };
    f.rows.set('alice', { workspace: { tabs: [original], activeId: original.id }, revision: 1 }); await f.store.connect('alice');
    f.store.deletePermanently(original.id); assert.equal(f.store.getSnapshot().workspace.tabs.length, 1);
    f.store.remove(original.id); const trashed = f.store.getSnapshot().workspace.tabs.find(n => n.id === original.id)!;
    assert.equal(trashed.text, original.text); assert.deepEqual(trashed.content, original.content); assert.equal(typeof trashed.deletedAt, 'string');
    assert.notEqual(f.store.getSnapshot().workspace.activeId, original.id); await f.store.flush();
    assert.ok(f.rows.get('alice')!.workspace.tabs.find(n => n.id === original.id)?.deletedAt);
    f.store.restore(original.id); const restored = f.store.getSnapshot().workspace.tabs.find(n => n.id === original.id)!;
    assert.equal(restored.deletedAt, undefined); assert.equal(restored.customName, original.customName); assert.deepEqual(restored.content, original.content);
    f.store.remove(original.id); f.store.deletePermanently(original.id); await f.store.flush();
    assert.equal(f.rows.get('alice')!.workspace.tabs.some(n => n.id === original.id), false);
  } finally { f.store.dispose(); }
});
test('Trash and restore sync between two clients, including a remotely trashed open note', async () => {
  const f = fixture(); const other = new WorkspaceStore({ getItem: async () => null, setItem: async () => {} }, f.remote, () => 'other-new');
  try {
    f.rows.set('alice', { workspace: f.workspace('Cross-device'), revision: 1 }); await f.store.connect('alice'); await other.connect('alice');
    f.store.remove('existing'); await f.store.flush(); await other.refresh();
    assert.ok(other.getSnapshot().workspace.tabs.find(n => n.id === 'existing')?.deletedAt);
    assert.notEqual(other.getSnapshot().workspace.activeId, 'existing');
    other.restore('existing'); await other.flush(); await f.store.refresh();
    assert.equal(f.store.getSnapshot().workspace.tabs.find(n => n.id === 'existing')?.deletedAt, undefined);
  } finally { f.store.dispose(); other.dispose(); }
});

test('renaming a note preserves its body and rich formatting in local and cloud copies', async () => {
  const f = fixture();
  try {
    const original = { ...newNote('existing'), text: 'First line', content: [
      { insert: 'First line' }, { insert: '\n', attributes: { header: 2 as const } },
    ] };
    f.rows.set('alice', { workspace: { tabs: [original], activeId: 'existing' }, revision: 3 });
    await f.store.connect('alice');
    f.store.rename('existing', '  New title  ');
    const updated = f.store.getSnapshot().workspace.tabs[0];
    assert.equal(updated.customName, 'New title');
    assert.equal(updated.text, original.text);
    assert.deepEqual(updated.content, original.content);
    await f.store.flush();
    assert.equal(f.rows.get('alice')!.workspace.tabs[0].customName, 'New title');
    f.store.rename('existing', null);
    assert.equal(f.store.getSnapshot().workspace.tabs[0].customName, null);
  } finally { f.store.dispose(); }
});
test('renaming an unknown or trashed note never creates a new record', async () => {
  const f = fixture();
  try {
    await f.store.connect(null);
    const before = f.store.getSnapshot().workspace.tabs.length;
    f.store.rename('not-there', 'Wrong');
    assert.equal(f.store.getSnapshot().workspace.tabs.length, before);
    const original = f.store.getSnapshot().workspace.tabs[0];
    const id = original.id;
    f.store.updateNote({ ...original, text: 'Ready to delete' });
    f.store.remove(id);
    f.store.rename(id, 'Deleted');
    assert.notEqual(f.store.getSnapshot().workspace.tabs.find(n => n.id === id)?.customName, 'Deleted');
  } finally { f.store.dispose(); }
});

test('retrying after an offline edit keeps the current workspace visible and later saves it', async () => {
  const f = fixture();
  try {
    f.rows.set('alice', { workspace: f.workspace('Cloud before outage'), revision: 4 });
    f.data.set('bestpad:mobile:workspace:alice', JSON.stringify({ ...f.workspace('Cloud before outage'), revision: 4, dirty: false }));
    f.setOffline(true);
    await f.store.connect('alice');
    assert.equal(f.store.getSnapshot().status, 'offline');
    f.store.updateNote({ ...f.store.getSnapshot().workspace.tabs[0], text: 'Unsaved offline text' });
    f.setOffline(false);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const originalRead = f.remote.read;
    f.remote.read = async user => { await gate; return originalRead(user); };
    const retry = f.store.retry();
    assert.equal(f.store.getSnapshot().loading, false, 'retry must not unmount editor');
    assert.equal(f.store.getSnapshot().workspace.tabs[0].text, 'Unsaved offline text');
    release();
    await retry;
    assert.equal(f.store.getSnapshot().status, 'pending');
    await f.store.flush();
    assert.equal(f.store.getSnapshot().status, 'saved');
    assert.equal(f.rows.get('alice')?.workspace.tabs[0].text, 'Unsaved offline text');
  } finally { f.store.dispose(); }
});

test('reconnect detects a newer cloud revision without overwriting offline edits', async () => {
  const f = fixture();
  try {
    f.rows.set('alice', { workspace: f.workspace('Old cloud'), revision: 1 });
    f.data.set('bestpad:mobile:workspace:alice', JSON.stringify({ ...f.workspace('Old cloud'), revision: 1, dirty: false }));
    f.setOffline(true);
    await f.store.connect('alice');
    f.store.updateNote({ ...f.store.getSnapshot().workspace.tabs[0], text: 'Offline local' });
    f.rows.set('alice', { workspace: f.workspace('Updated elsewhere'), revision: 2 });
    f.setOffline(false);
    await f.store.retry();
    assert.equal(f.store.getSnapshot().status, 'conflict');
    assert.equal(f.store.getSnapshot().workspace.tabs[0].text, 'Offline local');
    await f.store.flush();
    assert.equal(f.rows.get('alice')?.workspace.tabs[0].text, 'Updated elsewhere');
  } finally { f.store.dispose(); }
});

test('deadline rejects a stalled remote operation without accepting a late result', async () => {
  const { withDeadline } = await import('../src/workspace');
  let complete!: (value: number) => void;
  const slow = new Promise<number>(resolve => { complete = resolve; });
  await assert.rejects(withDeadline(slow, 5), /timed out/);
  complete(42);
});

test('importing an exported backup adds unique notes without replacing existing ones', async () => {
  const { mergeWorkspaceNotes, parseWorkspaceBackup, serializeWorkspaceBackup } = await import('../src/backupData');
  const current = { tabs: [{ ...newNote('existing'), text: 'Current account note' }], activeId: 'existing' };
  const imported = { folders: [{ id: 'folder-1', name: 'Archive', parentId: null }], tabs: [
    { ...newNote('existing'), text: 'Old backup version' },
    { ...newNote('other'), text: 'Recovered', folderId: 'folder-1' },
  ], activeId: 'existing' };
  const payload = parseWorkspaceBackup(serializeWorkspaceBackup(imported));
  const merged = mergeWorkspaceNotes(current, payload, () => 'unused');
  assert.equal(merged.added, 1);
  assert.equal(merged.skipped, 1);
  assert.equal(merged.workspace.tabs.find(note => note.id === 'existing')?.text, 'Current account note');
  assert.equal(merged.workspace.tabs.find(note => note.id === 'other')?.text, 'Recovered');
  assert.equal(merged.workspace.tabs.find(note => note.id === 'other')?.folderId, 'folder-1');
  assert.equal(merged.workspace.activeId, 'existing');
  assert.throws(() => parseWorkspaceBackup('{"format":"wrong"}'), /valid BestPad JSON/);
});

test('guest notes are imported by ID and remain accessible as guest notes', async () => {
  const f = fixture();
  try {
    await f.store.connect(null);
    const guest = f.store.getSnapshot().workspace.tabs[0];
    f.store.updateNote({ ...guest, text: 'Guest original' });
    await tick();
    f.rows.set('alice', { workspace: f.workspace('Existing account'), revision: 2 });
    await f.store.connect('alice');
    const result = await f.store.importGuestNotes();
    assert.equal(result.added, 1);
    assert.ok(f.store.getSnapshot().workspace.tabs.some(note => note.text === 'Guest original'));
    await f.store.flush();
    assert.ok(f.rows.get('alice')?.workspace.tabs.some(note => note.text === 'Guest original'));
    await f.store.connect(null);
    assert.ok(f.store.getSnapshot().workspace.tabs.some(note => note.text === 'Guest original'));
  } finally { f.store.dispose(); }
});

test('watchdog resumes pending changes if the original save timer was suspended', async () => {
  const f = fixture();
  try {
    f.rows.set('alice', { workspace: f.workspace('Before'), revision: 2 });
    await f.store.connect('alice');
    f.store.updateNote({ ...f.store.getSnapshot().workspace.tabs[0], text: 'Pending edit' });
    await f.store.refresh();
    assert.equal(f.rows.get('alice')?.workspace.tabs[0].text, 'Pending edit');
    assert.equal(f.store.getSnapshot().status, 'saved');
  } finally { f.store.dispose(); }
});

test('successful mobile cloud save reaches green saved state and does not keep reuploading', async () => {
  const f = fixture();
  try {
    f.rows.set('alice', { workspace: f.workspace('Before'), revision: 1 });
    await f.store.connect('alice');
    f.store.updateNote({ ...f.store.getSnapshot().workspace.tabs[0], text: 'Finished typing' });
    assert.equal(f.store.getSnapshot().status, 'pending');
    await f.store.flush();
    assert.equal(f.store.getSnapshot().status, 'saved');
    const writes = f.writeCount();
    await new Promise(resolve => setTimeout(resolve, 800));
    assert.equal(f.writeCount(), writes, 'a completed save should not be uploaded again without new edits');
    assert.equal(f.store.getSnapshot().status, 'saved');
  } finally { f.store.dispose(); }
});

test('pinning folders sorts within their parent and syncs without changing contained notes', async () => {
  const { entries, treeEntries } = await import('../src/organization');
  const f = fixture();
  try {
    const initial: Workspace = {
      folders: [
        { id: 'folder-a', name: 'Folder A', parentId: null, order: 1 },
        { id: 'folder-b', name: 'Folder B', parentId: null, order: 2 },
        { id: 'child', name: 'Child folder', parentId: 'folder-a', order: 0 }
      ],
      tabs: [
        { ...newNote('root'), text: 'Root note', order: 3 },
        { ...newNote('inside'), text: 'Nested note', folderId: 'folder-a', order: 0 },
      ],
      activeId: 'root'
    };
    f.rows.set('alice', { workspace: initial, revision: 1 });
    await f.store.connect('alice');
    f.store.pin('folder-b');
    let current = f.store.getSnapshot().workspace;
    assert.equal(current.folders?.find(folder => folder.id === 'folder-b')?.pinned, true);
    assert.equal(entries(current, null)[0].id, 'folder-b');
    assert.equal(current.tabs.find(note => note.id === 'inside')?.folderId, 'folder-a');
    assert.equal(treeEntries(current, new Set(['folder-a', 'folder-b']))[0].id, 'folder-b');
    f.store.pin('child');
    current = f.store.getSnapshot().workspace;
    assert.equal(current.folders?.find(folder => folder.id === 'child')?.pinned, true);
    assert.equal(entries(current, 'folder-a')[0].id, 'child');
    assert.equal(entries(current, null)[0].id, 'folder-b', 'pinning nested folder should not move it to root');
    await f.store.flush();
    assert.equal(f.rows.get('alice')?.workspace.folders?.find(folder => folder.id === 'folder-b')?.pinned, true);
    const other = new WorkspaceStore({ getItem: async () => null, setItem: async () => {} }, f.remote, () => 'another');
    try {
      await other.connect('alice');
      assert.equal(entries(other.getSnapshot().workspace, null)[0].id, 'folder-b');
    } finally { other.dispose(); }
    f.store.pin('folder-b');
    await f.store.flush();
    assert.equal(f.store.getSnapshot().workspace.folders?.find(folder => folder.id === 'folder-b')?.pinned, false);
    assert.equal(f.rows.get('alice')?.workspace.folders?.find(folder => folder.id === 'child')?.pinned, true);
  } finally { f.store.dispose(); }
});
