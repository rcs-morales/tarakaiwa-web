// ─────────────────────────────────────────────
// APP SHELL STATE — active tab (Phase 5b)
// ─────────────────────────────────────────────
//
// Tabs are view-state inside the single route, not URL routes: every panel
// stays mounted and is shown/hidden with CSS only, so the Live2D canvas in
// the Practice panel is never torn down. Importable from plain JS modules
// (app.js) as well as components.

export const TABS = [
  { id: 'practice', label: 'Practice', icon: '🎙️' },
  { id: 'decks', label: 'Decks', icon: '🗂️' },
  { id: 'progress', label: 'Progress', icon: '📈' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export const shell = $state({ tab: 'practice' });

export function setTab(id) {
  if (TABS.some(t => t.id === id)) shell.tab = id;
}
