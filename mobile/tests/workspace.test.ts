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
