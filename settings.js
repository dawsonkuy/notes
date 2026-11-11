(() => {
  const dialog = document.getElementById('settings-dialog');
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
  const fontChoices = [...document.querySelectorAll('input[name="note-font"]')];
  const fontStatus = document.getElementById('font-status');
  const refreshFonts = () => fontChoices.forEach(input => { input.checked = input.value === (document.documentElement.dataset.font || 'mono'); });
  refreshFonts();
  fontChoices.forEach(input => input.addEventListener('change', () => {
    if (!input.checked) return;
    document.documentElement.dataset.font = input.value;
    try {
      localStorage.setItem('notepad:font', input.value);
      fontStatus.textContent = 'Your font is saved on this device.';
    } catch { fontStatus.textContent = 'Font applied. Your browser could not save this preference.'; }
  }));
  window.addEventListener('storage', event => {
    if (event.key !== 'notepad:font') return;
    document.documentElement.dataset.font = fontChoices.some(input => input.value === event.newValue) ? event.newValue : 'mono';
    refreshFonts();
  });
  document.getElementById('open-settings').addEventListener('click', () => { dialog.showModal(); });
  document.getElementById('close-settings').addEventListener('click', () => dialog.close());
  document.getElementById('open-account-settings').addEventListener('click', () => {
    dialog.close();
    document.getElementById('open-login').click();
  });
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
})();
