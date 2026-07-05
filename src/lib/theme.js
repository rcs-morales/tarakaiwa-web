// ─────────────────────────────────────────────
// THEME — light/dark token switching
// ─────────────────────────────────────────────
//
// The tokens live in public/assets/style.css (:root and
// :root[data-theme="dark"]). An inline script in app.html applies the theme
// before first paint; this module keeps it in sync afterwards (toggle button,
// settings sync from another device, OS preference changes).

import { get, set, KEYS } from './settings.js';

/** The effective theme: the saved choice, else the system preference. */
export function resolveTheme() {
  const saved = get(KEYS.THEME);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Stamp the effective theme on <html> and refresh the toggle button icon. */
export function applyTheme() {
  const theme = resolveTheme();
  document.documentElement.dataset.theme = theme;

  const btn = document.getElementById('btn-theme-toggle');
  if (btn) {
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    btn.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  }
}

/** Flip the theme and persist the choice (set() also syncs it when signed in). */
export function toggleTheme() {
  set(KEYS.THEME, resolveTheme() === 'dark' ? 'light' : 'dark');
  applyTheme();
}

/** Call once on boot: sync the button icon and follow OS changes while the
 *  user hasn't picked an explicit theme. */
export function initTheme() {
  applyTheme();
  window.matchMedia?.('(prefers-color-scheme: dark)')
    .addEventListener?.('change', () => {
      if (!get(KEYS.THEME)) applyTheme();
    });
}
