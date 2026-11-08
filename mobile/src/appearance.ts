export type Colors = { font: string; primary: string; secondary: string };
export type Mode = 'light' | 'dark';
export type Theme = { id: string; name: string; mode: Mode; colors: Colors };
export type Appearance = { mode: Mode; colors: Colors; themes: Theme[]; selected: string | null; font: 'sans' | 'serif' | 'mono' | 'rounded'; size: 16 | 18 | 22 };
export const defaults: Record<Mode, Colors> = { light: { font: '#292d37', primary: '#faf7ef', secondary: '#eee8da' }, dark: { font: '#f1f4f9', primary: '#0c1422', secondary: '#162236' } };
export const validColors = (value: unknown): value is Colors => Boolean(value && ['font', 'primary', 'secondary'].every(key => /^#[0-9a-f]{6}$/i.test((value as Record<string, string>)[key])));
export function initialAppearance(mode: Mode = 'dark'): Appearance { return { mode, colors: { ...defaults[mode] }, themes: [], selected: null, font: 'sans', size: 16 }; }
export function restoreAppearance(raw: unknown, mode: Mode = 'dark'): Appearance {
  const value = raw as Appearance | null; if (!value || !validColors(value.colors) || !['light', 'dark'].includes(value.mode)) return initialAppearance(mode);
  const themes = (Array.isArray(value.themes) ? value.themes : []).filter(t => t && typeof t.id === 'string' && typeof t.name === 'string' && ['light', 'dark'].includes(t.mode) && validColors(t.colors)).slice(0, 4).map(t => ({ id: t.id, name: t.name.slice(0, 24), mode: t.mode, colors: { ...t.colors } }));
  return { mode: value.mode, colors: { ...value.colors }, themes, selected: themes.some(t => t.id === value.selected) ? value.selected : null, font: ['sans', 'serif', 'mono', 'rounded'].includes(value.font) ? value.font : 'sans', size: [16, 18, 22].includes(value.size) ? value.size : 16 };
}
export function saveTheme(state: Appearance, name: string, id: string): Appearance {
  if (state.themes.length >= 4) return state;
  return { ...state, selected: id, themes: [...state.themes, { id, name: name.trim().slice(0, 24) || `Theme ${state.themes.length + 1}`, mode: state.mode, colors: { ...state.colors } }] };
}
export function mix(a: string, b: string, amount: number): string { return '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - amount) + parseInt(b.slice(i, i + 2), 16) * amount).toString(16).padStart(2, '0')).join(''); }
export function palette(appearance: Appearance) { const c = appearance.colors; return { ...c, muted: mix(c.primary, c.font, .67), border: mix(c.primary, c.font, .17), selected: mix(c.secondary, c.font, .1), dark: [1, 3, 5].reduce((sum, i, n) => sum + parseInt(c.primary.slice(i, i + 2), 16) * [.2126, .7152, .0722][n], 0) < 145 }; }
export type HSV = { h: number; s: number; v: number };
export function toHSV(hex: string): HSV {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = 0; if (delta) h = max === r ? 60 * (((g - b) / delta) % 6) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4);
  return { h: (h + 360) % 360, s: max ? delta / max : 0, v: max };
}
export function fromHSV({ h, s, v }: HSV): string {
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, channels = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + channels.map(n => Math.round((n + m) * 255).toString(16).padStart(2, '0')).join('');
}
