// ─────────────────────────────────────────────
// THEME — light/dark token switching
// ─────────────────────────────────────────────
//
// The tokens live in public/assets/style.css (:root and
// :root[data-theme="dark"]). An inline script in app.html applies the theme
// before first paint; this module keeps it in sync afterwards (toggle button,
// settings sync from another device, OS preference changes). Shell.svelte's
// toggle button renders from `theme.current`.

import { get, set, KEYS } from './settings.js';

/** @typedef {'light' | 'dark'} Theme */

export const theme = $state({
  /** @type {Theme} — starts from what app.html stamped before first paint. */
  current: globalThis.document?.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
});

/** The effective theme: the saved choice, else the system preference. */
export function resolveTheme() {
  const saved = get(KEYS.THEME);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Stamp the effective theme on <html> (and the toggle button's state). */
export function applyTheme() {
  const current = resolveTheme();
  document.documentElement.dataset.theme = current;
  theme.current = current;
}

/** Flip the theme and persist the choice (set() also syncs it when signed in). */
export function toggleTheme() {
  set(KEYS.THEME, resolveTheme() === 'dark' ? 'light' : 'dark');
  applyTheme();
}

let followingSystem = false;

/** Call on boot: sync the toggle button and follow OS changes while the user
 *  hasn't picked an explicit theme. Safe to call again. */
export function initTheme() {
  applyTheme();
  if (followingSystem) return;
  followingSystem = true;
  window.matchMedia?.('(prefers-color-scheme: dark)')
    .addEventListener?.('change', () => {
      if (!get(KEYS.THEME)) applyTheme();
    });
}
