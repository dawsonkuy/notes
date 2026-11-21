const $ = (id) => document.getElementById(id);
let tabs = [];
let folders = [];
let currentFolder = null;
let libraryDrag = null, libraryDragEndedAt = 0;
const expandedFolders = new Set();
const unlockedNotes = new Map();
let noteKeyEpoch = 0;
const features = window.BestpadFeatures;
const workspaceValue = () => ({ tabs, folders, activeId });
let activeId;
let richEditor = null;
let renderingNote = false;
let renderedNoteId = null;
const editorPositions = new Map();
let storageKey = 'notepad:tabs';
let cloudUser = null;
let cloudRevision = null;
let cloudDirty = false;
let cloudReady = false;
let cloudConflict = false;
let cloudTimer;
let cloudWriting = false;
let accountGeneration = 0;
let savedPayload = '';
let savedNotesPayload = '';
const notesPayload = () => JSON.stringify({ tabs, folders });
let cloudChannel = null;
let cloudRefreshing = false;
let cloudRecovering = false;
// The last notes-and-folders payload confirmed by the cloud. Keeping this
// separate from UI/navigation state prevents no-op network writes.
let cloudConfirmedNotes = null;
let localRecoveryAvailable = true;
// Abort the network request and also stop waiting if the SDK stalls before
// fetch starts (for example while obtaining an Auth session lock).
async function cloudRequest(query, milliseconds = 12000) {
  const controller = new AbortController();
  let timeout;
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error('Cloud request timed out; local notes were kept.'));
    }, milliseconds);
  });
  try { return await Promise.race([query.abortSignal(controller.signal), deadline]); }
  finally { clearTimeout(timeout); }
}
const payload = () => JSON.stringify({ tabs, folders, activeId });
// Auth can check save safety before signing out, without inspecting note content.
window.bestpadHasUnsyncedChanges = () => Boolean(cloudUser && (cloudDirty || cloudWriting || cloudConflict));
function cacheNotes() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ tabs, folders, activeId, revision: cloudRevision, dirty: cloudDirty }));
    localRecoveryAvailable = true;
    return true;
  } catch {
    // Storage quota, private browsing, and device failures must never stop
    // the independent cloud-save queue.
    localRecoveryAvailable = false;
    return false;
  }
}
function queueCloudSave() {
  clearTimeout(cloudTimer);
  if (cloudUser && cloudReady && cloudDirty && !cloudConflict) cloudTimer = setTimeout(flushCloud, 700);
}

