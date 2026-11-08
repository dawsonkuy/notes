(() => {
  const KEY = 'bestpad:appearance:v1';
  const MAX_THEMES = 4;
  const defaults = {
    light: { font: '#292d37', primary: '#faf7ef', secondary: '#eee8da' },
    dark: { font: '#f1f4f9', primary: '#0c1422', secondary: '#162236' }
  };
  const validColors = colors => colors && ['font', 'primary', 'secondary'].every(key => /^#[0-9a-f]{6}$/i.test(colors[key]));
  const cleanColors = colors => Object.fromEntries(['font', 'primary', 'secondary'].map(key => [key, colors[key].toLowerCase()]));
  function initialState() {
    let mode = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    try {
      const previous = localStorage.getItem('notepad:theme');
      if (previous) mode = ['darkpad', 'green', 'slate', 'midnight', 'forest'].includes(previous) ? 'dark' : 'light';
      const cached = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (cached && ['light', 'dark'].includes(cached.mode) && validColors(cached.colors)) {
        const themes = (Array.isArray(cached.themes) ? cached.themes : []).filter(theme => theme && typeof theme.id === 'string' && typeof theme.name === 'string' && ['light', 'dark'].includes(theme.mode) && validColors(theme.colors)).slice(0, MAX_THEMES).map(theme => ({ id: theme.id.slice(0, 64), name: theme.name.slice(0, 24), mode: theme.mode, colors: cleanColors(theme.colors) }));
        return { mode: cached.mode, colors: cleanColors(cached.colors), themes, selected: themes.some(theme => theme.id === cached.selected) ? cached.selected : null };
      }
      if (document.querySelector('[data-appearance-surface="app"]')) {
        const old = JSON.parse(localStorage.getItem('bestpad:app-preview:appearance') || 'null');
        if (validColors(old?.colors)) return { mode: ['cream', 'lavender'].includes(old.theme) ? 'light' : 'dark', colors: cleanColors(old.colors), themes: [], selected: null };
      }
    } catch { /* Defaults keep appearance usable when storage is unavailable. */ }
    return { mode, colors: { ...defaults[mode] }, themes: [], selected: null };
  }
  let state = initialState();
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const mix = (first, second, amount) => '#' + rgb(first).map((value, i) => Math.round(value + (rgb(second)[i] - value) * amount).toString(16).padStart(2, '0')).join('');
  const luminance = hex => rgb(hex).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function toHSV(hex) {
    const [r, g, b] = rgb(hex).map(value => value / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    let hue = 0;
    if (delta) hue = max === r ? 60 * (((g - b) / delta) % 6) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4);
    return { h: (hue + 360) % 360, s: max ? delta / max : 0, v: max };
  }
  function fromHSV({ h, s, v }) {
    const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
    const channels = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return '#' + channels.map(value => Math.round((value + m) * 255).toString(16).padStart(2, '0')).join('');
  }
  function apply() {
    const root = document.documentElement, c = state.colors;
    const values = { '--text': c.font, '--bg': c.primary, '--canvas': c.primary, '--card': c.secondary, '--panel': c.secondary, '--bar': c.secondary, '--control': mix(c.secondary, c.primary, .35), '--selected': mix(c.secondary, c.font, .1), '--card2': mix(c.secondary, c.font, .1), '--hover': mix(c.secondary, c.font, .16), '--muted': mix(c.primary, c.font, .68), '--line': mix(c.primary, c.font, .15), '--border': mix(c.primary, c.font, .3), '--soft-border': mix(c.primary, c.font, .16), '--gold': c.font, '--accent': c.font, '--accent-ink': c.primary, '--brand-filter': luminance(c.primary) > 145 ? 'brightness(0)' : 'none' };
    Object.entries(values).forEach(([key, value]) => root.style.setProperty(key, value));
    root.dataset.theme = state.mode;
    root.style.colorScheme = luminance(c.primary) > 145 ? 'light' : 'dark';
    document.dispatchEvent(new CustomEvent('bestpad:appearancechange'));
  }
  const mounts = [...document.querySelectorAll('[data-appearance-settings]')];
  function persist(message) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); mounts.forEach(mount => { mount.querySelector('[data-appearance-status]').textContent = message || 'Appearance saved on this device.'; }); }
    catch { mounts.forEach(mount => { mount.querySelector('[data-appearance-status]').textContent = 'Appearance applied. This browser could not save your changes.'; }); }
  }
  const views = [];
  function refresh() { apply(); views.forEach(view => view.render()); }
  mounts.forEach((mount, number) => {
    const uid = `appearance-${number}`;
    mount.classList.add('appearance-settings');
    mount.innerHTML = `
      <section class="appearance-section"><h3>Mode</h3><div class="appearance-modes" role="group" aria-label="Appearance mode"><button type="button" data-mode="light" aria-pressed="false">☀ <span>Light</span></button><button type="button" data-mode="dark" aria-pressed="false">☾ <span>Dark</span></button></div></section>
      <section class="appearance-section"><h3>Customize colors</h3><div class="appearance-parts" role="group" aria-label="Choose a color to edit">
        <button type="button" data-part="font" aria-controls="${uid}-editor" aria-expanded="false"><i></i><span>Font<small>Text & icons</small></span></button>
        <button type="button" data-part="primary" aria-controls="${uid}-editor" aria-expanded="false"><i></i><span>Primary<small>Background</small></span></button>
        <button type="button" data-part="secondary" aria-controls="${uid}-editor" aria-expanded="false"><i></i><span>Secondary<small>Cards & controls</small></span></button>
      </div>
      <div id="${uid}-editor" class="appearance-color-editor" data-color-editor role="group" aria-labelledby="${uid}-title" hidden>
        <div class="appearance-color-heading"><strong id="${uid}-title" data-color-title>Font color</strong><button type="button" data-close-color aria-label="Close color picker">×</button></div>
        <div class="appearance-wheel" data-wheel role="slider" tabindex="0" aria-label="Color wheel. Left and right adjust hue; up and down adjust saturation." aria-valuemin="0" aria-valuemax="359" aria-valuenow="0"><div class="appearance-wheel-surface"></div><span class="appearance-wheel-marker"></span></div>
        <label class="appearance-brightness-label" for="${uid}-brightness">Brightness<span data-brightness-value>100%</span></label><input id="${uid}-brightness" data-brightness type="range" min="0" max="100" value="100">
        <label class="appearance-hex-label" for="${uid}-hex">Hex color<input id="${uid}-hex" data-hex type="text" maxlength="7" pattern="#[0-9a-fA-F]{6}" spellcheck="false" autocomplete="off"></label>
      </div></section>
      <section class="appearance-section"><div class="appearance-section-heading"><h3>Your themes</h3><span data-theme-count>0 / 4</span></div><div class="appearance-saved-themes" data-saved-themes></div>
        <form class="appearance-save-form" data-save-form><label class="sr-only" for="${uid}-name">Theme name</label><input id="${uid}-name" data-theme-name maxlength="24" placeholder="Name your theme" autocomplete="off"><button type="submit" data-save-theme>Save theme</button></form>
        <button type="button" class="appearance-update" data-update-theme hidden>Update selected theme</button><p class="appearance-limit" data-limit-note>Save up to four custom themes.</p>
      </section><p class="appearance-status" data-appearance-status role="status">Colors and saved themes are shared on this device.</p>`;
    const find = selector => mount.querySelector(selector);
    let applyingWheel = false;
    let part = null, hsv = { h: 0, s: 1, v: 1 };
    const wheel = find('[data-wheel]'), hex = find('[data-hex]'), brightness = find('[data-brightness]');
    function renderWheel() {
      if (!part) return;
      wheel.style.setProperty('--wheel-brightness', hsv.v);
      wheel.style.setProperty('--marker-x', `${50 + Math.sin(hsv.h * Math.PI / 180) * hsv.s * 50}%`);
      wheel.style.setProperty('--marker-y', `${50 - Math.cos(hsv.h * Math.PI / 180) * hsv.s * 50}%`);
      wheel.setAttribute('aria-valuenow', String(Math.round(hsv.h) % 360)); wheel.setAttribute('aria-valuetext', fromHSV(hsv));
      hex.value = state.colors[part].toUpperCase(); hex.setCustomValidity(''); brightness.value = Math.round(hsv.v * 100); find('[data-brightness-value]').textContent = `${Math.round(hsv.v * 100)}%`;
    }
    function render() {
      mount.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode)));
      mount.querySelectorAll('[data-part]').forEach(button => { button.querySelector('i').style.background = state.colors[button.dataset.part]; button.setAttribute('aria-expanded', String(button.dataset.part === part)); });
      find('[data-theme-count]').textContent = `${state.themes.length} / ${MAX_THEMES}`;
      find('[data-save-theme]').disabled = state.themes.length >= MAX_THEMES;
      find('[data-limit-note]').textContent = state.themes.length >= MAX_THEMES ? 'Four themes saved. Delete one to make room, or update a selected theme.' : 'Save up to four custom themes.';
      const selected = state.themes.find(theme => theme.id === state.selected);
      find('[data-update-theme]').hidden = !selected;
      if (selected) find('[data-update-theme]').textContent = `Update “${selected.name}”`;
      const list = find('[data-saved-themes]'); list.replaceChildren();
      if (!state.themes.length) { const empty = document.createElement('p'); empty.className = 'appearance-empty'; empty.textContent = 'No saved themes.'; list.append(empty); }
      state.themes.forEach(theme => {
        const row = document.createElement('div'); row.className = 'appearance-theme-row';
        const button = document.createElement('button'); button.type = 'button'; button.className = 'appearance-theme-choice'; button.dataset.savedTheme = theme.id; button.setAttribute('aria-pressed', String(theme.id === state.selected));
        const swatches = document.createElement('span'); swatches.className = 'appearance-theme-swatches'; swatches.setAttribute('aria-hidden', 'true');
        ['primary', 'secondary', 'font'].forEach(key => { const swatch = document.createElement('i'); swatch.style.background = theme.colors[key]; swatches.append(swatch); });
        const label = document.createElement('span'); label.textContent = theme.name; button.append(swatches, label);
        button.onclick = () => { state.mode = theme.mode; state.colors = { ...theme.colors }; state.selected = theme.id; find('[data-theme-name]').value = theme.name; refresh(); if (part) { hsv = toHSV(state.colors[part]); renderWheel(); } persist(`Applied “${theme.name}”.`); };
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'appearance-theme-remove'; remove.textContent = '×'; remove.setAttribute('aria-label', `Delete theme ${theme.name}`);
        remove.onclick = () => { state.themes = state.themes.filter(item => item.id !== theme.id); if (state.selected === theme.id) { state.selected = null; find('[data-theme-name]').value = ''; } refresh(); persist(`Deleted “${theme.name}”.`); };
        row.append(button, remove); list.append(row);
      });
      if (part) { if (!applyingWheel) hsv = toHSV(state.colors[part]); renderWheel(); }
    }
    mount.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => { state.mode = button.dataset.mode; state.colors = { ...defaults[state.mode] }; state.selected = null; find('[data-theme-name]').value = ''; refresh(); persist(`${state.mode === 'dark' ? 'Dark' : 'Light'} mode applied. Saved themes are kept.`); });
    mount.querySelectorAll('[data-part]').forEach(button => button.onclick = () => { part = button.dataset.part; hsv = toHSV(state.colors[part]); find('[data-color-title]').textContent = `${{font:'Font',primary:'Primary',secondary:'Secondary'}[part]} color`; find('[data-color-editor]').hidden = false; render(); find('[data-color-editor]').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); });
    find('[data-close-color]').onclick = () => { const previous = part; part = null; find('[data-color-editor]').hidden = true; render(); find(`[data-part="${previous}"]`).focus(); };
    function changeColor() { if (!part) return; state.colors[part] = fromHSV(hsv); applyingWheel = true; refresh(); applyingWheel = false; persist(); }
    function pointer(event) { const rect = wheel.getBoundingClientRect(), x = event.clientX - rect.left - rect.width / 2, y = event.clientY - rect.top - rect.height / 2; hsv.h = (Math.atan2(y, x) * 180 / Math.PI + 450) % 360; hsv.s = clamp(Math.hypot(x, y) / (rect.width / 2), 0, 1); changeColor(); }
    wheel.onpointerdown = event => { if (event.button !== 0) return; event.preventDefault(); wheel.setPointerCapture(event.pointerId); pointer(event); };
    wheel.onpointermove = event => { if (wheel.hasPointerCapture(event.pointerId)) pointer(event); };
    wheel.onpointerup = event => { if (wheel.hasPointerCapture(event.pointerId)) wheel.releasePointerCapture(event.pointerId); };
    wheel.onkeydown = event => { if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return; event.preventDefault(); if (['ArrowLeft','ArrowRight'].includes(event.key)) hsv.h = (hsv.h + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 10 : 1) + 360) % 360; else hsv.s = clamp(hsv.s + (event.key === 'ArrowUp' ? .02 : -.02), 0, 1); changeColor(); };
    brightness.oninput = () => { hsv.v = Number(brightness.value) / 100; changeColor(); };
    hex.oninput = () => hex.setCustomValidity('');
    hex.onchange = () => { if (!/^#[0-9a-f]{6}$/i.test(hex.value.trim())) { hex.setCustomValidity('Use six hexadecimal digits, such as #112233.'); hex.reportValidity(); return; } state.colors[part] = hex.value.trim().toLowerCase(); refresh(); persist(); };
    find('[data-save-form]').onsubmit = event => { event.preventDefault(); if (state.themes.length >= MAX_THEMES) return; const name = find('[data-theme-name]').value.trim().slice(0, 24) || `Theme ${state.themes.length + 1}`; const theme = { id: crypto.randomUUID(), name, mode: state.mode, colors: { ...state.colors } }; state.themes.push(theme); state.selected = theme.id; find('[data-theme-name]').value = name; refresh(); persist(`Saved “${name}”.`); };
    find('[data-update-theme]').onclick = () => { const selected = state.themes.find(theme => theme.id === state.selected); if (!selected) return; selected.name = find('[data-theme-name]').value.trim().slice(0, 24) || selected.name; selected.mode = state.mode; selected.colors = { ...state.colors }; refresh(); persist(`Updated “${selected.name}”.`); };
    views.push({ render });
  });
  refresh();
  window.addEventListener('storage', event => { if (event.key === KEY) { state = initialState(); refresh(); } });
})();
