const $ = (id) => document.getElementById(id);
let tabs = [];
let activeId;
let richEditor = null;
let renderingNote = false;
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
const payload = () => JSON.stringify({ tabs, activeId });
function cacheNotes() {
  localStorage.setItem(storageKey, JSON.stringify({ tabs, activeId, revision: cloudRevision, dirty: cloudDirty }));
}
function queueCloudSave() {
  clearTimeout(cloudTimer);
  if (cloudUser && cloudReady && !cloudConflict) cloudTimer = setTimeout(flushCloud, 250);
}

const active = () => tabs.find(tab => tab.id === activeId);
const makeTab = (text = '', filename = 'Untitled') => ({ id: crypto.randomUUID(), text, filename, customName: filename !== 'Untitled' ? filename : null });
const noteName = tab => tab.customName || tab.text.split(/\r?\n/, 1)[0].trim().slice(0, 80) || 'Untitled';
const tabMenu = document.createElement('div');
tabMenu.className = 'tab-menu'; tabMenu.hidden = true;
tabMenu.setAttribute('role', 'menu'); document.body.append(tabMenu);
let draggedId = null;
const closeMenus = () => {
  tabMenu.hidden = true;
};
function renameTab(tab) {
  closeMenus();
  const name = prompt('Rename note (leave blank to use its first line):', noteName(tab));
  if (name === null) return;
  tab.customName = name.trim().slice(0, 80) || null;
  save();
}
function deleteTab(tab) {
  closeMenus();
  if (tab.text && !confirm(`Delete ${noteName(tab)}? Download a copy first to keep it.`)) return;
  save();
  const index = tabs.indexOf(tab); tabs.splice(index, 1);
  if (!tabs.length) tabs.push(makeTab());
  if (activeId === tab.id) activeId = tabs[Math.min(index, tabs.length - 1)].id;
  showTab(); save();
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
  [['✎', 'Rename', () => renameTab(tab)], ['↓', 'Save as…', () => downloadTab(tab)], ['↗', 'Share', () => shareTab(tab)], ['⌫', 'Delete', () => deleteTab(tab)]].forEach(([icon, label, action]) => {
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
    if (currentPayload !== savedPayload) { cloudDirty = Boolean(cloudUser); savedPayload = currentPayload; }
    cacheNotes();
    $('save-status').textContent = cloudUser ? (cloudConflict ? 'Cloud conflict — local copy kept; download before reloading' : cloudDirty ? 'Saved locally · waiting to sync…' : 'Saved to cloud') : 'Saved locally';
    queueCloudSave();
  } catch { $('save-status').textContent = 'Unable to save — download a copy'; }
  position();
}
function setTitle() {
  document.title = `${noteName(active())} - Notepad`;
}
function refreshNames() {
  setTitle();
  tabs.forEach(tab => {
    const button = document.getElementById(`tab-${tab.id}`);
    if (!button) return;
    button.textContent = noteName(tab);
    button.parentElement.querySelector('.edit-tab').setAttribute('aria-label', `Options for ${noteName(tab)}`);
  });
}
$('editor').addEventListener('input', save);
['click', 'keyup', 'select'].forEach(type => $('editor').addEventListener(type, position));
function renderTabs() {
  $('tabs').replaceChildren();
  tabs.forEach(tab => {
    const item = document.createElement('div'); item.className = 'tab';
    const button = document.createElement('button');
    button.id = `tab-${tab.id}`; button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(tab.id === activeId));
    button.setAttribute('aria-controls', richEditor ? 'rich-editor' : 'editor');
    button.tabIndex = tab.id === activeId ? 0 : -1;
    button.textContent = noteName(tab);
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
      const after = event.clientX > item.getBoundingClientRect().left + item.offsetWidth / 2;
      item.classList.toggle('drop-after', after); item.classList.toggle('drop-before', !after);
      const strip = $('tabs').getBoundingClientRect();
      if (event.clientX < strip.left + 35) $('tabs').scrollLeft -= 20;
      if (event.clientX > strip.right - 35) $('tabs').scrollLeft += 20;
    };
    item.ondragleave = () => item.classList.remove('drop-before', 'drop-after');
    item.ondrop = event => {
      if (!draggedId) return;
      event.preventDefault();
      reorderTab(draggedId, tab.id, event.clientX > item.getBoundingClientRect().left + item.offsetWidth / 2);
      draggedId = null;
    };
    button.onclick = () => switchTab(tab.id);
    button.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = tabs.findIndex(t => t.id === tab.id);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      switchTab(tabs[next].id); document.getElementById(`tab-${activeId}`).focus();
    };
    const edit = document.createElement('button'); edit.className = 'edit-tab';
    edit.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z"/></svg>';
    edit.setAttribute('aria-label', `Options for ${noteName(tab)}`);
    edit.setAttribute('aria-haspopup', 'menu'); edit.title = 'Note options';
    edit.onclick = () => openTabMenu(tab, edit);
    item.append(button, edit); $('tabs').append(item);
  });
}
function showTab() {
  $('editor').value = active().text;
  if (richEditor) renderRichNote();
  setTitle(); renderTabs(); position();
  if (!window.matchMedia('(pointer: coarse)').matches || document.activeElement === $('editor') || (richEditor && richEditor.root.contains(document.activeElement))) {
    if (richEditor) richEditor.focus({ preventScroll: true });
    else $('editor').focus({ preventScroll: true });
  }
  const selected = document.getElementById(`tab-${activeId}`)?.parentElement;
  if (selected) {
    const strip = $('tabs');
    if (selected.offsetLeft < strip.scrollLeft) strip.scrollLeft = selected.offsetLeft;
    else if (selected.offsetLeft + selected.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = selected.offsetLeft + selected.offsetWidth - strip.clientWidth;
  }
}
function switchTab(id) { save(); activeId = id; showTab(); save(); }
function addTab(text = '', filename = 'Untitled') {
  save(); const tab = makeTab(text, filename); tabs.push(tab); activeId = tab.id;
  showTab(); save(); closeMenus();
}
$('add-tab').onclick = () => addTab();
document.addEventListener('click', event => { if (!event.target.closest('.edit-tab, .tab-menu')) closeMenus(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeMenus();
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
showTab();

function validWorkspace(value) {
  return value && Array.isArray(value.tabs) && value.tabs.length > 0 && value.tabs.every(tab => typeof tab.id === 'string' && typeof tab.text === 'string' && typeof tab.filename === 'string');
}
function useWorkspace(value) {
  tabs = value.tabs;
  activeId = tabs.some(tab => tab.id === value.activeId) ? value.activeId : tabs[0].id;
  savedPayload = payload();
  showTab();
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
    cloudDirty = payload() !== contents;
    cacheNotes();
    $('save-status').textContent = cloudDirty ? 'Saved locally · waiting to sync…' : 'Saved to cloud';
  } catch {
    if (generation === accountGeneration) $('save-status').textContent = cloudConflict ? 'Cloud conflict — local copy kept; download before reloading' : 'Saved locally · sync failed, will retry';
  } finally {
    cloudWriting = false;
    if (cloudDirty && !cloudConflict && cloudReady) cloudTimer = setTimeout(flushCloud, 5000);
  }
}
async function loadAccount(userId) {
  if (userId === cloudUser) return;
  save();
  clearTimeout(cloudTimer);
  const generation = ++accountGeneration;
  cloudUser = userId;
  cloudReady = false; cloudConflict = false; cloudRevision = null; cloudDirty = false;
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
document.addEventListener('visibilitychange', () => { if (document.hidden) flushCloud(); });
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
  // Accept text and heading levels only; never restore HTML or embedded content.
  const ops = tab.content.map(op => {
    if (!op || typeof op.insert !== 'string') return null;
    const result = { insert: op.insert };
    if ([1, 2, 3].includes(op.attributes?.header)) result.attributes = { header: op.attributes.header };
    return result;
  });
  if (ops.some(op => !op) || ops.map(op => op.insert).join('') !== tab.text + '\n') return null;
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
  } finally { renderingNote = false; }
}
function setEditorEnabled(enabled) {
  if (richEditor) richEditor.enable(enabled);
  document.querySelectorAll('[data-heading]').forEach(button => { button.disabled = !enabled; });
}
function updateHeadingButtons() {
  const range = richEditor?.getSelection();
  const level = range ? richEditor.getFormat(range).header || 0 : 0;
  document.querySelectorAll('[data-heading]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.heading) === level)));
}
if (window.Quill) {
  richEditor = new window.Quill('#rich-editor', { formats: ['header'], modules: { toolbar: false }, placeholder: '' });
  richEditor.root.setAttribute('role', 'textbox');
  richEditor.root.setAttribute('aria-label', 'Note text');
  richEditor.root.setAttribute('aria-multiline', 'true');
  richEditor.root.setAttribute('aria-describedby', 'save-status');
  richEditor.root.setAttribute('spellcheck', 'false');
  $('rich-editor').hidden = false;
  $('heading-toolbar').hidden = false;
  $('editor').hidden = true;
  document.querySelectorAll('[role="tab"]').forEach(button => button.setAttribute('aria-controls', 'rich-editor'));
  renderRichNote();
  richEditor.on('text-change', () => { if (!renderingNote) { save(); updateHeadingButtons(); } });
  richEditor.on('selection-change', range => {
    if (range) $('editor').selectionStart = Math.min(range.index, $('editor').value.length);
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