const isTrashed = note => typeof note.deletedAt === 'string' && note.deletedAt.length > 0;
const liveTabs = () => tabs.filter(note => !isTrashed(note));
const storedActive = () => tabs.find(tab => tab.id === activeId);
const active = () => unlockedNotes.get(activeId)?.note || storedActive();
const protectedPlainPayload = note => JSON.stringify({
  text: note.text, content: note.content, filename: note.filename, customName: note.customName,
});
const makeTab = (text = '', filename = 'Untitled') => ({ id: crypto.randomUUID(), text, filename, customName: filename !== 'Untitled' ? filename : null });
const noteName = tab => tab.customName || tab.text.split(/\r?\n/, 1)[0].trim().slice(0, 80) || 'Untitled';
// Keep the blank default note internally, but treat it as an empty library until edited.
function starterNoteId() {
  const notes = liveTabs();
  if (notes.length !== 1) return null;
  const note = notes[0];
  if (note.text || note.customName || note.filename !== 'Untitled' || note.order != null || note.pinned || note.folderId || note.sealed) return null;
  if (Array.isArray(note.content) && !note.content.every(op => op && op.insert === '\n' && !op.attributes)) return null;
  return note.id;
}
let emptyLibraryVisible = false;
const tabMenu = document.createElement('div');
tabMenu.className = 'tab-menu'; tabMenu.hidden = true;
tabMenu.setAttribute('role', 'menu'); document.body.append(tabMenu);
let draggedId = null;
let slashCommand = null;
let dismissedSlash = null;
let slashComposing = false;
const closeMenus = () => {
  if (slashCommand) dismissedSlash = `${slashCommand.noteId}:${slashCommand.index}`;
  slashCommand = null;
  document.querySelectorAll('#add-menu .is-keyboard-active').forEach(button => button.classList.remove('is-keyboard-active'));
  if (richEditor) { richEditor.root.removeAttribute('aria-activedescendant'); richEditor.root.removeAttribute('aria-expanded'); }
  tabMenu.hidden = true;
  $('add-menu').hidden = true;
};
function renameTab(tab) {
  closeMenus();
  if (tab.sealed) { alert('Remove password protection before renaming this note.'); return; }
  const name = prompt('Rename note (leave blank to use its first line):', noteName(tab));
  if (name === null) return;
  tab.customName = name.trim().slice(0, 80) || null;
  save();
}
function deleteTab(tab) {
  if (!tab || isTrashed(tab) || tab.id === starterNoteId() || !tabs.some(note => note.id === tab.id && !isTrashed(note))) return;
  closeMenus(); save();
  tabs = tabs.map(note => note.id === tab.id ? { ...note, deletedAt: new Date().toISOString() } : note);
  unlockedNotes.get(tab.id)?.key.fill(0); unlockedNotes.delete(tab.id);
  if (!liveTabs().length) tabs.push(makeTab());
  if (activeId === tab.id) activeId = liveTabs()[0].id;
  showTab(); save();
}
function renderTrash() {
  const deleted = tabs.filter(isTrashed);
  $('open-trash').textContent = `Trash (${deleted.length})`;
  const list = $('trash-list'); list.replaceChildren();
  if (!deleted.length) { const empty = document.createElement('p'); empty.textContent = 'Trash is empty.'; list.append(empty); }
  deleted.forEach(note => {
    const row = document.createElement('div'); row.className = 'trash-row';
    const title = document.createElement('span'); title.textContent = noteName(note);
    const restore = document.createElement('button'); restore.type = 'button'; restore.textContent = 'Restore'; restore.setAttribute('aria-label', `Restore ${noteName(note)}`);
    restore.onclick = () => {
      save();
      const placeholder = starterNoteId();
      if (placeholder) { tabs = tabs.filter(tab => tab.id !== placeholder); activeId = note.id; }
      delete note.deletedAt;
      showTab(); save();
    };
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'danger-button'; remove.textContent = 'Delete permanently'; remove.setAttribute('aria-label', `Permanently delete ${noteName(note)}`);
    remove.onclick = () => { if (!confirm(`Permanently delete ${noteName(note)}? This cannot be undone.`)) return; save(); tabs = tabs.filter(tab => tab.id !== note.id); renderTabs(); save(); };
    row.append(title, restore, remove); list.append(row);
  });
}
function downloadTab(tab) {
  closeMenus(); save();
  if (tab.sealed) { const session = unlockedNotes.get(tab.id); if (!session) { alert('Unlock this note before downloading it.'); return; } tab = session.note; }
  const url = URL.createObjectURL(new Blob([tab.text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  const name = noteName(tab).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '') || 'Untitled';
  link.href = url; link.download = /\.txt$/i.test(name) ? name : `${name}.txt`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function shareTab(tab) {
  closeMenus(); save();
  $('action-status').textContent = '';
  if (tab.sealed) {
    const session = unlockedNotes.get(tab.id);
    if (!session) { alert('Unlock this note before sharing it.'); return; }
    if (!confirm('Share protected note? The shared or copied text will be unencrypted and readable by anyone who receives it.')) return;
    // A lock, tab switch or account change may have happened while confirming.
    const current = tabs.find(note => note.id === tab.id);
    const latest = unlockedNotes.get(tab.id);
    if (!current?.sealed || !latest || document.hidden) { alert('Unlock this note again before sharing.'); return; }
    tab = latest.note;
  }
  const data = { title: noteName(tab), text: tab.text };
  try {
    if (navigator.share) {
      await navigator.share(data);
      $('action-status').textContent = 'Note shared';
    } else {
      await navigator.clipboard.writeText(tab.text);
      $('action-status').textContent = 'Note copied — paste it to share';
    }
  } catch (error) {
    if (error.name !== 'AbortError') $('action-status').textContent = 'Unable to share — use Save as to download the note';
  }
}
function openTabMenu(tab, anchor) {
  closeMenus(); tabMenu.replaceChildren();
  [['✎', 'Rename', () => renameTab(tab)], ['↓', 'Save as…', () => downloadTab(tab)], ['↗', 'Share', () => shareTab(tab)], ['⌖', tab.pinned ? 'Unpin note' : 'Pin note', () => togglePin(tab.id)], ['⌫', 'Move to Trash', () => deleteTab(tab)]].forEach(([icon, label, action]) => {
    const button = document.createElement('button'); button.setAttribute('role', 'menuitem');
    const glyph = document.createElement('span'); glyph.textContent = icon; glyph.setAttribute('aria-hidden', 'true');
    button.append(glyph, document.createTextNode(label)); button.onclick = action; tabMenu.append(button);
  });
  tabMenu.hidden = false;
  const rect = anchor.getBoundingClientRect();
  tabMenu.style.left = `${Math.max(0, Math.min(rect.left, innerWidth - tabMenu.offsetWidth))}px`;
  tabMenu.style.top = `${Math.min(rect.bottom, innerHeight - tabMenu.offsetHeight)}px`;
  tabMenu.firstElementChild.focus();
}
function reorderTab(id, targetId, after) {
  const from = tabs.findIndex(tab => tab.id === id);
  if (from < 0 || id === targetId) return;
  const [tab] = tabs.splice(from, 1);
  const to = tabs.findIndex(tab => tab.id === targetId);
  tabs.splice(to + (after ? 1 : 0), 0, tab);
  renderTabs(); save();
}

function position() {
  const text = $('editor').value;
  const before = text.slice(0, richEditor ? (richEditor.getSelection()?.index ?? $('editor').selectionStart) : $('editor').selectionStart);
  const lines = before.split('\n');
  $('position').textContent = `Ln ${lines.length}, Col ${lines.at(-1).length + 1}`;
  $('count').textContent = `${text.length.toLocaleString()} characters`;
}
function save() {
  if (storedActive()?.sealed && !unlockedNotes.has(activeId)) return;
  try {
    if (richEditor && !renderingNote) {
      $('editor').value = richEditor.getText().slice(0, -1);
      active().content = richEditor.getContents().ops;
    }
    active().text = $('editor').value;
    const session = unlockedNotes.get(activeId);
    if (storedActive()?.sealed && session) {
      const plainPayload = protectedPlainPayload(session.note);
      // AES-GCM uses a fresh random IV. Re-encrypting unchanged plaintext on
      // every blur, navigation, or save would mark the note dirty and could
      // produce a continuous stream of unnecessary cloud writes.
      if (plainPayload !== session.lastPlainPayload) {
        const original = storedActive();
        tabs = tabs.map(note => note.id === activeId
          ? features.encryptNote({ ...original, text: session.note.text, content: session.note.content, filename: session.note.filename, customName: session.note.customName }, session.key, original.sealed)
          : note);
        session.lastPlainPayload = plainPayload;
      }
    }
    refreshNames();
    const currentPayload = payload();
    if (currentPayload !== savedPayload) {
      // Opening another note is local navigation, not an edit to shared notes.
      if (cloudUser && notesPayload() !== savedNotesPayload) cloudDirty = true;
      savedPayload = currentPayload;
      savedNotesPayload = notesPayload();
    }
    const localOk = cacheNotes();
    $('save-status').textContent = !localOk
      ? cloudUser
        ? cloudDirty ? 'Browser backup unavailable · waiting to sync to cloud…' : cloudReady ? 'Saved to cloud · browser backup unavailable' : 'Browser backup unavailable · download a copy'
        : 'Local storage failed · download a copy before closing'
      : cloudUser
        ? cloudConflict ? 'Cloud conflict — local copy kept; download before reloading' : cloudDirty ? 'Saved locally · waiting to sync…' : 'Saved to cloud'
        : 'Saved locally';
    queueCloudSave();
  } catch { $('save-status').textContent = 'Unable to save — download a copy'; }
  position();
}
function setTitle() {
  document.title = `${noteName(active())} - Bestpad`;
  $('note-title').textContent = noteName(active());
}
function refreshNames() {
  const tab = active(), name = noteName(tab);
  const label = `${storedActive()?.pinned ? '📌 ' : ''}${storedActive()?.sealed ? '🔒 ' : ''}${name}`;
  if ($('note-title').textContent !== name) setTitle();
  if (Boolean(starterNoteId()) !== emptyLibraryVisible) renderTabs();
  const button = document.getElementById(`tab-${tab.id}`);
  if (!button) return;
  const title = button.querySelector('.note-list-title'), preview = button.querySelector('.note-list-preview'), text = notePreview(tab);
  if (title && title.textContent !== label) title.textContent = label;
  if (preview && preview.textContent !== text) preview.textContent = text;
  const options = button.parentElement.querySelector('.edit-tab');
  if (options?.getAttribute('aria-label') !== `Options for ${name}`) options?.setAttribute('aria-label', `Options for ${name}`);
}
$('editor').addEventListener('input', save);
['click', 'keyup', 'select'].forEach(type => $('editor').addEventListener(type, position));
function renderTabs() {
  if (libraryDrag?.active) finishLibraryDrag(false);
  const list = $('tabs'), starter = starterNoteId();
  emptyLibraryVisible = Boolean(starter);
  list.replaceChildren();
  list.setAttribute('role', starter && !folders.length ? 'group' : 'tablist');
  renderTrash();
  $('note-total').textContent = String(liveTabs().length - (starter ? 1 : 0));
  if (starter && !folders.length) {
    const empty = document.createElement('div'); empty.className = 'library-empty-state';
    const message = document.createElement('p'); message.textContent = 'Nothing here yet.';
    const create = document.createElement('button'); create.type = 'button'; create.textContent = 'Create note'; create.setAttribute('aria-label', 'Create note');
    create.onclick = () => {
      switchTab(starter);
      if (richEditor?.isEnabled()) richEditor.focus();
      else if (!$('editor').disabled) $('editor').focus();
    };
    empty.append(message, create); list.append(empty);
    return;
  }
  const items = features.treeEntries(workspaceValue(), expandedFolders).filter(entry => entry.id !== starter);
  items.forEach(entry => {
    const item = document.createElement('div'); item.className = 'tab'; item.dataset.entry = entry.id; item.style.marginLeft = `${entry.depth * 18}px`; item.style.width = `calc(100% - ${entry.depth * 18}px)`; item.draggable = false;
    const button = document.createElement('button'); button.type = 'button'; button.draggable = false; button.className = 'library-open';
    const note = tabs.find(note => note.id === entry.id);
    if (note) { button.id = `tab-${note.id}`; button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(note.id === activeId)); }
    const title = document.createElement('span'); title.className = 'note-list-title'; title.textContent = `${entry.pinned ? '📌 ' : ''}${note?.sealed ? '🔒 ' : ''}${entry.name}`;
    const preview = document.createElement('span'); preview.className = 'note-list-preview'; preview.textContent = note ? note.sealed ? 'Password protected' : notePreview(note) : 'Folder'; button.append(title, preview);
    button.onclick = () => { if (entry.kind === 'folder') { toggleFolder(entry.id); } else switchTab(entry.id); };
    const options = document.createElement('button'); options.type = 'button'; options.className = 'edit-tab'; options.textContent = '⋯'; options.setAttribute('aria-label', `Options for ${entry.name}`);
    options.onclick = () => { if (note) openTabMenu(note, options); else openFolderMenu(entry, options); };
    if (entry.kind === 'folder') { const arrow = document.createElement('button'); arrow.type = 'button'; arrow.className = 'folder-toggle'; arrow.innerHTML = folderIcon(expandedFolders.has(entry.id)); arrow.setAttribute('aria-label', `${expandedFolders.has(entry.id) ? 'Collapse' : 'Expand'} folder ${entry.name}`); arrow.setAttribute('aria-expanded', String(expandedFolders.has(entry.id))); arrow.onclick = () => toggleFolder(entry.id); item.append(arrow); }
    item.append(button, options); bindItemDrag(item, entry); $('tabs').append(item);
  });
}
function rememberEditorPosition() {
  if (!renderedNoteId) return;
  const previous = editorPositions.get(renderedNoteId);
  const range = richEditor ? richEditor.getSelection() || previous?.range : { index: $('editor').selectionStart, length: $('editor').selectionEnd - $('editor').selectionStart };
  editorPositions.set(renderedNoteId, { range, scroll: richEditor ? richEditor.root.scrollTop : $('editor').scrollTop });
}
function restoreEditorPosition() {
  const position = editorPositions.get(activeId);
  const max = richEditor ? richEditor.getLength() - 1 : $('editor').value.length;
  const index = Math.max(0, Math.min(position?.range?.index ?? 0, max)), length = Math.max(0, Math.min(position?.range?.length ?? 0, max - index));
  if (richEditor) { if (richEditor.root.contains(document.activeElement)) richEditor.setSelection(index, length, 'silent'); richEditor.root.scrollTop = position?.scroll || 0; }
  else { $('editor').setSelectionRange(index, index + length); $('editor').scrollTop = position?.scroll || 0; }
}
function showTab() {
  rememberEditorPosition();
  $('editor').value = active().text;
  if (richEditor) renderRichNote();
  setTitle(); renderTabs(); position();
  if (!document.hidden && !isLocked() && (!window.matchMedia('(pointer: coarse)').matches || document.activeElement === $('editor') || (richEditor && richEditor.root.contains(document.activeElement)))) {
    if (richEditor) richEditor.focus({ preventScroll: true });
    else $('editor').focus({ preventScroll: true });
  }
  renderLockState();
  if (!isLocked()) restoreEditorPosition(); renderedNoteId = activeId; position();
  const selected = document.getElementById(`tab-${activeId}`)?.parentElement;
  if (selected) {
    const strip = $('tabs');
    if (selected.offsetTop < strip.scrollTop) strip.scrollTop = selected.offsetTop;
    else if (selected.offsetTop + selected.offsetHeight > strip.scrollTop + strip.clientHeight) strip.scrollTop = selected.offsetTop + selected.offsetHeight - strip.clientHeight;
  }
}
function switchTab(id, keepSidebar = false) { if (!tabs.some(note => note.id === id && !isTrashed(note))) return; save(); activeId = id; showTab(); save(); if (!keepSidebar) setNotesDrawer(false); }
function addTab(text = '', filename = 'Untitled') {
  if ($('add-tab').disabled) return;
  // A fresh workspace already has one editable starter note. Reuse it.
  const starter = !text && filename === 'Untitled' ? starterNoteId() : null;
  if (starter) {
    // Materialize a deliberate blank note when folders exist; otherwise it stays
    // an internal placeholder until the user begins typing.
    if (folders.length) {
      tabs = tabs.map(tab => tab.id === starter ? { ...tab, folderId: currentFolder, order: Date.now() } : tab);
    }
    switchTab(starter);
    if (richEditor?.isEnabled()) richEditor.focus();
    else if (!$('editor').disabled) $('editor').focus();
    return;
  }
  save(); const tab = { ...makeTab(text, filename), folderId: currentFolder, order: Date.now() }; tabs.push(tab); activeId = tab.id;
  showTab(); save(); closeMenus(); setNotesDrawer(false);
}
$('add-tab').onclick = () => addTab();
document.addEventListener('click', event => { if (!event.target.closest('.edit-tab, .tab-menu, .add-menu')) closeMenus(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeMenus(); setNotesDrawer(false, true); }
  if (tabMenu.contains(event.target) && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault();
    const items = [...tabMenu.children];
    items[(items.indexOf(document.activeElement) + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); downloadTab(active()); }
  if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'n') { event.preventDefault(); addTab(); }
});
try {
  const stored = JSON.parse(localStorage.getItem('notepad:tabs') || 'null');
  if (stored?.tabs?.length && stored.tabs.every(tab => typeof tab.id === 'string' && typeof tab.text === 'string' && typeof tab.filename === 'string')) {
    tabs = stored.tabs; folders = stored.folders || [];
    tabs.forEach(tab => { if (!Object.hasOwn(tab, 'customName')) tab.customName = tab.filename !== 'Untitled' ? tab.filename : null; });
    activeId = tabs.some(tab => tab.id === stored.activeId) ? stored.activeId : tabs[0].id;
  } else {
    const previous = sessionStorage.getItem('notepad:user');
    const old = JSON.parse(localStorage.getItem('notepad:note') ?? (previous ? localStorage.getItem(`notepad:note:${previous}`) : null) ?? 'null');
    tabs = [makeTab(old?.text || '', old?.filename || 'Untitled')]; activeId = tabs[0].id;
  }
} catch {
  tabs = [makeTab()]; activeId = tabs[0].id;
  $('save-status').textContent = 'Unable to restore local notes — you can still edit and download';
}
if (!liveTabs().length) tabs.push(makeTab());
if (!liveTabs().some(note => note.id === activeId)) activeId = liveTabs()[0].id;
showTab();

function validWorkspace(value) {
  return value && Array.isArray(value.tabs) && value.tabs.length > 0 && value.tabs.every(tab => typeof tab.id === 'string' && typeof tab.text === 'string' && typeof tab.filename === 'string');
}
function useWorkspace(value, preserveEditor = false) {
  tabs = value.tabs; folders = Array.isArray(value.folders) ? value.folders : [];
  if (currentFolder && !folders.some(folder => folder.id === currentFolder)) currentFolder = null;
  if (!liveTabs().length) tabs.push(makeTab());
  activeId = liveTabs().some(tab => tab.id === value.activeId) ? value.activeId : liveTabs()[0].id;
  savedPayload = payload();
  savedNotesPayload = notesPayload();
  if (preserveEditor) { setTitle(); renderTabs(); position(); } else showTab();
}
async function flushCloud() {
  if (!cloudUser || !cloudReady || cloudConflict || !cloudDirty || cloudWriting) return;
  // Edits subsequently undone back to the last confirmed contents do not
  // require another PATCH, even if cloudDirty was previously set.
  if (cloudConfirmedNotes !== null && notesPayload() === cloudConfirmedNotes) {
    cloudDirty = false;
    const localOk = cacheNotes();
    $('save-status').textContent = localOk ? 'Saved to cloud' : 'Saved to cloud · browser backup unavailable';
    return;
  }
  cloudWriting = true;
  const userId = cloudUser, generation = accountGeneration, contents = payload(), revision = cloudRevision;
  $('save-status').textContent = 'Saving to cloud…';
  try {
    const snapshot = JSON.parse(contents);
    const row = { user_id: userId, tabs: snapshot.tabs, folders: snapshot.folders || [], active_id: snapshot.activeId, revision: (revision || 0) + 1, updated_at: new Date().toISOString() };
    const query = revision === null
      ? window.notesClient.from('note_workspaces').insert(row)
      : window.notesClient.from('note_workspaces').update(row).eq('user_id', userId).eq('revision', revision);
    const { data, error } = await cloudRequest(query.select('revision'));
    if (generation !== accountGeneration) return;
    if (error?.code === '23505' || (!error && !data?.length)) {
      cloudConflict = true;
      throw new Error('conflict');
    }
    if (error) throw error;
    cloudRevision = data[0].revision;
    // A successful write confirms exactly the payload sent, not any edits
    // typed while the request was in flight.
    cloudConfirmedNotes = JSON.stringify({ tabs: snapshot.tabs, folders: snapshot.folders || [] });
    cloudDirty = notesPayload() !== cloudConfirmedNotes;
    const localOk = cacheNotes();
    $('save-status').textContent = !localOk
      ? cloudDirty ? 'Browser backup unavailable · waiting to sync again…' : 'Saved to cloud · browser backup unavailable'
      : cloudDirty ? 'Saved locally · waiting to sync…' : 'Saved to cloud';
  } catch {
    if (generation === accountGeneration) $('save-status').textContent = cloudConflict
      ? 'Cloud conflict — local copy kept; download before reloading'
      : localRecoveryAvailable ? 'Saved locally · sync failed, will retry' : 'Browser backup unavailable · cloud sync failed — download a copy';
  } finally {
    cloudWriting = false;
    if (cloudDirty && !cloudConflict && cloudReady) cloudTimer = setTimeout(flushCloud, 5000);
    if (cloudConflict && generation === accountGeneration) void clearIdenticalCloudConflict();
  }
}

function downloadWorkspaceBackup(kind, workspace, revision) {
  const backup = { app: 'Bestpad', source: kind, savedAt: new Date().toISOString(), revision, folders: workspace.folders || [], tabs: workspace.tabs, activeId: workspace.activeId };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `bestpad-${kind}-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function readCloudWorkspace(user) {
  const { data, error } = await cloudRequest(window.notesClient.from('note_workspaces').select('*').eq('user_id', user).maybeSingle());
  if (error) throw error;
  if (data && (!validWorkspace({ tabs: data.tabs }) || !Number.isInteger(data.revision))) throw new Error('Cloud copy was invalid. Neither version was changed.');
  return data;
}
// A change to the selected tab alone is not a real note conflict.
async function clearIdenticalCloudConflict() {
  if (!cloudConflict || cloudWriting || !cloudUser) return;
  const user = cloudUser, generation = accountGeneration, localNotes = notesPayload();
  try {
    const remote = await readCloudWorkspace(user);
    if (generation !== accountGeneration || !cloudConflict || localNotes !== notesPayload()) return;
    if (remote && JSON.stringify({ tabs: remote.tabs, folders: remote.folders || [] }) === localNotes) {
      cloudConfirmedNotes = localNotes;
      cloudRevision = remote.revision;
      cloudDirty = false;
      cloudConflict = false;
      cacheNotes();
      $('save-status').textContent = 'Saved to cloud';
    }
  } catch { /* The local recovery copy remains intact. */ }
}
async function resolveCloudConflict(choice) {
  if (!cloudUser || !cloudConflict || cloudWriting) return;
  const user = cloudUser, generation = accountGeneration, local = JSON.parse(payload()), localRevision = cloudRevision;
  if (choice === 'cloud' && !confirm('Replace the notes shown on this device with the current cloud notes? A full JSON backup of your local notes will be downloaded first.')) return;
  if (choice === 'local' && !confirm('Replace the cloud notes with this device’s notes? A full JSON backup of the current cloud notes will be downloaded first. Other devices will then receive your changes.')) return;
  cloudWriting = true;
  $('sync-message').textContent = 'Checking both copies…';
  try {
    const remote = await readCloudWorkspace(user);
    if (generation !== accountGeneration || !cloudConflict) return;
    if (choice === 'backup') {
      downloadWorkspaceBackup('local', local, localRevision);
      if (remote) downloadWorkspaceBackup('cloud', { tabs: remote.tabs, folders: remote.folders || [], activeId: remote.active_id }, remote.revision);
      $('sync-message').textContent = remote ? 'Both backups requested. Check your Downloads folder before proceeding.' : 'Local backup requested. No cloud workspace was found.';
      return;
    }
    if (choice === 'cloud') {
      if (!remote) throw new Error('No cloud copy found. Your local notes were not changed.');
      downloadWorkspaceBackup('local', local, localRevision);
      cloudConfirmedNotes = JSON.stringify({ tabs: remote.tabs, folders: remote.folders || [] });
      cloudRevision = remote.revision;
      cloudDirty = false;
      cloudConflict = false;
      useWorkspace({ tabs: remote.tabs, folders: remote.folders || [], activeId: remote.active_id });
      cacheNotes();
      $('save-status').textContent = 'Saved to cloud';
      $('sync-dialog').close();
      return;
    }
    if (choice === 'local') {
      if (remote) downloadWorkspaceBackup('cloud', { tabs: remote.tabs, folders: remote.folders || [], activeId: remote.active_id }, remote.revision);
      const revision = remote?.revision ?? null;
      const row = { user_id: user, folders: local.folders || [], tabs: local.tabs, active_id: local.activeId, revision: (revision ?? 0) + 1, updated_at: new Date().toISOString() };
      const query = revision === null
        ? window.notesClient.from('note_workspaces').insert(row)
        : window.notesClient.from('note_workspaces').update(row).eq('user_id', user).eq('revision', revision);
      const { data, error } = await cloudRequest(query.select('revision'));
      if (generation !== accountGeneration) return;
      if (error?.code === '23505' || (!error && !data?.length)) throw new Error('Cloud changed again. Please download fresh backups and retry.');
      if (error) throw error;
      cloudRevision = data[0].revision;
      cloudConfirmedNotes = JSON.stringify({ tabs: local.tabs, folders: local.folders || [] });
      cloudConflict = false;
      cloudDirty = notesPayload() !== cloudConfirmedNotes;
      cacheNotes();
      $('save-status').textContent = cloudDirty ? 'Saved locally · waiting to sync…' : 'Saved to cloud';
      $('sync-dialog').close();
      if (cloudDirty) queueCloudSave();
    }
  } catch (error) {
    if (generation === accountGeneration) $('sync-message').textContent = error?.message || 'Unable to resolve conflict. Both copies are unchanged.';
  } finally {
    cloudWriting = false;
  }
}
$('resolve-cloud').onclick = () => { if (cloudConflict) { $('sync-message').textContent = 'Download backups first if you want to keep both versions.'; $('sync-dialog').showModal(); } };
$('close-sync').onclick = () => $('sync-dialog').close();
$('sync-backup').onclick = () => { void resolveCloudConflict('backup'); };
$('sync-use-cloud').onclick = () => { void resolveCloudConflict('cloud'); };
$('sync-use-local').onclick = () => { void resolveCloudConflict('local'); };

async function refreshCloud() {
  if (!cloudUser || !cloudReady || cloudDirty || cloudWriting || cloudConflict || cloudRefreshing || slashComposing || libraryDrag?.active || document.hidden) return;
  const user = cloudUser, generation = accountGeneration, contents = payload();
  cloudRefreshing = true;
  try {
    const { data, error } = await cloudRequest(window.notesClient.from('note_workspaces').select('*').eq('user_id', user).maybeSingle());
    if (error || !data || generation !== accountGeneration || cloudDirty || cloudWriting || slashComposing || contents !== payload() || data.revision === cloudRevision || !validWorkspace({ tabs: data.tabs })) return;
    const selection = richEditor?.getSelection(), scroll = richEditor?.root.scrollTop, focused = document.activeElement;
    const selected = activeId;
    unlockedNotes.forEach((session, id) => { const old = tabs.find(note => note.id === id), next = data.tabs.find(note => note.id === id); if (JSON.stringify(old?.sealed) !== JSON.stringify(next?.sealed)) { session.key.fill(0); unlockedNotes.delete(id); } });
    cloudRevision = data.revision;
    cloudConfirmedNotes = JSON.stringify({ tabs: data.tabs, folders: data.folders || [] });
    const incoming = data.tabs.find(note => note.id === selected && !isTrashed(note));
    const sameBody = incoming && incoming.text === active().text && JSON.stringify(incoming.content) === JSON.stringify(active().content);
    useWorkspace({ tabs: data.tabs, folders: data.folders || [], activeId: data.tabs.some(note => note.id === selected) ? selected : data.active_id }, Boolean(sameBody));
    if (richEditor && selection) { const index = Math.min(selection.index, richEditor.getLength() - 1); richEditor.setSelection(index, Math.min(selection.length, richEditor.getLength() - 1 - index), 'silent'); richEditor.root.scrollTop = scroll; }
    if (focused instanceof HTMLElement && focused !== $('editor') && !richEditor?.root.contains(focused)) focused.focus({ preventScroll: true });
    cacheNotes(); $('save-status').textContent = 'Saved to cloud';
  } catch { /* Retry on the next live event or fallback refresh. */ }
  finally { cloudRefreshing = false; }
}
async function loadAccount(userId) {
  if (userId === cloudUser) return;
  save();
  clearTimeout(cloudTimer);
  if ($('sync-dialog').open) $('sync-dialog').close();
  clearNoteKeys(); currentFolder = null; editorPositions.clear(); renderedNoteId = null;
  const generation = ++accountGeneration;
  if (cloudChannel) { void window.notesClient.removeChannel(cloudChannel); cloudChannel = null; }
  cloudUser = userId;
  if (userId) cloudChannel = window.notesClient.channel(`web-notes:${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'note_workspaces', filter: `user_id=eq.${userId}` }, refreshCloud).subscribe(status => { if (status === 'SUBSCRIBED') void refreshCloud(); });
  cloudReady = false; cloudConflict = false; cloudRevision = null; cloudDirty = false; cloudConfirmedNotes = null;
  storageKey = userId ? `notepad:tabs:${userId}` : 'notepad:tabs';
  let cached;
  try { cached = JSON.parse(localStorage.getItem(storageKey)); } catch { /* Keep recovery available through local storage. */ }
  const empty = () => { const tab = makeTab(); return { tabs: [tab], activeId: tab.id }; };
  useWorkspace(validWorkspace(cached) ? cached : empty());
  if (!userId) { $('save-status').textContent = 'Saved locally'; return; }
  setEditorEnabled(false);
  $('editor').disabled = true; $('add-tab').disabled = true; $('tabs').inert = true;
  $('save-status').textContent = 'Loading saved notes…';
  try {
    const { data, error } = await cloudRequest(window.notesClient.from('note_workspaces').select('*').eq('user_id', userId).maybeSingle());
    if (generation !== accountGeneration) return;
    if (error) throw error;
    cloudRevision = data?.revision ?? null;
    cloudConfirmedNotes = data ? JSON.stringify({ tabs: data.tabs, folders: data.folders || [] }) : null;
    if (cached?.dirty && validWorkspace(cached)) {
      cloudDirty = true;
      cloudConflict = (cached.revision ?? null) !== cloudRevision;
      if (cloudConfirmedNotes !== null && cloudConfirmedNotes === notesPayload()) {
        // The browser cached a pending flag after a write that already landed.
        cloudDirty = false;
        cloudConflict = false;
      }
      if (cloudConflict) cloudRevision = cached.revision ?? null;
    } else if (data) {
      if (!validWorkspace({ tabs: data.tabs })) throw new Error('Invalid saved notes');
      useWorkspace({ tabs: data.tabs, folders: data.folders || [], activeId: data.active_id });
    } else {
      // Import this browser's original notes only into the first account used here.
      const owner = localStorage.getItem('notepad:import-owner');
      if (!owner || owner === userId) {
        const guest = JSON.parse(localStorage.getItem('notepad:tabs') || 'null');
        if (validWorkspace(guest)) useWorkspace(guest);
        localStorage.setItem('notepad:import-owner', userId);
      }
      cloudDirty = true;
    }
    cloudReady = true;
    cacheNotes();
    $('save-status').textContent = cloudConflict ? 'Cloud conflict — local copy kept; download before reloading' : cloudDirty ? 'Saved locally · waiting to sync…' : 'Saved to cloud';
    queueCloudSave();
    if (cloudConflict) void clearIdenticalCloudConflict();
  } catch {
    // A failed read must never permit overwriting unknown cloud contents.
    cloudRevision = Number.isInteger(cached?.revision) ? cached.revision : null;
    cloudDirty = cloudDirty || Boolean(cached?.dirty);
    $('save-status').textContent = 'Cloud unavailable · saved locally; reconnect to retry';
  } finally {
    if (generation === accountGeneration) {
      setEditorEnabled(true);
      $('editor').disabled = false; $('add-tab').disabled = false; $('tabs').inert = false;
    }
  }
}
savedPayload = payload();
savedNotesPayload = notesPayload();
if (window.notesClient) {
  window.notesClient.auth.onAuthStateChange((_event, session) => {
    // Supabase auth callbacks stay synchronous; defer database requests.
    setTimeout(() => loadAccount(session?.user.id || null), 0);
  });
}
// Recover cloud state in place after a failed sign-in/read. Do not reload the
// account and discard notes the user typed while the network was unavailable.
async function recoverCloud() {
  if (!cloudUser || cloudReady || cloudRecovering || document.hidden) return;
  const user = cloudUser, generation = accountGeneration, before = notesPayload();
  cloudRecovering = true;
  try {
    const remote = await readCloudWorkspace(user);
    if (generation !== accountGeneration || user !== cloudUser) return;
    if (notesPayload() !== before) cloudDirty = true;
    const previousRevision = cloudRevision;
    cloudConfirmedNotes = remote ? JSON.stringify({ tabs: remote.tabs, folders: remote.folders || [] }) : null;
    if (cloudDirty) {
      cloudConflict = previousRevision !== (remote?.revision ?? null);
      if (cloudConfirmedNotes !== null && notesPayload() === cloudConfirmedNotes) {
        cloudDirty = false;
        cloudConflict = false;
      }
    } else if (remote) {
      useWorkspace({ tabs: remote.tabs, folders: remote.folders || [], activeId: remote.active_id });
    } else {
      cloudDirty = true;
    }
    cloudRevision = cloudConflict ? previousRevision : (remote?.revision ?? null);
    cloudReady = true;
    cacheNotes();
    $('save-status').textContent = cloudConflict ? 'Cloud conflict — local copy kept; download before reloading' : cloudDirty ? 'Saved locally · waiting to sync…' : 'Saved to cloud';
    if (cloudConflict) void clearIdenticalCloudConflict();
    else queueCloudSave();
  } catch {
    if (generation === accountGeneration) $('save-status').textContent = 'Cloud unavailable · saved locally; reconnect to retry';
  } finally { cloudRecovering = false; }
}
window.addEventListener('online', () => { if (cloudUser && !cloudReady) void recoverCloud(); else void flushCloud(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) void flushCloud();
  else if (cloudUser && !cloudReady) void recoverCloud();
  else void refreshCloud();
});
// Realtime drives active cloud refreshes. Poll only to recover disconnected
// reads, so an outage doesn't leave the user permanently offline until reload.
setInterval(() => { if (cloudUser && !cloudReady && navigator.onLine && !document.hidden) void recoverCloud(); }, 10000);
window.addEventListener('beforeunload', event => {
  if (cloudUser && cloudDirty) { event.preventDefault(); event.returnValue = ''; }
});

// Follow the visible viewport rather than leaving the editor behind the keyboard.
if (window.visualViewport) {
  let viewportFrame;
  const updateViewport = () => {
    cancelAnimationFrame(viewportFrame);
    viewportFrame = requestAnimationFrame(() => {
      const viewport = window.visualViewport;
      // Preserve native pinch zoom.
      if (viewport.scale !== 1) return;
      document.documentElement.style.setProperty('--viewport-height', `${viewport.height}px`);
      document.documentElement.style.setProperty('--viewport-top', `${viewport.offsetTop}px`);
      closeMenus();
    });
  };
  window.visualViewport.addEventListener('resize', updateViewport);
  window.visualViewport.addEventListener('scroll', updateViewport);
  window.addEventListener('resize', updateViewport);
  updateViewport();
}

function safeNoteContents(tab) {
  if (!Array.isArray(tab.content)) return null;
  // Restore only supported inline and line styles, plus our own divider embed.
  const ops = tab.content.map(op => {
    if (!op) return null;
    if (typeof op.insert !== 'string') {
      return op.insert && op.insert.divider === true && Object.keys(op.insert).length === 1 ? { insert: { divider: true } } : null;
    }
    const result = { insert: op.insert };
    const attributes = {};
    if ([1, 2, 3].includes(op.attributes?.header)) attributes.header = op.attributes.header;
    else if (['checked', 'unchecked', 'bullet', 'ordered'].includes(op.attributes?.list)) attributes.list = op.attributes.list;
    if (op.attributes?.bold === true) attributes.bold = true;
    if (op.attributes?.italic === true) attributes.italic = true;
    if (op.attributes?.underline === true) attributes.underline = true;
    if (Object.keys(attributes).length) result.attributes = attributes;
    return result;
  });
  if (ops.some(op => !op) || ops.filter(op => typeof op.insert === 'string').map(op => op.insert).join('') !== tab.text + '\n') return null;
  return ops;
}
function renderRichNote() {
  renderingNote = true;
  try {
    const contents = safeNoteContents(active());
    if (contents) richEditor.setContents({ ops: contents }, 'silent');
    else richEditor.setText(active().text + '\n', 'silent');
    richEditor.history.clear();
    richEditor.root.scrollTop = 0;
    updateHeadingButtons();
    enhanceChecklist();
  } finally { renderingNote = false; }
}
function setEditorEnabled(enabled) {
  if (richEditor) richEditor.enable(enabled);
  document.querySelectorAll('[data-heading], [data-insert], [data-inline-format]').forEach(button => { button.disabled = !enabled; });
  if (!enabled) closeMenus();
}
function updateHeadingButtons() {
  const range = richEditor?.getSelection();
  const format = range ? richEditor.getFormat(range) : {};
  const level = format.header || 0;
  document.querySelectorAll('[data-heading]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.heading) === level)));
  document.querySelectorAll('[data-inline-format]').forEach(button => button.setAttribute('aria-pressed', String(Boolean(format[button.dataset.inlineFormat]))));
}
if (window.Quill) {
  const BlockEmbed = window.Quill.import('blots/block/embed');
  class Divider extends BlockEmbed {
    static blotName = 'divider';
    static tagName = 'HR';
    static create() {
      const node = super.create();
      node.setAttribute('contenteditable', 'false');
      node.setAttribute('role', 'separator');
      return node;
    }
    static value() { return true; }
  }
  window.Quill.register(Divider);
  richEditor = new window.Quill('#rich-editor', { formats: ['header', 'list', 'divider', 'bold', 'italic', 'underline'], modules: { toolbar: false }, placeholder: 'Start writing… Use the toolbar for lists, date, or time.' });
  richEditor.root.setAttribute('role', 'textbox');
  richEditor.root.setAttribute('aria-label', 'Note text');
  richEditor.root.setAttribute('aria-multiline', 'true');
  richEditor.root.setAttribute('aria-describedby', 'save-status');
  richEditor.root.setAttribute('spellcheck', 'true');
  $('rich-editor').hidden = false;
  $('editor-format-toolbar').hidden = false;
  $('editor').hidden = true;
  document.querySelectorAll('[role="tab"]').forEach(button => button.setAttribute('aria-controls', 'rich-editor'));
  renderRichNote();
  richEditor.on('text-change', () => { if (!renderingNote) { save(); updateHeadingButtons(); enhanceChecklist(); } });
  richEditor.on('selection-change', range => {
    if (range) { $('editor').selectionStart = Math.min(range.index, $('editor').value.length); editorPositions.set(activeId, { range, scroll: richEditor.root.scrollTop }); }
    position(); updateHeadingButtons();
  });
  document.querySelectorAll('[data-heading]').forEach(button => {
    button.addEventListener('pointerdown', event => event.preventDefault());
    button.addEventListener('click', () => {
      const range = richEditor.getSelection(true) || { index: 0, length: 0 };
      const requested = Number(button.dataset.heading);
      const current = richEditor.getFormat(range).header || 0;
      richEditor.formatLine(range.index, range.length, 'header', current === requested ? false : requested, 'user');
      richEditor.setSelection(range.index, range.length, 'silent');
      richEditor.focus();
      updateHeadingButtons();
    });
  });
}

document.querySelectorAll('[data-inline-format]').forEach(button => {
  button.addEventListener('pointerdown', event => event.preventDefault());
  button.addEventListener('click', () => {
    if (!richEditor || !richEditor.isEnabled()) return;
    const kind = button.dataset.inlineFormat;
    const selection = richEditor.getSelection(true);
    if (!selection) return;
    const enabled = !Boolean(richEditor.getFormat(selection)[kind]);
    richEditor.format(kind, enabled, 'user');
    richEditor.focus();
    updateHeadingButtons();
    closeMenus();
  });
});
function insertNoteItem(kind) {
  const command = slashCommand;
  closeMenus();
  if (!richEditor || !richEditor.isEnabled()) return;
  const range = command && command.noteId === activeId && richEditor.getText(command.index, command.length) === command.text
    ? { index: command.index, length: command.length }
    : richEditor.getSelection(true) || { index: Math.max(0, richEditor.getLength() - 1), length: 0 };
  richEditor.history.cutoff();
  const Delta = window.Quill.import('delta');
  if (kind === 'time' || kind === 'date') {
    const time = new Intl.DateTimeFormat(undefined, kind === 'date' ? { year: 'numeric', month: 'long', day: 'numeric' } : { hour: 'numeric', minute: '2-digit' }).format(new Date());
    richEditor.updateContents(new Delta().retain(range.index).delete(range.length).insert(time), 'user');
    richEditor.setSelection(range.index + time.length, 0, 'user');
  } else {
    const prefix = range.index > 0 && richEditor.getText(range.index - 1, 1) !== '\n' ? '\n' : '';
    const format = richEditor.getFormat(range.index, 0);
    const previousFormat = format.header ? { header: format.header } : format.list ? { list: format.list } : {};
    const change = new Delta().retain(range.index).delete(range.length);
    if (prefix) change.insert(prefix, previousFormat);
    if (kind === 'divider') {
      change.insert({ divider: true });
      richEditor.updateContents(change, 'user');
      richEditor.setSelection(range.index + prefix.length + 1, 0, 'user');
    } else {
      const headingLevel = kind === 'heading' ? 1 : /^heading-[123]$/.test(kind) ? Number(kind.slice(-1)) : null;
      const listType = kind === 'checklist' ? 'unchecked' : kind === 'bullet-list' ? 'bullet' : kind === 'numbered-list' ? 'ordered' : null;
      if (!headingLevel && !listType) return;
      const placeholder = headingLevel ? 'Heading' : kind === 'checklist' ? 'To-do' : 'List item';
      const attributes = headingLevel ? { header: headingLevel } : { list: listType };
      change.insert(placeholder).insert('\n', attributes);
      richEditor.updateContents(change, 'user');
      richEditor.setSelection(range.index + prefix.length, placeholder.length, 'user');
    }
  }
  richEditor.history.cutoff();
  updateHeadingButtons();
}
document.querySelectorAll('[data-insert]').forEach(button => {
  button.addEventListener('pointerdown', event => event.preventDefault());
  button.addEventListener('click', () => insertNoteItem(button.dataset.insert));
});
$('add-menu').addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault(); closeMenus(); richEditor?.focus(); return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const buttons = [...$('add-menu').children];
  const index = buttons.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next].focus({ preventScroll: true });
});
window.addEventListener('resize', closeMenus);

