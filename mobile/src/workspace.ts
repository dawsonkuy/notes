import { isTrashed, newNote, validWorkspace, type Note, type Workspace } from './model';
export type Status = 'loading' | 'local' | 'pending' | 'saving' | 'saved' | 'offline' | 'conflict' | 'cache-error';
export interface Storage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> }
export interface Remote { read(user: string): Promise<{ workspace: Workspace; revision: number } | null>; write(user: string, workspace: Workspace, revision: number | null): Promise<number> }
export class ConflictError extends Error {}
export type Snapshot = { workspace: Workspace; loading: boolean; status: Status; user: string | null };
type Cache = Workspace & { revision: number | null; dirty: boolean };
export class WorkspaceStore {
  private listeners = new Set<() => void>();
  private refreshing = false; private generation = 0; private revision: number | null = null; private dirty = false; private ready = false; private writing = false; private conflict = false;
  private timer: ReturnType<typeof setTimeout> | undefined; private cacheQueue = Promise.resolve(); private connected = false; private version = 0;
  private snapshot: Snapshot;
  constructor(private storage: Storage, private remote: Remote, private id: () => string) { const note = newNote(id()); this.snapshot = { workspace: { tabs: [note], activeId: note.id }, loading: true, status: 'loading', user: null }; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private emit(patch: Partial<Snapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach(listener => listener()); }
  private key() { return `bestpad:mobile:workspace:${this.snapshot.user || 'guest'}`; }
  private cache() {
    const key = this.key(), generation = this.generation;
    const serialized = JSON.stringify({ ...this.snapshot.workspace, revision: this.revision, dirty: this.dirty });
    this.cacheQueue = this.cacheQueue.then(async () => { try { await this.storage.setItem(key, serialized); } catch { if (generation === this.generation) this.emit({ status: 'cache-error' }); } });
    return this.cacheQueue;
  }
  private schedule(delay = 250) { clearTimeout(this.timer); if (this.snapshot.user && this.ready && this.dirty && !this.conflict) this.timer = setTimeout(() => { void this.flush(); }, delay); }
  async connect(user: string | null, force = false) {
    if (this.connected && user === this.snapshot.user && !force) return;
    if (this.connected && !this.snapshot.loading) await this.cache();
    this.connected = true; const generation = ++this.generation; clearTimeout(this.timer);
    this.ready = false; this.conflict = false; this.dirty = false; this.revision = null;
    this.emit({ loading: true, status: 'loading', user });
    await this.cacheQueue;
    let cached: Cache | null = null;
    try { const raw = JSON.parse(await this.storage.getItem(this.key()) || 'null'); if (validWorkspace(raw)) cached = raw as Cache; } catch { /* Recover with cloud contents or an empty local workspace. */ }
    if (generation !== this.generation) return;
    const note = newNote(this.id());
    let workspace = cached ? { tabs: cached.tabs, activeId: cached.tabs.some(n => n.id === cached!.activeId) ? cached.activeId : cached.tabs[0].id } : { tabs: [note], activeId: note.id };
    this.revision = Number.isInteger(cached?.revision) ? cached!.revision : null; this.dirty = Boolean(cached?.dirty && user);
    if (!user) { this.emit({ workspace, loading: false, status: 'local' }); return; }
    try {
      const row = await this.remote.read(user);
      if (generation !== this.generation) return;
      if (row && !validWorkspace(row.workspace)) throw new Error('Invalid cloud notes');
      if (this.dirty && cached) this.conflict = this.revision !== (row?.revision ?? null);
      else if (row) { workspace = row.workspace; this.revision = row.revision; }
      else { this.revision = null; this.dirty = true; }
      this.ready = true;
      this.emit({ workspace, loading: false, status: this.conflict ? 'conflict' : this.dirty ? 'pending' : 'saved' });
      await this.cache(); this.schedule();
    } catch { if (generation === this.generation) this.emit({ workspace, loading: false, status: 'offline' }); }
  }
  update(workspace: Workspace) {
    if (this.snapshot.loading || !validWorkspace(workspace)) return;
    this.version++; this.dirty = Boolean(this.snapshot.user);
    this.emit({ workspace, status: !this.snapshot.user ? 'local' : this.conflict ? 'conflict' : !this.ready ? 'offline' : 'pending' });
    void this.cache(); this.schedule();
  }
  updateNote(note: Note) { this.update({ ...this.snapshot.workspace, tabs: this.snapshot.workspace.tabs.map(n => n.id === note.id ? note : n) }); }
  add() { const note = newNote(this.id()); this.update({ tabs: [...this.snapshot.workspace.tabs, note], activeId: note.id }); return note.id; }
  rename(id: string, name: string | null) {
    const current = this.snapshot.workspace.tabs.find(note => note.id === id && !isTrashed(note));
    if (!current) return;
    const customName = name?.trim().slice(0, 80) || null;
    if ((current.customName || null) === customName) return;
    this.update({ ...this.snapshot.workspace, tabs: this.snapshot.workspace.tabs.map(note => note.id === id ? { ...note, customName } : note) });
  }
  activate(id: string) { if (this.snapshot.workspace.tabs.some(n => n.id === id && !isTrashed(n))) { this.emit({ workspace: { ...this.snapshot.workspace, activeId: id } }); void this.cache(); } }
  remove(id: string) {
    const tabs = this.snapshot.workspace.tabs.map(note => note.id === id && !isTrashed(note) ? { ...note, deletedAt: new Date().toISOString() } : note);
    if (!tabs.some(note => !isTrashed(note))) tabs.push(newNote(this.id()));
    const activeId = tabs.some(note => note.id === this.snapshot.workspace.activeId && !isTrashed(note)) ? this.snapshot.workspace.activeId : tabs.find(note => !isTrashed(note))!.id;
    this.update({ tabs, activeId });
  }
  restore(id: string) {
    this.update({ ...this.snapshot.workspace, tabs: this.snapshot.workspace.tabs.map(note => { if (note.id !== id || !isTrashed(note)) return note; const restored = { ...note }; delete restored.deletedAt; return restored; }) });
  }
  deletePermanently(id: string) {
    this.update({ ...this.snapshot.workspace, tabs: this.snapshot.workspace.tabs.filter(note => note.id !== id || !isTrashed(note)) });
  }
  async flush() {
    clearTimeout(this.timer);
    if (!this.snapshot.user || !this.ready || !this.dirty || this.conflict || this.writing) return;
    const user = this.snapshot.user, generation = this.generation, version = this.version, workspace = this.snapshot.workspace;
    this.writing = true; this.emit({ status: 'saving' });
    let retry = 250;
    try {
      const revision = await this.remote.write(user, workspace, this.revision);
      if (generation !== this.generation) return;
      this.revision = revision; this.dirty = version !== this.version;
      this.emit({ status: this.dirty ? 'pending' : 'saved' }); await this.cache();
    } catch (error) {
      if (generation !== this.generation) return;
      this.conflict = error instanceof ConflictError; retry = 5000;
      this.emit({ status: this.conflict ? 'conflict' : 'offline' }); await this.cache();
    } finally { this.writing = false; this.schedule(retry); }
  }
  async refresh() {
    const user = this.snapshot.user;
    if (!user || this.snapshot.loading || this.refreshing || this.writing || this.dirty || this.conflict) return;
    if (!this.ready) { await this.connect(user, true); return; }
    const generation = this.generation, version = this.version;
    this.refreshing = true;
    try {
      const row = await this.remote.read(user);
      if (generation !== this.generation || version !== this.version || this.dirty || this.writing || !row || !validWorkspace(row.workspace)) return;
      if (row.revision === this.revision) return;
      const activeId = this.snapshot.workspace.activeId;
      const workspace = { ...row.workspace, activeId: row.workspace.tabs.some(note => note.id === activeId && !isTrashed(note)) ? activeId : row.workspace.activeId };
      this.revision = row.revision; this.version++;
      this.emit({ workspace, status: 'saved' }); await this.cache();
    } catch { /* Keep the local copy; the next event or fallback timer retries. */ }
    finally { this.refreshing = false; }
  }
  async forgetAccount(user: string) {
    // Switch first so connect cannot recreate the deleted account's recovery cache.
    await this.connect(null);
    await this.cacheQueue;
    await this.storage.setItem(`bestpad:mobile:workspace:${user}`, 'null');
  }
  async useCloudCopy() {
    const user = this.snapshot.user, generation = this.generation; if (!user || this.snapshot.loading) return;
    const row = await this.remote.read(user);
    if (!row || !validWorkspace(row.workspace)) throw new Error('Cloud notes could not be loaded. Local changes are kept.');
    if (generation !== this.generation) return;
    this.revision = row.revision; this.dirty = false; this.conflict = false; this.ready = true; this.version++;
    this.emit({ workspace: row.workspace, status: 'saved' }); await this.cache();
  }
  retry = () => this.ready && !this.conflict ? (this.dirty ? this.flush() : this.refresh()) : this.connect(this.snapshot.user, true);
  dispose() { clearTimeout(this.timer); this.listeners.clear(); }
}
