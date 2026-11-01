const $ = (id) => document.getElementById(id);
let tabs = [];
let activeId;
const active = () => tabs.find(tab => tab.id === activeId);
const makeTab = (text = '', filename = 'Untitled') => ({ id: crypto.randomUUID(), text, filename });
const closeMenus = () => document.querySelectorAll('details[open]').forEach(el => el.open = false);

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
    localStorage.setItem('notepad:tabs', JSON.stringify({ tabs, activeId }));
    $('save-status').textContent = 'Saved locally';
  } catch { $('save-status').textContent = 'Unable to save — download a copy'; }
  position();
}
function setTitle() {
  $('title').textContent = `${active().filename} - Notepad`;
  document.title = `${active().filename} - Notepad`;
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
    button.textContent = tab.filename;
    button.onclick = () => switchTab(tab.id);
    button.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = tabs.findIndex(t => t.id === tab.id);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      switchTab(tabs[next].id); document.getElementById(`tab-${activeId}`).focus();
    };
    const close = document.createElement('button'); close.className = 'close-tab';
    close.textContent = '×'; close.setAttribute('aria-label', `Close ${tab.filename}`);
    close.onclick = () => {
      if (tab.text && !confirm(`Close ${tab.filename}? Download a copy first to keep it.`)) return;
      save();
      const index = tabs.indexOf(tab); tabs.splice(index, 1);
      if (!tabs.length) tabs.push(makeTab());
      if (activeId === tab.id) activeId = tabs[Math.min(index, tabs.length - 1)].id;
      showTab(); save();
    };
    item.append(button, close); $('tabs').append(item);
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
$('new').onclick = () => addTab();
$('add-tab').onclick = () => addTab();
$('download').onclick = () => {
  const url = URL.createObjectURL(new Blob([$('editor').value], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = active().filename === 'Untitled' ? 'Untitled.txt' : active().filename;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); closeMenus();
};
$('open').onclick = () => { closeMenus(); $('file').click(); };
$('file').onchange = async () => {
  const file = $('file').files[0];
  if (!file) return;
  try { addTab(await file.text(), file.name); }
  catch { $('save-status').textContent = 'Unable to open file'; }
  $('file').value = '';
};
$('select-all').onclick = () => { closeMenus(); $('editor').focus(); $('editor').select(); position(); };
$('time').onclick = () => {
  const el = $('editor'); el.setRangeText(new Date().toLocaleString(), el.selectionStart, el.selectionEnd, 'end');
  save(); closeMenus(); el.focus();
};
$('wrap').onchange = () => { $('editor').wrap = $('wrap').checked ? 'soft' : 'off'; closeMenus(); $('editor').focus(); };
document.addEventListener('click', event => { if (!event.target.closest('details')) closeMenus(); });
document.querySelectorAll('details').forEach(el => el.addEventListener('toggle', () => {
  if (el.open) document.querySelectorAll('details').forEach(other => { if (other !== el) other.open = false; });
}));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeMenus();
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); $('download').click(); }
  if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'n') { event.preventDefault(); $('new').click(); }
  if (event.key === 'F5') { event.preventDefault(); $('time').click(); }
});
try {
  const stored = JSON.parse(localStorage.getItem('notepad:tabs') || 'null');
  if (stored?.tabs?.length && stored.tabs.every(tab => typeof tab.id === 'string' && typeof tab.text === 'string' && typeof tab.filename === 'string')) {
    tabs = stored.tabs;
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
