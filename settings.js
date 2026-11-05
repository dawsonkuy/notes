(() => {
  const dialog = document.getElementById('settings-dialog');
  const choices = [...dialog.querySelectorAll('input[name="theme"]')];
  const status = document.getElementById('theme-status');
  const currentTheme = () => document.documentElement.dataset.theme || 'ruled';
  const refresh = () => choices.forEach(input => { input.checked = input.value === currentTheme(); });
  refresh();
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
