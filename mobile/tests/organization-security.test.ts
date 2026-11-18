import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { newNote, type Workspace } from '../src/model';
import { entries, moveEntry, removeFolder } from '../src/organization';
import { protectNote, unlockNote, encryptNote } from '../src/security';
import { WorkspaceStore, type Remote } from '../src/workspace';
const bytes = (size: number) => new Uint8Array(randomBytes(size));
test('folders reorder with notes, reject cycles, and preserve contents when removed', () => {
  const workspace: Workspace = { tabs: [{ ...newNote('one'), text: 'Note', order: 0 }, { ...newNote('two'), folderId: 'child' }], activeId: 'one', folders: [{ id: 'parent', name: 'Parent', order: 1 }, { id: 'child', name: 'Child', parentId: 'parent' }] };
  assert.equal(moveEntry(workspace, 'parent', 'child'), workspace);
  assert.equal(moveEntry(workspace, 'one', null, 'one'), workspace);
  const moved = moveEntry(workspace, 'one', 'child'); assert.equal(moved.tabs[0].folderId, 'child');
  const reordered = moveEntry(workspace, 'parent', null, 'one'); assert.deepEqual(entries(reordered, null).map(item => item.id), ['parent', 'one']);
  const removed = removeFolder(moved, 'child'); assert.equal(removed.tabs[0].folderId, 'parent'); assert.equal(removed.tabs[1].folderId, 'parent');
  assert.equal(removed.tabs[0].text, 'Note');
});
test('pinning floats notes while keeping manual ordering inside each group', () => {
  const workspace: Workspace = { tabs: [{ ...newNote('a'), order: 1 }, { ...newNote('b'), pinned: true, order: 5 }, { ...newNote('c'), pinned: true, order: 2 }], activeId: 'a' };
  assert.deepEqual(entries(workspace, null).map(item => item.id), ['c', 'b', 'a']);
});
test('password encryption authenticates title and contents and rejects wrong passwords and tampering', async () => {
  const original = { ...newNote('secret'), text: 'Private body 🌙', customName: 'Private title', content: [{ insert: 'Private body 🌙\n' }], pinned: true, folderId: 'f' };
  const result = await protectNote(original, 'correct horse battery staple', bytes);
  assert.doesNotMatch(JSON.stringify(result.note), /Private body|Private title/); assert.equal(result.note.text, ''); assert.equal(result.note.folderId, 'f');
  const opened = await unlockNote(JSON.parse(JSON.stringify(result.note)), 'correct horse battery staple'); assert.equal(opened.note.text, original.text); assert.deepEqual(opened.note.content, original.content);
  await assert.rejects(unlockNote(result.note, 'wrong password'), /Incorrect password/);
  await assert.rejects(unlockNote({ ...result.note, id: 'different' }, 'correct horse battery staple'), /Incorrect password/);
  const changed = encryptNote({ ...original, text: 'Changed' }, result.key, result.note.sealed!, bytes);
  assert.notEqual(changed.sealed!.iv, result.note.sealed!.iv); assert.equal((await unlockNote(changed, 'correct horse battery staple')).note.text, 'Changed');
});
test('protected edits stay encrypted in local cache and remote writes; lock clears access', async () => {
  const cache = new Map<string, string>(); let remoteValue: Workspace | null = null, count = 0;
  const remote: Remote = { read: async () => null, write: async (_user, value) => { remoteValue = structuredClone(value); return ++count; } };
  const store = new WorkspaceStore({ getItem: async key => cache.get(key) || null, setItem: async (key, value) => { cache.set(key, value); } }, remote, () => 'test', bytes);
  try {
    await store.connect('account'); store.updateNote({ ...store.getSnapshot().workspace.tabs[0], text: 'Secret original' });
    await store.protect('test', 'a long password');
    const visible = store.visibleNote('test')!; assert.equal(visible.text, 'Secret original');
    store.updateNote({ ...visible, text: 'Secret changed' }); await store.flush();
    assert.doesNotMatch(JSON.stringify(remoteValue), /Secret/); assert.doesNotMatch(cache.get('bestpad:mobile:workspace:account')!, /Secret/);
    store.lockAll(); assert.ok(store.visibleNote('test')!.sealed); await store.unlock('test', 'a long password'); assert.equal(store.visibleNote('test')!.text, 'Secret changed');
    store.unprotect('test'); assert.equal(store.getSnapshot().workspace.tabs[0].text, 'Secret changed'); assert.equal(store.getSnapshot().workspace.tabs[0].sealed, undefined);
  } finally { store.dispose(); }
});

