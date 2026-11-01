const $ = (id) => document.getElementById(id);
let tabs = [];
let activeId;
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
  const before = text.slice(0, $('editor').selectionStart);
  const lines = before.split('\n');
  $('position').textContent = `Ln ${lines.length}, Col ${lines.at(-1).length + 1}`;
  $('count').textContent = `${text.length.toLocaleString()} characters`;
}
function save() {
  try {
    active().text = $('editor').value;
    refreshNames();
    localStorage.setItem('notepad:tabs', JSON.stringify({ tabs, activeId }));
    $('save-status').textContent = 'Saved locally';
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
    button.setAttribute('aria-controls', 'editor');
    button.tabIndex = tab.id === activeId ? 0 : -1;
    button.textContent = noteName(tab);
    button.title = `${noteName(tab)} — drag to reorder; right-click to rename`;
    button.oncontextmenu = event => { event.preventDefault(); renameTab(tab); };
    button.draggable = true;
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
  setTitle(); renderTabs(); position(); $('editor').focus();
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