function enhanceChecklist() {
  if (!richEditor) return;
  richEditor.root.querySelectorAll('li[data-list="checked"], li[data-list="unchecked"]').forEach(item => {
    const checkbox = item.querySelector('.ql-ui');
    if (!checkbox) return;
    checkbox.setAttribute('role', 'checkbox');
    checkbox.setAttribute('tabindex', '0');
    checkbox.setAttribute('aria-checked', String(item.dataset.list === 'checked'));
    checkbox.setAttribute('aria-label', item.textContent.trim() || 'Task');
    checkbox.onkeydown = event => {
      if (![' ', 'Enter'].includes(event.key) || !richEditor.isEnabled()) return;
      event.preventDefault();
      checkbox.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    };
  });
}

function notePreview(tab) {
  const lines = tab.text.split('\n');
  const preview = (lines[0].trim() === noteName(tab) ? lines.slice(1).join(' ') : tab.text).trim().replace(/\s+/g, ' ');
  return preview.slice(0, 100) || 'No additional text';
}
function setNotesDrawer(open, returnFocus = false) {
  if (!window.matchMedia('(max-width: 760px)').matches) open = false;
  $('notepad').classList.toggle('notes-open', open);
  $('toggle-notes').setAttribute('aria-expanded', String(open));
  $('notes-backdrop').hidden = !open;
  $('notes-sidebar').inert = window.matchMedia('(max-width: 760px)').matches && !open;
  document.querySelector('.editor-pane').inert = open;
  if (open) {
    $('notes-sidebar').setAttribute('role', 'dialog');
    $('notes-sidebar').setAttribute('aria-modal', 'true');
    $('close-notes').focus({ preventScroll: true });
  } else {
    $('notes-sidebar').removeAttribute('role');
    $('notes-sidebar').removeAttribute('aria-modal');
    if (returnFocus) $('toggle-notes').focus({ preventScroll: true });
  }
}
$('toggle-notes').onclick = () => setNotesDrawer(!$('notepad').classList.contains('notes-open'));
$('close-notes').onclick = () => setNotesDrawer(false, true);
$('notes-backdrop').onclick = () => setNotesDrawer(false, true);
$('rename-current').onclick = () => { if (!$('editor').disabled) renameTab(active()); };
$('download-current').onclick = () => downloadTab(active());
$('share-current').onclick = () => shareTab(active());
document.addEventListener('keydown', event => {
  if (event.key !== 'Tab' || !$('notepad').classList.contains('notes-open')) return;
  const focusable = [...$('notes-sidebar').querySelectorAll('button:not(:disabled), input, [tabindex="0"]')].filter(el => el.offsetParent !== null && el.tabIndex >= 0);
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
window.matchMedia('(max-width: 760px)').addEventListener('change', () => setNotesDrawer(false));
setNotesDrawer(false);
const updateSaveIndicator = () => {
  const message = $('save-status').textContent.toLowerCase();
  document.querySelector('footer').dataset.saveState = /conflict|failed|unable|unavailable/.test(message) ? 'error' : /saving|waiting|loading/.test(message) ? 'waiting' : 'saved';
  $('resolve-cloud').hidden = !cloudConflict;
};
new MutationObserver(updateSaveIndicator).observe($('save-status'), { childList: true, characterData: true, subtree: true });
updateSaveIndicator();

document.querySelector('.header-actions').addEventListener('click', () => {
  if ($('notepad').classList.contains('notes-open')) setNotesDrawer(false);
});

function highlightSlashOption(index) {
  if (!slashCommand) return;
  const options = [...$('add-menu').querySelectorAll('[data-insert]')];
  slashCommand.selected = (index + options.length) % options.length;
  options.forEach((button, i) => {
    button.classList.toggle('is-keyboard-active', i === slashCommand.selected);
    if (i === slashCommand.selected) button.scrollIntoView({ block: 'nearest' });
  });
  richEditor.root.setAttribute('aria-activedescendant', options[slashCommand.selected].id);
}
function updateSlashCommand() {
  if (!richEditor || !richEditor.isEnabled() || slashComposing) return;
  const range = richEditor.getSelection();
  if (!range || range.length || document.activeElement !== richEditor.root) return;
  const before = richEditor.getText(0, range.index);
  const match = /(?:^|\s)(\/(?:add|insert))$/.exec(before);
  if (!match) {
    if (slashCommand) closeMenus();
    dismissedSlash = null;
    return;
  }
  const index = range.index - match[1].length;
  const key = `${activeId}:${index}`;
  if (key === dismissedSlash) return;
  if (!slashCommand || slashCommand.index !== index || slashCommand.noteId !== activeId || slashCommand.text !== match[1]) {
    closeMenus();
    dismissedSlash = null;
    slashCommand = { index, noteId: activeId, selected: 0, length: match[1].length, text: match[1] };
  }
  const menu = $('add-menu');
  menu.hidden = false;
  richEditor.root.setAttribute('aria-controls', 'add-menu');
  richEditor.root.setAttribute('aria-expanded', 'true');
  highlightSlashOption(slashCommand.selected);
  const bounds = richEditor.getBounds(range.index);
  if (!bounds) return;
  const container = richEditor.container.getBoundingClientRect();
  const viewport = window.visualViewport;
  const minTop = (viewport?.offsetTop || 0) + 8;
  const maxBottom = (viewport?.offsetTop || 0) + (viewport?.height || innerHeight) - 8;
  let top = container.top + bounds.bottom + 8;
  if (top + menu.offsetHeight > maxBottom) top = container.top + bounds.top - menu.offsetHeight - 8;
  menu.style.left = `${Math.max(8, Math.min(container.left + bounds.left, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(minTop, Math.min(top, maxBottom - menu.offsetHeight))}px`;
}
if (richEditor) {
  richEditor.on('text-change', () => queueMicrotask(updateSlashCommand));
  richEditor.on('selection-change', () => queueMicrotask(updateSlashCommand));
  richEditor.root.addEventListener('compositionstart', () => { slashComposing = true; closeMenus(); });
  richEditor.root.addEventListener('compositionend', () => { slashComposing = false; queueMicrotask(updateSlashCommand); });
  richEditor.root.addEventListener('scroll', () => { if (slashCommand) closeMenus(); }, { passive: true });
  richEditor.root.addEventListener('keydown', event => {
    if (!slashCommand || event.isComposing) return;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation();
      const count = $('add-menu').querySelectorAll('[data-insert]').length;
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : slashCommand.selected + (event.key === 'ArrowDown' ? 1 : -1);
      highlightSlashOption(index);
    } else if (event.key === 'Enter') {
      event.preventDefault(); event.stopImmediatePropagation();
      insertNoteItem($('add-menu').querySelectorAll('[data-insert]')[slashCommand.selected].dataset.insert);
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); closeMenus();
    } else if (event.key === 'Tab') closeMenus();
  }, true);
}

