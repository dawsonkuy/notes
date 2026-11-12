const $ = (id) => document.getElementById(id);
let tabs = [];
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
const notesPayload = () => JSON.stringify(tabs);
let cloudChannel = null;
let cloudRefreshing = false;
const payload = () => JSON.stringify({ tabs, activeId });
function cacheNotes() {
  localStorage.setItem(storageKey, JSON.stringify({ tabs, activeId, revision: cloudRevision, dirty: cloudDirty }));
}
function queueCloudSave() {
  clearTimeout(cloudTimer);
  if (cloudUser && cloudReady && !cloudConflict) cloudTimer = setTimeout(flushCloud, 250);
}

const isTrashed = note => typeof note.deletedAt === 'string' && note.deletedAt.length > 0;
const liveTabs = () => tabs.filter(note => !isTrashed(note));
const active = () => tabs.find(tab => tab.id === activeId);
const makeTab = (text = '', filename = 'Untitled') => ({ id: crypto.randomUUID(), text, filename, customName: filename !== 'Untitled' ? filename : null });
const noteName = tab => tab.customName || tab.text.split(/\r?\n/, 1)[0].trim().slice(0, 80) || 'Untitled';
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
  $('open-add').setAttribute('aria-expanded', 'false');
};
function renameTab(tab) {
  closeMenus();
  const name = prompt('Rename note (leave blank to use its first line):', noteName(tab));
  if (name === null) return;
  tab.customName = name.trim().slice(0, 80) || null;
  save();
}
function deleteTab(tab) {
  closeMenus(); save();
  tab.deletedAt = new Date().toISOString();
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
    restore.onclick = () => { save(); delete note.deletedAt; renderTabs(); save(); };
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'danger-button'; remove.textContent = 'Delete permanently'; remove.setAttribute('aria-label', `Permanently delete ${noteName(note)}`);
    remove.onclick = () => { if (!confirm(`Permanently delete ${noteName(note)}? This cannot be undone.`)) return; save(); tabs = tabs.filter(tab => tab.id !== note.id); renderTabs(); save(); };
    row.append(title, restore, remove); list.append(row);
  });
}
function downloadTab(tab) {
  closeMenus(); save();
  const url = URL.createObjectURL(new Blob([tab.text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  const name = noteName(tab).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '') || 'Untitled';
  link.href = url; link.download = /\.txt$/i.test(name) ? name : `${name}.txt`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function shareTab(tab) {
  closeMenus(); save();
  const data = { title: noteName(tab), text: tab.text };
  try {
    if (navigator.share) {
      await navigator.share(data);
      $('save-status').textContent = 'Note shared';
    } else {
      await navigator.clipboard.writeText(tab.text);
      $('save-status').textContent = 'Note copied — paste it to share';
    }
  } catch (error) {
    if (error.name !== 'AbortError') $('save-status').textContent = 'Unable to share — use Save as to download the note';
  }
}
function openTabMenu(tab, anchor) {
  closeMenus(); tabMenu.replaceChildren();
  [['✎', 'Rename', () => renameTab(tab)], ['↓', 'Save as…', () => downloadTab(tab)], ['↗', 'Share', () => shareTab(tab)], ['⌫', 'Move to Trash', () => deleteTab(tab)]].forEach(([icon, label, action]) => {
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
  try {
    if (richEditor && !renderingNote) {
      $('editor').value = richEditor.getText().slice(0, -1);
      active().content = richEditor.getContents().ops;
    }
    active().text = $('editor').value;
    refreshNames();
    const currentPayload = payload();
    if (currentPayload !== savedPayload) {
      // Opening another note is local navigation, not an edit to shared notes.
      if (cloudUser && notesPayload() !== savedNotesPayload) cloudDirty = true;
      savedPayload = currentPayload;
      savedNotesPayload = notesPayload();
    }
    cacheNotes();
    $('save-status').textContent = cloudUser ? (cloudConflict ? 'Cloud conflict — local copy kept; download before reloading' : cloudDirty ? 'Saved locally · waiting to sync…' : 'Saved to cloud') : 'Saved locally';
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
  if ($('note-title').textContent !== name) setTitle();
  const button = document.getElementById(`tab-${tab.id}`);
  if (!button) return;
  const title = button.querySelector('.note-list-title'), preview = button.querySelector('.note-list-preview'), text = notePreview(tab);
  if (title && title.textContent !== name) title.textContent = name;
  if (preview && preview.textContent !== text) preview.textContent = text;
  const options = button.parentElement.querySelector('.edit-tab');
  if (options?.getAttribute('aria-label') !== `Options for ${name}`) options?.setAttribute('aria-label', `Options for ${name}`);
}
$('editor').addEventListener('input', save);
['click', 'keyup', 'select'].forEach(type => $('editor').addEventListener(type, position));
function renderTabs() {
  $('tabs').replaceChildren();
  renderTrash();
  $('note-total').textContent = liveTabs().length;
  const query = $('note-search').value.trim().toLocaleLowerCase();
  const visibleTabs = liveTabs().filter(tab => !query || `${noteName(tab)} ${tab.text}`.toLocaleLowerCase().includes(query));
  $('search-empty').hidden = visibleTabs.length > 0;
  visibleTabs.forEach(tab => {
    const item = document.createElement('div'); item.className = 'tab';
    const button = document.createElement('button');
    button.id = `tab-${tab.id}`; button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(tab.id === activeId));
    button.setAttribute('aria-controls', richEditor ? 'rich-editor' : 'editor');
    button.tabIndex = tab.id === activeId ? 0 : -1;
    const title = document.createElement('span'); title.className = 'note-list-title'; title.textContent = noteName(tab);
    const preview = document.createElement('span'); preview.className = 'note-list-preview'; preview.textContent = notePreview(tab);
    button.append(title, preview);
    button.title = `${noteName(tab)} — drag to reorder; right-click to rename`;
    button.oncontextmenu = event => { event.preventDefault(); renameTab(tab); };
    button.draggable = !window.matchMedia('(pointer: coarse)').matches;
    button.ondragstart = event => {
      draggedId = tab.id; closeMenus();
      event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', tab.id);
      item.classList.add('dragging');
    };
    button.ondragend = () => {
      draggedId = null;
      document.querySelectorAll('.tab').forEach(el => el.classList.remove('dragging', 'drop-before', 'drop-after'));
    };
    item.ondragover = event => {
      if (!draggedId || draggedId === tab.id) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move';
      const after = event.clientY > item.getBoundingClientRect().top + item.offsetHeight / 2;
      item.classList.toggle('drop-after', after); item.classList.toggle('drop-before', !after);
      const strip = $('tabs').getBoundingClientRect();
      if (event.clientY < strip.top + 35) $('tabs').scrollTop -= 20;
      if (event.clientY > strip.bottom - 35) $('tabs').scrollTop += 20;
    };
    item.ondragleave = () => item.classList.remove('drop-before', 'drop-after');
    item.ondrop = event => {
      if (!draggedId) return;
      event.preventDefault();
      reorderTab(draggedId, tab.id, event.clientY > item.getBoundingClientRect().top + item.offsetHeight / 2);
      draggedId = null;
    };
    button.onclick = () => switchTab(tab.id);
    button.onkeydown = event => {
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = visibleTabs.findIndex(t => t.id === tab.id);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? visibleTabs.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + visibleTabs.length) % visibleTabs.length;
      switchTab(visibleTabs[next].id, true); document.getElementById(`tab-${activeId}`).focus();
    };
    const edit = document.createElement('button'); edit.className = 'edit-tab';
    edit.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';
    edit.setAttribute('aria-label', `Options for ${noteName(tab)}`);
    edit.setAttribute('aria-haspopup', 'menu'); edit.title = 'Note options';
    edit.onclick = () => openTabMenu(tab, edit);
    item.append(button, edit); $('tabs').append(item);
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
  if (!window.matchMedia('(pointer: coarse)').matches || document.activeElement === $('editor') || (richEditor && richEditor.root.contains(document.activeElement))) {
    if (richEditor) richEditor.focus({ preventScroll: true });
    else $('editor').focus({ preventScroll: true });
  }
  restoreEditorPosition(); renderedNoteId = activeId; position();
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
  $('note-search').value = '';
  save(); const tab = makeTab(text, filename); tabs.push(tab); activeId = tab.id;
  showTab(); save(); closeMenus(); setNotesDrawer(false);
}
$('add-tab').onclick = () => addTab();
document.addEventListener('click', event => { if (!event.target.closest('.edit-tab, .tab-menu, #open-add, .add-menu')) closeMenus(); });
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
    tabs = stored.tabs;
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
  tabs = value.tabs;
  if (!liveTabs().length) tabs.push(makeTab());
  activeId = liveTabs().some(tab => tab.id === value.activeId) ? value.activeId : liveTabs()[0].id;
  savedPayload = payload();
  savedNotesPayload = notesPayload();
  if (preserveEditor) { setTitle(); renderTabs(); position(); } else showTab();
}
async function flushCloud() {
  if (!cloudUser || !cloudReady || cloudConflict || !cloudDirty || cloudWriting) return;
  cloudWriting = true;
  const userId = cloudUser, generation = accountGeneration, contents = payload(), revision = cloudRevision;
  $('save-status').textContent = 'Saving to cloud…';
  try {
    const snapshot = JSON.parse(contents);
    const row = { user_id: userId, tabs: snapshot.tabs, active_id: snapshot.activeId, revision: (revision || 0) + 1, updated_at: new Date().toISOString() };
    const query = revision === null
      ? window.notesClient.from('note_workspaces').insert(row)
      : window.notesClient.from('note_workspaces').update(row).eq('user_id', userId).eq('revision', revision);
    const { data, error } = await query.select('revision');
    if (generation !== accountGeneration) return;
    if (error?.code === '23505' || (!error && !data?.length)) {
      cloudConflict = true;
      throw new Error('conflict');
    }
    if (error) throw error;
    cloudRevision = data[0].revision;
    cloudDirty = notesPayload() !== JSON.stringify(snapshot.tabs);
    cacheNotes();
    $('save-status').textContent = cloudDirty ? 'Saved locally · waiting to sync…' : 'Saved to cloud';
  } catch {
    if (generation === accountGeneration) $('save-status').textContent = cloudConflict ? 'Cloud conflict — local copy kept; download before reloading' : 'Saved locally · sync failed, will retry';
  } finally {
    cloudWriting = false;
    if (cloudDirty && !cloudConflict && cloudReady) cloudTimer = setTimeout(flushCloud, 5000);
    if (cloudConflict && generation === accountGeneration) void clearIdenticalCloudConflict();
  }
}

function downloadWorkspaceBackup(kind, workspace, revision) {
  const backup = { app: 'Bestpad', source: kind, savedAt: new Date().toISOString(), revision, tabs: workspace.tabs, activeId: workspace.activeId };
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
  const { data, error } = await window.notesClient.from('note_workspaces').select('*').eq('user_id', user).maybeSingle();
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
    if (remote && JSON.stringify(remote.tabs) === localNotes) {
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
      if (remote) downloadWorkspaceBackup('cloud', { tabs: remote.tabs, activeId: remote.active_id }, remote.revision);
      $('sync-message').textContent = remote ? 'Both backups requested. Check your Downloads folder before proceeding.' : 'Local backup requested. No cloud workspace was found.';
      return;
    }
    if (choice === 'cloud') {
      if (!remote) throw new Error('No cloud copy found. Your local notes were not changed.');
      downloadWorkspaceBackup('local', local, localRevision);
      cloudRevision = remote.revision;
      cloudDirty = false;
      cloudConflict = false;
      useWorkspace({ tabs: remote.tabs, activeId: remote.active_id });
      cacheNotes();
      $('save-status').textContent = 'Saved to cloud';
      $('sync-dialog').close();
      return;
    }
    if (choice === 'local') {
      if (remote) downloadWorkspaceBackup('cloud', { tabs: remote.tabs, activeId: remote.active_id }, remote.revision);
      const revision = remote?.revision ?? null;
      const row = { user_id: user, tabs: local.tabs, active_id: local.activeId, revision: (revision ?? 0) + 1, updated_at: new Date().toISOString() };
      const query = revision === null
        ? window.notesClient.from('note_workspaces').insert(row)
        : window.notesClient.from('note_workspaces').update(row).eq('user_id', user).eq('revision', revision);
      const { data, error } = await query.select('revision');
      if (generation !== accountGeneration) return;
      if (error?.code === '23505' || (!error && !data?.length)) throw new Error('Cloud changed again. Please download fresh backups and retry.');
      if (error) throw error;
      cloudRevision = data[0].revision;
      cloudConflict = false;
      cloudDirty = notesPayload() !== JSON.stringify(local.tabs);
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
  if (!cloudUser || !cloudReady || cloudDirty || cloudWriting || cloudConflict || cloudRefreshing || slashComposing || document.hidden) return;
  const user = cloudUser, generation = accountGeneration, contents = payload();
  cloudRefreshing = true;
  try {
    const { data, error } = await window.notesClient.from('note_workspaces').select('*').eq('user_id', user).maybeSingle();
    if (error || !data || generation !== accountGeneration || cloudDirty || cloudWriting || slashComposing || contents !== payload() || data.revision === cloudRevision || !validWorkspace({ tabs: data.tabs })) return;
    const selection = richEditor?.getSelection(), scroll = richEditor?.root.scrollTop, focused = document.activeElement;
    const selected = activeId;
    cloudRevision = data.revision;
    const incoming = data.tabs.find(note => note.id === selected && !isTrashed(note));
    const sameBody = incoming && incoming.text === active().text && JSON.stringify(incoming.content) === JSON.stringify(active().content);
    useWorkspace({ tabs: data.tabs, activeId: data.tabs.some(note => note.id === selected) ? selected : data.active_id }, Boolean(sameBody));
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
  editorPositions.clear(); renderedNoteId = null;
  const generation = ++accountGeneration;
  if (cloudChannel) { void window.notesClient.removeChannel(cloudChannel); cloudChannel = null; }
  cloudUser = userId;
  if (userId) cloudChannel = window.notesClient.channel(`web-notes:${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'note_workspaces', filter: `user_id=eq.${userId}` }, refreshCloud).subscribe(status => { if (status === 'SUBSCRIBED') void refreshCloud(); });
  cloudReady = false; cloudConflict = false; cloudRevision = null; cloudDirty = false;
  storageKey = userId ? `notepad:tabs:${userId}` : 'notepad:tabs';
  let cached;
  try { cached = JSON.parse(localStorage.getItem(storageKey)); } catch { /* Keep recovery available through local storage. */ }
  const empty = () => { const tab = makeTab(); return { tabs: [tab], activeId: tab.id }; };
  $('note-search').value = '';
  useWorkspace(validWorkspace(cached) ? cached : empty());
  if (!userId) { $('save-status').textContent = 'Saved locally'; return; }
  setEditorEnabled(false);
  $('editor').disabled = true; $('add-tab').disabled = true; $('tabs').inert = true;
  $('save-status').textContent = 'Loading saved notes…';
  try {
    const { data, error } = await window.notesClient.from('note_workspaces').select('*').eq('user_id', userId).maybeSingle();
    if (generation !== accountGeneration) return;
    if (error) throw error;
    cloudRevision = data?.revision ?? null;
    if (cached?.dirty && validWorkspace(cached)) {
      cloudDirty = true;
      cloudConflict = (cached.revision ?? null) !== cloudRevision;
      if (cloudConflict) cloudRevision = cached.revision ?? null;
    } else if (data) {
      if (!validWorkspace({ tabs: data.tabs })) throw new Error('Invalid saved notes');
      useWorkspace({ tabs: data.tabs, activeId: data.active_id });
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
    cloudDirty = Boolean(cached?.dirty);
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
window.addEventListener('online', () => {
  if (cloudUser && !cloudReady) {
    const userId = cloudUser; cloudUser = null; loadAccount(userId);
  } else flushCloud();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) flushCloud(); else void refreshCloud(); });
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
  // Restore only text, supported line styles, and our own divider embed.
  const ops = tab.content.map(op => {
    if (!op) return null;
    if (typeof op.insert !== 'string') {
      return op.insert && op.insert.divider === true && Object.keys(op.insert).length === 1 ? { insert: { divider: true } } : null;
    }
    const result = { insert: op.insert };
    if ([1, 2, 3].includes(op.attributes?.header)) result.attributes = { header: op.attributes.header };
    else if (['checked', 'unchecked', 'bullet', 'ordered'].includes(op.attributes?.list)) result.attributes = { list: op.attributes.list };
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
  document.querySelectorAll('[data-heading], [data-insert], #open-add').forEach(button => { button.disabled = !enabled; });
  if (!enabled) closeMenus();
}
function updateHeadingButtons() {
  const range = richEditor?.getSelection();
  const level = range ? richEditor.getFormat(range).header || 0 : 0;
  document.querySelectorAll('[data-heading]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.heading) === level)));
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
  richEditor = new window.Quill('#rich-editor', { formats: ['header', 'list', 'divider'], modules: { toolbar: false }, placeholder: 'Start writing… Type /insert to add a heading, list, date, or time.' });
  richEditor.root.setAttribute('role', 'textbox');
  richEditor.root.setAttribute('aria-label', 'Note text');
  richEditor.root.setAttribute('aria-multiline', 'true');
  richEditor.root.setAttribute('aria-describedby', 'save-status');
  richEditor.root.setAttribute('spellcheck', 'true');
  $('rich-editor').hidden = false;
  $('heading-toolbar').hidden = false;
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
      richEditor.formatLine(range.index, range.length, 'header', Number(button.dataset.heading) || false, 'user');
      updateHeadingButtons();
    });
  });
}

$('open-add').addEventListener('pointerdown', event => event.preventDefault());
$('open-add').addEventListener('click', event => {
  const opening = $('add-menu').hidden;
  closeMenus();
  if (!opening) return;
  $('add-menu').hidden = false;
  $('open-add').setAttribute('aria-expanded', 'true');
  const anchor = $('open-add').getBoundingClientRect();
  const menu = $('add-menu');
  menu.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(anchor.bottom + 4, innerHeight - menu.offsetHeight - 8))}px`;
  if (event.detail === 0) menu.firstElementChild.focus({ preventScroll: true });
});
function insertNoteItem(kind) {
  const command = slashCommand;
  closeMenus();
  if (!richEditor || !richEditor.isEnabled()) return;
  const range = command && command.noteId === activeId && richEditor.getText(command.index, 7) === '/insert'
    ? { index: command.index, length: 7 }
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
    event.preventDefault(); closeMenus(); $('open-add').focus({ preventScroll: true }); return;
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
$('note-search').addEventListener('input', renderTabs);
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
  const match = /(?:^|\s)(\/insert)$/.exec(before);
  if (!match) {
    if (slashCommand) closeMenus();
    dismissedSlash = null;
    return;
  }
  const index = range.index - 7;
  const key = `${activeId}:${index}`;
  if (key === dismissedSlash) return;
  if (!slashCommand || slashCommand.index !== index || slashCommand.noteId !== activeId) {
    closeMenus();
    dismissedSlash = null;
    slashCommand = { index, noteId: activeId, selected: 0 };
  }
  const menu = $('add-menu');
  menu.hidden = false;
  $('open-add').setAttribute('aria-expanded', 'true');
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
