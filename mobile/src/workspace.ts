import { protectNote, unlockNote, encryptNote, decryptNote, type Random } from './security';
import { moveEntry, removeFolder } from './organization';
import { mergeWorkspaceNotes, type ImportResult } from './backupData';
import { ensureLiveNote, isTrashed, newNote, starterNoteId, validWorkspace, type Note, type Workspace } from './model';
export type Status = 'loading' | 'local' | 'pending' | 'saving' | 'saved' | 'offline' | 'conflict' | 'cache-error';
export interface Storage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> }
export interface Remote { read(user: string): Promise<{ workspace: Workspace; revision: number } | null>; write(user: string, workspace: Workspace, revision: number | null): Promise<number> }
export class ConflictError extends Error {}
// Covers queries stalled before fetch/AbortController gets control (for example,
// waiting for an Auth session lock), without allowing a late result to mutate state.
export function withDeadline<T>(operation: Promise<T>, milliseconds = 15000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Cloud request timed out. Your local notes are safe.')), milliseconds);
    operation.then(value => { clearTimeout(timeout); resolve(value); }, error => { clearTimeout(timeout); reject(error); });
  });
}
export type Snapshot = { workspace: Workspace; loading: boolean; status: Status; user: string | null };
type Cache = Workspace & { revision: number | null; dirty: boolean };
export class WorkspaceStore {
  private listeners = new Set<() => void>();
  private refreshing = false; private generation = 0; private connectionRequest = 0; private revision: number | null = null; private dirty = false; private ready = false; private writing = false; private conflict = false;
  private timer: ReturnType<typeof setTimeout> | undefined; private cacheQueue = Promise.resolve(); private connected = false; private version = 0;
  private snapshot: Snapshot;
  private keyEpoch = 0;
  private keys = new Map<string, Uint8Array>();
  constructor(private storage: Storage, private remote: Remote, private id: () => string, private random?: Random) { const note = newNote(id()); this.snapshot = { workspace: { tabs: [note], activeId: note.id }, loading: true, status: 'loading', user: null }; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private emit(patch: Partial<Snapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach(listener => listener()); }
  private key() { return `bestpad:mobile:workspace:${this.snapshot.user || 'guest'}`; }
  private cache() {
    const key = this.key(), generation = this.generation;
    const serialized = JSON.stringify({ ...this.snapshot.workspace, revision: this.revision, dirty: this.dirty });
    this.cacheQueue = this.cacheQueue.then(async () => {
      try { await withDeadline(this.storage.setItem(key, serialized), 7000); }
      catch { if (generation === this.generation) this.emit({ status: 'cache-error' }); }
    });
    return this.cacheQueue;
  }
  private schedule(delay = 700) { clearTimeout(this.timer); if (this.snapshot.user && this.ready && this.dirty && !this.conflict) this.timer = setTimeout(() => { void this.flush(); }, delay); }
  async connect(user: string | null, force = false) {
    // Even a no-op request can supersede an older account switch still awaiting storage.
    const request = ++this.connectionRequest;
    if (this.connected && user === this.snapshot.user && !force) return;
    if (this.connected && !this.snapshot.loading) await this.cache();
    if (request !== this.connectionRequest) return; // An account switch superseded this load.
    this.lockAll(); this.connected = true; const generation = ++this.generation; clearTimeout(this.timer);
    this.ready = false; this.conflict = false; this.dirty = false; this.revision = null;
    this.emit({ loading: true, status: 'loading', user });
    await withDeadline(this.cacheQueue, 7000).catch(() => undefined);
    let cached: Cache | null = null;
    try { const raw = JSON.parse(await withDeadline(this.storage.getItem(this.key()), 7000) || 'null'); if (validWorkspace(raw)) cached = raw as Cache; } catch { /* Recover with cloud contents or an empty local workspace. */ }
    if (generation !== this.generation) return;
    const note = newNote(this.id());
    let workspace: Workspace = cached ? ensureLiveNote({ tabs: cached.tabs, folders: cached.folders || [], activeId: cached.activeId }, this.id) : { tabs: [note], activeId: note.id };
    this.revision = Number.isInteger(cached?.revision) ? cached!.revision : null; this.dirty = Boolean(cached?.dirty && user);
    if (!user) { this.emit({ workspace, loading: false, status: 'local' }); return; }
    try {
      const row = await withDeadline(this.remote.read(user));
      if (generation !== this.generation) return;
      if (row && !validWorkspace(row.workspace)) throw new Error('Invalid cloud notes');
      if (this.dirty && cached) this.conflict = this.revision !== (row?.revision ?? null);
      else if (row) { workspace = ensureLiveNote(row.workspace, this.id); this.revision = row.revision; }
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
  updateNote(note: Note) {
    const original = this.snapshot.workspace.tabs.find(item => item.id === note.id);
    // Native editor callbacks can arrive after Trash, a folder move, or a remote refresh.
    // Never resurrect a deleted note or overwrite newer folder/pin/order metadata.
    if (!original || isTrashed(original)) return;
    if (original.sealed) {
      const key = this.keys.get(note.id); if (!key) return;
      note = encryptNote({ ...original, text: note.text, content: note.content, filename: note.filename, customName: note.customName }, key, original.sealed, this.random);
    } else {
      const contents = (value: Note) => JSON.stringify([value.text, value.content, value.filename, value.customName]);
      if (contents(original) === contents(note)) return;
      note = { ...original, text: note.text, content: note.content, filename: note.filename, customName: note.customName };
    }
    this.update({ ...this.snapshot.workspace, tabs: this.snapshot.workspace.tabs.map(n => n.id === note.id ? note : n) });
  }
  add(folderId: string | null = null) {
    const workspace = this.snapshot.workspace;
    const destination = workspace.folders?.some(folder => folder.id === folderId) ? folderId : null;
    const starterId = starterNoteId(workspace);
    // Reuse the internal empty note instead of exposing it when the user creates a real note.
    if (starterId) {
      this.update({ ...workspace, tabs: workspace.tabs.map(note => note.id === starterId
        ? { ...note, folderId: destination, order: Date.now() } : note), activeId: starterId });
      return starterId;
    }
    const note = { ...newNote(this.id()), folderId: destination, order: Date.now() };
    this.update({ ...workspace, tabs: [...workspace.tabs, note], activeId: note.id });
    return note.id;
  }
  rename(id: string, name: string | null) {
    const current = this.snapshot.workspace.tabs.find(note => note.id === id && !isTrashed(note));
    if (!current || current.sealed) return;
    const customName = name?.trim().slice(0, 80) || null;
    if ((current.customName || null) === customName) return;
    this.update({ ...this.snapshot.workspace, tabs: this.snapshot.workspace.tabs.map(note => note.id === id ? { ...note, customName } : note) });
  }
  activate(id: string) { if (this.snapshot.workspace.tabs.some(n => n.id === id && !isTrashed(n))) { this.emit({ workspace: { ...this.snapshot.workspace, activeId: id } }); void this.cache(); } }
  remove(id: string) {
    // The synthetic starter is not a user note: trashing it would create another indefinitely.
    if (starterNoteId(this.snapshot.workspace) === id) return;
    if (!this.snapshot.workspace.tabs.some(note => note.id === id && !isTrashed(note))) return;
    this.keys.get(id)?.fill(0); this.keys.delete(id);
    const tabs = this.snapshot.workspace.tabs.map(note => note.id === id && !isTrashed(note) ? { ...note, deletedAt: new Date().toISOString() } : note);
    if (!tabs.some(note => !isTrashed(note))) tabs.push(newNote(this.id()));
    const activeId = tabs.some(note => note.id === this.snapshot.workspace.activeId && !isTrashed(note)) ? this.snapshot.workspace.activeId : tabs.find(note => !isTrashed(note))!.id;
    this.update({ ...this.snapshot.workspace, tabs, activeId });
  }
  restore(id: string) {
    const workspace = this.snapshot.workspace;
    if (!workspace.tabs.some(note => note.id === id && isTrashed(note))) return;
    // If Trash generated an untouched replacement, discard it once a real note returns.
    const starterId = starterNoteId(workspace);
    const tabs = workspace.tabs.filter(note => note.id !== starterId).map(note => {
      if (note.id !== id) return note;
      const restored = { ...note }; delete restored.deletedAt; return restored;
    });
    this.update({ ...workspace, tabs, activeId: starterId ? id : workspace.activeId });
  }
  deletePermanently(id: string) {
    // A stale Trash button must never delete a note restored on another screen.
    if (!this.snapshot.workspace.tabs.some(note => note.id === id && isTrashed(note))) return;
    this.keys.get(id)?.fill(0); this.keys.delete(id);
    const workspace = this.snapshot.workspace;
    const tabs = workspace.tabs.filter(note => note.id !== id);
    this.update(ensureLiveNote({ ...workspace, tabs, activeId: workspace.activeId }, this.id));
  }
  visibleNote(id: string) {
    const note = this.snapshot.workspace.tabs.find(item => item.id === id); if (!note?.sealed) return note;
    const key = this.keys.get(id); if (!key) return note;
    try { return decryptNote(note, key); } catch { return note; }
  }
  lock(id: string) { this.keyEpoch++; this.keys.get(id)?.fill(0); this.keys.delete(id); this.emit({}); }
  lockAll() { this.keyEpoch++; this.keys.forEach(key => key.fill(0)); this.keys.clear(); this.emit({}); }
  async unlock(id: string, password: string) {
    const original = this.snapshot.workspace.tabs.find(item => item.id === id); if (!original?.sealed || isTrashed(original)) return;
    const user = this.snapshot.user, epoch = this.keyEpoch, result = await unlockNote(original, password);
    const latest = this.snapshot.workspace.tabs.find(item => item.id === id);
    if (epoch !== this.keyEpoch || user !== this.snapshot.user || !latest || isTrashed(latest) || latest.sealed !== original.sealed) {
      result.key.fill(0); throw new Error('Note changed. Try unlocking again.');
    }
    this.keys.get(id)?.fill(0); this.keys.set(id, result.key); this.emit({});
  }
  getUnlockedKey(id: string): Uint8Array | null {
    const note = this.snapshot.workspace.tabs.find(item => item.id === id);
    const key = note?.sealed ? this.keys.get(id) : null;
    return key ? key.slice() : null;
  }
  unlockWithKey(id: string, key: Uint8Array) {
    const original = this.snapshot.workspace.tabs.find(item => item.id === id);
    if (!original?.sealed || isTrashed(original)) throw new Error('Note is no longer available to unlock.');
    const user = this.snapshot.user, epoch = this.keyEpoch, generation = this.generation;
    try { decryptNote(original, key); }
    catch { throw new Error('Face ID could not unlock this note. Use your note password.'); }
    if (epoch !== this.keyEpoch || generation !== this.generation || user !== this.snapshot.user ||
        this.snapshot.workspace.tabs.find(item => item.id === id)?.sealed !== original.sealed ||
        isTrashed(this.snapshot.workspace.tabs.find(item => item.id === id)!)) {
      throw new Error('Note changed. Try unlocking again.');
    }
    this.keys.get(id)?.fill(0);
    this.keys.set(id, key.slice()); this.emit({});
  }
  async protect(id: string, password: string) {
    const original = this.snapshot.workspace.tabs.find(item => item.id === id); if (!original || isTrashed(original) || original.sealed) return;
    const user = this.snapshot.user, epoch = this.keyEpoch, generation = this.generation;
    const result = await protectNote(original, password, this.random);
    const unchanged = () => epoch === this.keyEpoch && generation === this.generation && user === this.snapshot.user &&
      this.snapshot.workspace.tabs.find(item => item.id === id) === original;
    if (!unchanged()) { result.key.fill(0); throw new Error('Note changed. Please try again.'); }
    const next = { ...this.snapshot.workspace, tabs: this.snapshot.workspace.tabs.map(note => note.id === id ? result.note : note) };
    if (!user) {
      // Guest notes have no cloud backup. Persist ciphertext successfully before
      // replacing the plaintext editor state, so storage failures cannot leave
      // the user thinking an unsaved encrypted note is safe.
      try {
        await this.cacheQueue;
        if (!unchanged()) throw new Error('Note changed. Please try again.');
        await withDeadline(this.storage.setItem(this.key(), JSON.stringify({ ...next, revision: this.revision, dirty: false })), 7000);
      } catch (error) {
        result.key.fill(0);
        if (!unchanged()) { void this.cache(); throw new Error('Note changed. Please try again.'); }
        throw new Error('Could not save the protected note on this device. Your original note is unchanged. Check available storage and try again.', { cause: error });
      }
      if (!unchanged()) { result.key.fill(0); void this.cache(); throw new Error('Note changed. Please try again.'); }
      this.keys.get(id)?.fill(0); this.keys.set(id, result.key);
      this.version++;
      this.emit({ workspace: next, status: 'local' });
      return;
    }
    this.keys.get(id)?.fill(0); this.keys.set(id, result.key);
    this.update(next); await this.cacheQueue;
  }
  unprotect(id: string) {
    const plain = this.visibleNote(id); if (!plain || isTrashed(plain) || plain.sealed) return;
    this.keys.get(id)?.fill(0); this.keys.delete(id);
    this.update({ ...this.snapshot.workspace, tabs: this.snapshot.workspace.tabs.map(note => note.id === id ? plain : note) });
  }
  pin(id: string) {
    const workspace = this.snapshot.workspace;
    if (!workspace.tabs.some(note => note.id === id && !isTrashed(note)) && !workspace.folders?.some(folder => folder.id === id)) return;
    this.update({ ...workspace,
      tabs: workspace.tabs.map(note => note.id === id && !isTrashed(note) ? { ...note, pinned: !note.pinned } : note),
      folders: (workspace.folders || []).map(folder => folder.id === id ? { ...folder, pinned: !folder.pinned } : folder)
    });
  }
  addFolder(name: string, parentId: string | null = null) { const id = this.id(); this.update({ ...this.snapshot.workspace, folders: [...(this.snapshot.workspace.folders || []), { id, name: name.trim().slice(0, 80) || 'New folder', parentId, order: Date.now() }] }); return id; }
  renameFolder(id: string, name: string) { if (name.trim()) this.update({ ...this.snapshot.workspace, folders: (this.snapshot.workspace.folders || []).map(folder => folder.id === id ? { ...folder, name: name.trim().slice(0, 80) } : folder) }); }
  removeFolder(id: string) {
    const workspace = this.snapshot.workspace, next = removeFolder(workspace, id);
    if (next !== workspace) this.update(next);
  }
  move(id: string, parentId: string | null, beforeId?: string) {
    const workspace = this.snapshot.workspace, next = moveEntry(workspace, id, parentId, beforeId);
    if (next !== workspace) this.update(next);
  }
  // Reconnect in place so a network hiccup never unmounts the editor or
  // replaces unsaved text with an older AsyncStorage snapshot.
  async recoverConnection() {
    const user = this.snapshot.user;
    if (!user || this.snapshot.loading || this.ready || this.refreshing || this.writing) return;
    const generation = this.generation;
    this.refreshing = true;
    try {
      const row = await withDeadline(this.remote.read(user));
      if (generation !== this.generation) return;
      if (row && !validWorkspace(row.workspace)) throw new Error('Invalid cloud workspace');
      if (this.dirty) {
        // Keep typing done during the read. Revision checks protect it from
        // overwriting work saved from another device in the meantime.
        this.conflict = this.revision !== (row?.revision ?? null);
      } else if (row) {
        this.revision = row.revision;
        const activeId = this.snapshot.workspace.activeId;
        this.version++;
        this.emit({ workspace: ensureLiveNote({ ...row.workspace, activeId: row.workspace.tabs.some(note => note.id === activeId && !isTrashed(note)) ? activeId : row.workspace.activeId }, this.id) });
      } else {
        this.revision = null;
        this.dirty = true;
      }
      this.ready = true;
      this.emit({ status: this.conflict ? 'conflict' : this.dirty ? 'pending' : 'saved' });
      await this.cache();
      this.schedule();
    } catch {
      if (generation === this.generation) this.emit({ status: 'offline' });
    } finally { this.refreshing = false; }
  }
  async flush() {
    clearTimeout(this.timer);
    if (!this.snapshot.user || !this.ready || !this.dirty || this.conflict || this.writing) return;
    const user = this.snapshot.user, generation = this.generation, version = this.version, workspace = this.snapshot.workspace;
    this.writing = true; this.emit({ status: 'saving' });
    let retry = 250;
    try {
      const revision = await withDeadline(this.remote.write(user, workspace, this.revision));
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
    if (!user || this.snapshot.loading || this.refreshing || this.writing || this.conflict) return;
    if (!this.ready) { await this.recoverConnection(); return; }
    // Foreground polling also serves as a watchdog for debounced saves whose
    // timer was suspended when iOS backgrounded the app.
    if (this.dirty) { await this.flush(); return; }
    const generation = this.generation, version = this.version;
    this.refreshing = true;
    try {
      const row = await withDeadline(this.remote.read(user));
      if (generation !== this.generation || version !== this.version || this.dirty || this.writing || !row || !validWorkspace(row.workspace)) return;
      if (row.revision === this.revision) return;
      const activeId = this.snapshot.workspace.activeId;
      const workspace = ensureLiveNote({ ...row.workspace, activeId: row.workspace.tabs.some(note => note.id === activeId && !isTrashed(note)) ? activeId : row.workspace.activeId }, this.id);
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
    const user = this.snapshot.user, generation = this.generation, version = this.version; if (!user || this.snapshot.loading) return;
    const row = await this.remote.read(user);
    if (!row || !validWorkspace(row.workspace)) throw new Error('Cloud notes could not be loaded. Local changes are kept.');
    if (generation !== this.generation) return;
    if (version !== this.version) throw new Error('Notes changed while loading the cloud copy. Nothing was replaced; back up your current notes and retry.');
    this.revision = row.revision; this.dirty = false; this.conflict = false; this.ready = true; this.version++;
    this.emit({ workspace: ensureLiveNote(row.workspace, this.id), status: 'saved' }); await this.cache();
  }
  importWorkspace(imported: Workspace): ImportResult {
    if (this.snapshot.loading || this.conflict) throw new Error('Wait for notes to finish loading or resolve the cloud conflict before importing.');
    const result = mergeWorkspaceNotes(this.snapshot.workspace, imported, this.id);
    if (result.added || result.foldersAdded) this.update(result.workspace);
    return result;
  }
  async importGuestNotes(): Promise<ImportResult> {
    if (!this.snapshot.user) throw new Error('Sign in to an account before importing guest notes.');
    const user = this.snapshot.user, version = this.version, generation = this.generation;
    const raw = await withDeadline(this.storage.getItem('bestpad:mobile:workspace:guest'), 7000);
    if (!raw) throw new Error('There are no saved guest notes on this device.');
    let guest: unknown;
    try { guest = JSON.parse(raw); } catch { throw new Error('Guest notes could not be read.'); }
    if (!validWorkspace(guest)) throw new Error('No valid guest notes were found on this device.');
    if (generation !== this.generation || version !== this.version || user !== this.snapshot.user) throw new Error('Your notes changed while importing. Try again.');
    return this.importWorkspace(guest);
  }
  retry = () => this.snapshot.loading ? Promise.resolve() : !this.ready ? this.recoverConnection() : this.conflict ? Promise.resolve() : this.dirty ? this.flush() : this.refresh();
  dispose() { clearTimeout(this.timer); this.listeners.clear(); }
}