setInterval(() => { void refreshCloud(); }, 3000);
window.addEventListener('focus', () => { void refreshCloud(); });

$('open-trash').onclick = () => { renderTrash(); $('trash-dialog').showModal(); };
$('close-trash').onclick = () => $('trash-dialog').close();
window.forgetDeletedAccount = async userId => {
  await loadAccount(null);
  localStorage.removeItem(`notepad:tabs:${userId}`);
  if (localStorage.getItem('notepad:import-owner') === userId) localStorage.removeItem('notepad:import-owner');
  $('trash-dialog').close();
};

function applyMove(id, parent, before) { if (parent) expandedFolders.add(parent); save(); const next = features.moveEntry(workspaceValue(), id, parent, before); tabs = next.tabs; folders = next.folders; renderTabs(); save(); }
function togglePin(id) {
  if (!tabs.some(note => note.id === id) && !folders.some(folder => folder.id === id)) return;
  save();
  tabs = tabs.map(note => note.id === id ? { ...note, pinned: !note.pinned } : note);
  folders = folders.map(folder => folder.id === id ? { ...folder, pinned: !folder.pinned } : folder);
  renderTabs(); save();
}
function chooseMove(id) {
  closeMenus(); const select = $('move-folder'); select.replaceChildren();
  const root = document.createElement('option'); root.value = ''; root.textContent = 'All notes'; select.append(root);
  folders.filter(folder => features.canMove(workspaceValue(), id, folder.id)).forEach(folder => { const option = document.createElement('option'); option.value = folder.id; option.textContent = folder.name; select.append(option); });
  $('move-dialog').showModal(); $('confirm-move').onclick = () => { applyMove(id, select.value || null); $('move-dialog').close(); };
}
$('cancel-move').onclick = () => $('move-dialog').close();
$('new-folder').onclick = () => { const name = prompt('Folder name:'); if (!name?.trim()) return; save(); folders.push({ id: crypto.randomUUID(), name: name.trim().slice(0, 80), parentId: currentFolder, order: Date.now() }); renderTabs(); save(); };
function openFolderMenu(entry, anchor) {
  closeMenus(); tabMenu.replaceChildren();
  [[entry.pinned ? 'Unpin folder' : 'Pin folder', () => togglePin(entry.id)], ['Rename folder', () => { const name = prompt('Folder name:', entry.name); if (name?.trim()) { folders = folders.map(folder => folder.id === entry.id ? { ...folder, name: name.trim().slice(0, 80) } : folder); renderTabs(); save(); } }], ['Delete folder', () => { if (!confirm('Delete this folder? Its notes and subfolders will move to the parent folder.')) return; const next = features.removeFolder(workspaceValue(), entry.id); folders = next.folders; tabs = next.tabs; renderTabs(); save(); }]].forEach(([label, action]) => { const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'menuitem'); button.textContent = label; button.onclick = () => { closeMenus(); action(); }; tabMenu.append(button); });
  tabMenu.hidden = false; const box = anchor.getBoundingClientRect(); tabMenu.style.left = `${box.left}px`; tabMenu.style.top = `${box.bottom}px`;
}
function isLocked() { return Boolean(storedActive()?.sealed && !unlockedNotes.has(activeId)); }
function clearNoteKeys() { noteKeyEpoch++; unlockedNotes.forEach(session => session.key.fill(0)); unlockedNotes.clear(); }
function renderLockState() {
  const locked = isLocked(); $('locked-note').hidden = !locked; $('rich-editor').hidden = locked || !richEditor; $('editor').hidden = locked || Boolean(richEditor);
  setEditorEnabled(!locked); ['rename-current','download-current','share-current'].forEach(id => { $(id).disabled = locked || (id === 'rename-current' && Boolean(storedActive()?.sealed)); });
  const isLegacyProtected = Boolean(storedActive()?.sealed);
  $('legacy-note-tools').hidden = !isLegacyProtected || locked;
  $('password-note').textContent = 'Remove old password';
  $('lock-note').hidden = !isLegacyProtected || locked;
}
function askNotePassword() {
  // Only retained to recover notes created before note protection was disabled.
  return new Promise(resolve => {
    const dialog = $('note-password-dialog'), password = $('note-password');
    password.value = '';
    $('note-password-error').textContent = '';
    $('note-password-title').textContent = 'Unlock existing note';
    $('note-password-help').textContent = 'Enter this note’s original password to access it. You can then remove the old password from the recovery controls.';
    const finish = value => { dialog.oncancel = null; $('note-password-form').onsubmit = null; dialog.close(); password.value = ''; resolve(value); };
    $('note-password-form').onsubmit = event => { event.preventDefault(); finish(password.value); };
    $('note-password-cancel').onclick = () => finish(null);
    dialog.oncancel = event => { event.preventDefault(); finish(null); };
    dialog.showModal(); password.focus();
  });
}
async function passwordAction() {
  const id = activeId, original = storedActive();
  // No new protection or encryption. Existing protected notes remain recoverable.
  if (!original?.sealed) return;
  if (unlockedNotes.has(id)) {
    if (!confirm('Remove password protection? This note will be saved without encryption.')) return;
    const session = unlockedNotes.get(id);
    const plain = { ...original, text: session.note.text, content: session.note.content, filename: session.note.filename, customName: session.note.customName };
    delete plain.sealed;
    tabs = tabs.map(note => note.id === id ? plain : note);
    session.key.fill(0);
    unlockedNotes.delete(id);
    showTab();
    save();
    return;
  }
  save();
  const password = await askNotePassword();
  if (password === null) return;
  const keyEpoch = noteKeyEpoch;
  $('unlock-note').disabled = true;
  $('save-status').textContent = 'Unlocking note…';
  try {
    const result = await features.unlockNote(original, password);
    if (keyEpoch !== noteKeyEpoch || document.hidden || activeId !== id || storedActive() !== original) {
      result.key.fill(0);
      throw new Error('Note changed. Please try again.');
    }
    unlockedNotes.set(id, { key: result.key, note: result.note, lastPlainPayload: protectedPlainPayload(result.note) });
    showTab();
    save();
  } catch (error) {
    alert(error.message || 'Could not unlock note.');
    renderLockState();
  } finally {
    $('unlock-note').disabled = false;
  }
}
$('password-note').onclick = () => { void passwordAction(); };
$('unlock-note').onclick = () => { void passwordAction(); };
$('lock-note').onclick = () => { save(); unlockedNotes.get(activeId)?.key.fill(0); unlockedNotes.delete(activeId); showTab(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearNoteKeys(); showTab(); } });

