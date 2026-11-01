const $ = (id) => document.getElementById(id);
let filename = 'Untitled';
const key = () => 'notepad:note';
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
    localStorage.setItem(key(), JSON.stringify({ text: $('editor').value, filename }));
    $('save-status').textContent = 'Saved locally';
  } catch { $('save-status').textContent = 'Unable to save — download a copy'; }
  position();
}
function setTitle() {
  $('title').textContent = `${filename} - Notepad`;
  document.title = `${filename} - Notepad`;
}
$('editor').addEventListener('input', save);
['click', 'keyup', 'select'].forEach(type => $('editor').addEventListener(type, position));
$('new').onclick = () => {
  if ($('editor').value && !confirm('Start a new note? Download a copy first if you want to keep this note.')) return;
  $('editor').value = ''; filename = 'Untitled'; setTitle(); save(); closeMenus(); $('editor').focus();
};
$('download').onclick = () => {
  const url = URL.createObjectURL(new Blob([$('editor').value], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename === 'Untitled' ? 'Untitled.txt' : filename;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); closeMenus();
};
$('open').onclick = () => { closeMenus(); $('file').click(); };
$('file').onchange = async () => {
  const file = $('file').files[0];
  if (!file) return;
  if ($('editor').value && !confirm('Replace the current note? Download a copy first if you want to keep it.')) { $('file').value = ''; return; }
  try { $('editor').value = await file.text(); filename = file.name; setTitle(); save(); $('editor').focus(); }
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
  // Carry forward the active demo user's note without deleting older notes.
  const previous = sessionStorage.getItem('notepad:user');
  const stored = localStorage.getItem(key()) ?? (previous ? localStorage.getItem(`notepad:note:${previous}`) : null);
  const saved = JSON.parse(stored || 'null');
  $('editor').value = saved?.text || '';
  filename = saved?.filename || 'Untitled';
} catch { $('save-status').textContent = 'Unable to restore local note — you can still edit and download'; }
setTitle();
position();
$('editor').focus();
