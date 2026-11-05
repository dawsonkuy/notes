(() => {
  const dialog = document.getElementById('settings-dialog');
  const choices = [...dialog.querySelectorAll('input[name="theme"]')];
  const status = document.getElementById('theme-status');
  const currentTheme = () => document.documentElement.dataset.theme || 'ruled';
  const refresh = () => choices.forEach(input => { input.checked = input.value === currentTheme(); });
  refresh();
  const sizePicker = document.getElementById('note-size');
  const sizeStatus = document.getElementById('size-status');
  sizePicker.value = document.documentElement.dataset.textSize || 'small';
  sizePicker.addEventListener('change', () => {
    document.documentElement.dataset.textSize = sizePicker.value;
    try {
      localStorage.setItem('notepad:text-size', sizePicker.value);
      sizeStatus.textContent = 'Your text size is saved on this device.';
    } catch { sizeStatus.textContent = 'Size applied. Your browser could not save this preference.'; }
  });
  window.addEventListener('storage', event => {
    if (event.key !== 'notepad:text-size') return;
    const value = ['small', 'medium', 'large'].includes(event.newValue) ? event.newValue : 'small';
    document.documentElement.dataset.textSize = value;
    sizePicker.value = value;
  });
  const fontPicker = document.getElementById('note-font');
  const fontStatus = document.getElementById('font-status');
  fontPicker.value = document.documentElement.dataset.font || 'mono';
  fontPicker.addEventListener('change', () => {
    document.documentElement.dataset.font = fontPicker.value;
    try {
      localStorage.setItem('notepad:font', fontPicker.value);
      fontStatus.textContent = 'Your font is saved on this device.';
    } catch { fontStatus.textContent = 'Font applied. Your browser could not save this preference.'; }
  });
  window.addEventListener('storage', event => {
    if (event.key !== 'notepad:font') return;
    const value = [...fontPicker.options].some(option => option.value === event.newValue) ? event.newValue : 'mono';
    document.documentElement.dataset.font = value;
    fontPicker.value = value;
  });
  document.getElementById('open-settings').addEventListener('click', () => { refresh(); dialog.showModal(); });
  document.getElementById('close-settings').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
  choices.forEach(input => input.addEventListener('change', () => {
    if (!input.checked) return;
    document.documentElement.dataset.theme = input.value;
    try {
      localStorage.setItem('notepad:theme', input.value);
      status.textContent = 'Your theme is saved on this device.';
    } catch { status.textContent = 'Theme applied. Your browser could not save this preference.'; }
  }));
  window.addEventListener('storage', event => {
    if (event.key !== 'notepad:theme') return;
    document.documentElement.dataset.theme = choices.some(input => input.value === event.newValue) ? event.newValue : 'ruled';
    refresh();
  });
})();