test('guest note protection persists encrypted text locally and unlocks after restart', async () => {
  const cache = new Map<string, string>();
  const storage = { getItem: async (key: string) => cache.get(key) || null, setItem: async (key: string, value: string) => { cache.set(key, value); } };
  const remote: Remote = { read: async () => { throw new Error('Guest must not use cloud'); }, write: async () => { throw new Error('Guest must not use cloud'); } };
  const first = new WorkspaceStore(storage, remote, () => 'guest-note', bytes);
  try {
    await first.connect(null);
    first.updateNote({ ...first.getSnapshot().workspace.tabs[0], text: 'Private guest content', customName: 'Guest secret' });
    await first.protect('guest-note', 'a secure guest password');
    assert.equal(first.getSnapshot().user, null);
    assert.equal(first.getSnapshot().status, 'local');
    assert.doesNotMatch(cache.get('bestpad:mobile:workspace:guest')!, /Private guest content|Guest secret/);
    assert.ok(first.getSnapshot().workspace.tabs[0].sealed);
    first.lockAll(); assert.ok(first.visibleNote('guest-note')?.sealed);
  } finally { first.dispose(); }
  const second = new WorkspaceStore(storage, remote, () => 'new-starter', bytes);
  try {
    await second.connect(null);
    assert.ok(second.visibleNote('guest-note')?.sealed);
    await second.unlock('guest-note', 'a secure guest password');
    assert.equal(second.visibleNote('guest-note')?.text, 'Private guest content');
    assert.equal(second.visibleNote('guest-note')?.customName, 'Guest secret');
  } finally { second.dispose(); }
});

test('guest protection refuses storage failures without changing the original note', async () => {
  let failProtected = false;
  const cache = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => cache.get(key) || null,
    setItem: async (key: string, value: string) => {
      if (failProtected && value.includes('"sealed"')) throw new Error('Disk full');
      cache.set(key, value);
    },
  };
  const remote: Remote = { read: async () => null, write: async () => 1 };
  const store = new WorkspaceStore(storage, remote, () => 'guest', bytes);
  try {
    await store.connect(null);
    store.updateNote({ ...store.getSnapshot().workspace.tabs[0], text: 'Original text' });
    failProtected = true;
    await assert.rejects(store.protect('guest', 'a secure guest password'), /original note is unchanged/);
    assert.equal(store.getSnapshot().workspace.tabs[0].text, 'Original text');
    assert.equal(store.getSnapshot().workspace.tabs[0].sealed, undefined);
    assert.equal(store.visibleNote('guest')?.text, 'Original text');
  } finally { store.dispose(); }
});

test('background locking cancels an in-flight password unlock', async () => {
  const result = await protectNote({ ...newNote('locked'), text: 'Hidden' }, 'long enough password', bytes);
  const remote: Remote = { read: async () => ({ workspace: { tabs: [result.note], activeId: 'locked' }, revision: 1 }), write: async () => 2 };
  const store = new WorkspaceStore({ getItem: async () => null, setItem: async () => {} }, remote, () => 'unused', bytes);
  try { await store.connect('account'); const opening = store.unlock('locked', 'long enough password'); store.lockAll(); await assert.rejects(opening, /changed/); assert.ok(store.visibleNote('locked')?.sealed); } finally { store.dispose(); }
});

test('folder membership, pins and ordering survive cloud reload and further edits', async () => {
  let row: { workspace: Workspace; revision: number } | null = null; let id = 0;
  const remote: Remote = { read: async () => row ? structuredClone(row) : null, write: async (_u, workspace) => { row = { workspace: structuredClone(workspace), revision: (row?.revision || 0) + 1 }; return row.revision; } };
  const storage = { getItem: async () => null, setItem: async () => {} };
  const first = new WorkspaceStore(storage, remote, () => `a-${++id}`, bytes), second = new WorkspaceStore(storage, remote, () => `b-${++id}`, bytes);
  try {
    await first.connect('user'); const note = first.getSnapshot().workspace.tabs[0]; const folder = first.addFolder('Projects'); first.move(note.id, folder); first.pin(note.id); await first.flush();
    await second.connect('user'); assert.equal(second.getSnapshot().workspace.folders?.[0].name, 'Projects'); assert.equal(second.getSnapshot().workspace.tabs[0].folderId, folder); assert.equal(second.getSnapshot().workspace.tabs[0].pinned, true);
    second.add(folder); await second.flush(); await first.refresh(); assert.equal(first.getSnapshot().workspace.folders?.[0].id, folder); assert.equal(first.getSnapshot().workspace.tabs.length, 2);
  } finally { first.dispose(); second.dispose(); }
});

test('folder tree expands children in place and collapse leaves siblings visible', async () => {
  const { treeEntries } = await import('../src/organization');
  const workspace: Workspace = { tabs: [{ ...newNote('root-note'), order: 1 }, { ...newNote('inside'), folderId: 'folder' }, { ...newNote('nested-note'), folderId: 'nested' }], activeId: 'root-note', folders: [{ id: 'folder', name: 'Folder' }, { id: 'nested', name: 'Nested', parentId: 'folder', order: 1 }] };
  assert.deepEqual(treeEntries(workspace, new Set()).map(item => item.id), ['folder', 'root-note']);
  const expanded = treeEntries(workspace, new Set(['folder', 'nested']));
  assert.deepEqual(expanded.map(item => [item.id, item.depth]), [['folder', 0], ['inside', 1], ['nested', 1], ['nested-note', 2], ['root-note', 0]]);
  assert.deepEqual(treeEntries(workspace, new Set(['nested'])).map(item => item.id), ['folder', 'root-note']);
});