function moveRelative(id, direction) {
  const parent = folders.find(item => item.id === id)?.parentId || tabs.find(item => item.id === id)?.folderId || null;
  const all = features.entries(workspaceValue(), parent), entry = all.find(item => item.id === id); if (!entry) return;
  const group = all.filter(item => item.pinned === entry.pinned), index = group.findIndex(item => item.id === id);
  if (direction < 0 && index > 0) applyMove(id, parent, group[index - 1].id);
  if (direction > 0 && index < group.length - 1) applyMove(id, parent, group[index + 2]?.id);
}
function toggleFolder(id) { if (expandedFolders.has(id)) expandedFolders.delete(id); else expandedFolders.add(id); renderTabs(); }
function folderIcon(open) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${open ? '<path d="M3 10V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v1"/><path d="M3 10h19l-3 10H4L2 12a1.6 1.6 0 0 1 1-2Z"/>' : '<path d="M3 7V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>'}</svg>`;
}
function bindItemDrag(element, entry) {
  function pending(clientX, clientY, touch) {
    if (libraryDrag) return;
    libraryDrag = { entry, element, startX: clientX, startY: clientY, touch, active: false };
    if (touch) libraryDrag.timer = setTimeout(beginLibraryDrag, 250);
  }
  element.onpointerdown = event => { if (event.pointerType === 'touch' || event.button !== 0 || event.target.closest('.edit-tab,.folder-toggle')) return; pending(event.clientX, event.clientY, false); };
  element.addEventListener('touchstart', event => { if (event.target.closest('.edit-tab,.folder-toggle')) return; const touch = event.touches[0]; pending(touch.clientX, touch.clientY, true); }, { passive: true });
  element.oncontextmenu = event => { if (libraryDrag?.active) event.preventDefault(); };
  element.onkeydown = event => { if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); moveRelative(entry.id, event.key === 'ArrowUp' ? -1 : 1); } };
}
function beginLibraryDrag() {
  const drag = libraryDrag; if (!drag || !drag.element.isConnected) return;
  clearTimeout(drag.timer); drag.active = true; drag.list = $('tabs'); drag.hidden = []; drag.lastPassedItem = null; drag.lastPassFeedbackAt = Date.now();
  // Move an expanded folder as one compact item; restore its contents on release.
  let sibling = drag.element.nextElementSibling;
  while (drag.entry.kind === 'folder' && sibling?.dataset.entry) {
    const entry = features.treeEntries(workspaceValue(), expandedFolders).find(item => item.id === sibling.dataset.entry);
    if (!entry || entry.depth <= drag.entry.depth) break;
    drag.hidden.push([sibling, sibling.style.display]); sibling.style.display = 'none'; sibling = sibling.nextElementSibling;
  }
  const box = drag.element.getBoundingClientRect(), listBox = drag.list.getBoundingClientRect();
  drag.height = box.height; drag.startScroll = drag.list.scrollTop; drag.style = drag.element.getAttribute('style');
  drag.source = { id: drag.entry.id, top: box.top, height: box.height };
  drag.slots = [...drag.list.querySelectorAll('[data-entry]')].filter(row => row.offsetHeight).map(row => { const box = row.getBoundingClientRect(); return { id: row.dataset.entry, top: box.top, height: box.height, element: row }; });
  drag.gap = parseFloat(getComputedStyle(drag.list).rowGap) || 5;
  drag.placeholder = document.createElement('div'); drag.placeholder.className = 'library-placeholder'; drag.placeholder.style.height = `${box.height}px`;
  drag.element.before(drag.placeholder);
  Object.assign(drag.element.style, { position: 'absolute', left: `${box.left - listBox.left}px`, top: `${box.top - listBox.top + drag.startScroll}px`, marginLeft: '0', width: `${box.width}px`, pointerEvents: 'none' });
  drag.element.classList.add('is-lifted'); document.body.classList.add('library-dragging');
  // A light buzz on browsers that support it; native iOS uses Expo Haptics.
  if (typeof navigator.vibrate === 'function') navigator.vibrate(10);
}
function moveLibraryDrag(clientY) {
  const drag = libraryDrag; if (!drag?.active) return;
  const listBox = drag.list.getBoundingClientRect(), scrollDelta = drag.list.scrollTop - drag.startScroll;
  const source = { ...drag.source, top: drag.source.top - scrollDelta }, slots = drag.slots.map(slot => ({ ...slot, top: slot.top - scrollDelta }));
  const projection = features.projectVerticalDrag(source, clientY - drag.startY + scrollDelta, { top: listBox.top + 2, bottom: listBox.bottom - 2 }, slots, drag.gap);
  drag.element.style.transform = `translate3d(0,${projection.delta}px,0)`;
  const center = projection.top + source.height / 2;
  const overFolder = slots.find(slot => { const entry = folders.find(item => item.id === slot.id); return clientY > listBox.top + 12 && clientY < listBox.bottom - 12 && entry && slot.id !== drag.entry.id && center > slot.top + slot.height * .25 && center < slot.top + slot.height * .75 && features.canMove(workspaceValue(), drag.entry.id, slot.id); });
  drag.slots.forEach(slot => { if (slot.id === drag.entry.id) return; slot.element.classList.toggle('drop-target', slot.id === overFolder?.id); slot.element.style.transform = `translateY(${overFolder ? 0 : projection.shifts[slot.id] || 0}px)`; });
  if (overFolder) { drag.destination = { parent: overFolder.id }; drag.settle = Math.max(listBox.top + 2, Math.min(overFolder.top, listBox.bottom - 2 - source.height)) - source.top; }
  else {
    const entry = features.treeEntries(workspaceValue(), expandedFolders).find(item => item.id === projection.over);
    if (entry) { const siblings = features.entries(workspaceValue(), entry.parentId), index = siblings.findIndex(item => item.id === entry.id); drag.destination = { parent: entry.parentId, before: projection.direction > 0 ? siblings[index + 1]?.id : entry.id }; }
    else drag.destination = null;
    drag.settle = Math.max(listBox.top + 2, Math.min(projection.settleTop, listBox.bottom - 2 - source.height)) - source.top;
  }
  // Vibrate lightly only when crossing into a new row/folder on supported browsers.
  const crossedItem = overFolder ? `folder:${overFolder.id}` : projection.over ? `row:${projection.over}` : null;
  if (crossedItem !== drag.lastPassedItem) {
    drag.lastPassedItem = crossedItem;
    const now = Date.now();
    if (crossedItem && now - drag.lastPassFeedbackAt >= 75 && typeof navigator.vibrate === 'function') {
      drag.lastPassFeedbackAt = now;
      navigator.vibrate(6);
    }
  }
  if (clientY < listBox.top + 24) drag.list.scrollTop -= 8;
  if (clientY > listBox.bottom - 24) drag.list.scrollTop += 8;
}
function finishLibraryDrag(commit) {
  const drag = libraryDrag; if (!drag) return; clearTimeout(drag.timer);
  if (!drag.active) { libraryDrag = null; return; }
  if (drag.finishing) { if (!commit) cleanup(false); return; }
  drag.finishing = true; libraryDragEndedAt = Date.now();
  function cleanup(save) {
    libraryDrag = null;
    drag.placeholder?.remove(); drag.element.classList.remove('is-lifted');
    if (drag.style === null) drag.element.removeAttribute('style'); else drag.element.setAttribute('style', drag.style);
    drag.slots.forEach(slot => { if (slot.id !== drag.entry.id) { slot.element.style.transform = ''; slot.element.classList.remove('drop-target'); } });
    drag.hidden.forEach(([row, display]) => { row.style.display = display; }); document.body.classList.remove('library-dragging');
    if (save && drag.destination) applyMove(drag.entry.id, drag.destination.parent, drag.destination.before);
  }
  if (commit && drag.destination && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    drag.element.style.transition = 'transform 120ms ease-out'; drag.element.style.transform = `translate3d(0,${drag.settle || 0}px,0)`; setTimeout(() => { if (libraryDrag === drag) cleanup(true); }, 125);
  } else cleanup(commit);
}
document.addEventListener('pointermove', event => { const drag = libraryDrag; if (!drag || drag.touch || drag.finishing) return; if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5) beginLibraryDrag(); if (drag.active) { event.preventDefault(); moveLibraryDrag(event.clientY); } }, { passive: false });
document.addEventListener('pointerup', event => { if (!libraryDrag || libraryDrag.touch) return; if (libraryDrag.active) event.preventDefault(); finishLibraryDrag(true); });
document.addEventListener('pointercancel', () => { if (!libraryDrag?.touch) finishLibraryDrag(false); });
document.addEventListener('touchmove', event => { const drag = libraryDrag; if (!drag?.touch || drag.finishing) return; const touch = event.touches[0]; if (drag.active) { event.preventDefault(); moveLibraryDrag(touch.clientY); } else if (Math.hypot(touch.clientX - drag.startX, touch.clientY - drag.startY) > 8) finishLibraryDrag(false); }, { passive: false });
document.addEventListener('touchend', event => { if (libraryDrag?.touch) { if (libraryDrag.active) event.preventDefault(); finishLibraryDrag(true); } }, { passive: false });
document.addEventListener('touchcancel', () => finishLibraryDrag(false));
document.addEventListener('click', event => { if ((libraryDrag?.active || Date.now() - libraryDragEndedAt < 50) && event.target.closest('#tabs')) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
document.addEventListener('keydown', event => { if (event.key === 'Escape' && libraryDrag) { event.preventDefault(); finishLibraryDrag(false); } });
window.addEventListener('blur', () => finishLibraryDrag(false));
