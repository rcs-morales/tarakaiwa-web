// ─────────────────────────────────────────────
// LEARNING PREFERENCES — aids toggles + daily goal (Phase 5f)
// ─────────────────────────────────────────────
//
// Reactive view over the settings.js keys the new Settings screen edits:
// the three learning-aid toggles (furigana / romaji / English hints) and the
// sessions-per-day goal target. The aids act purely presentationally — the
// imperative modules keep rendering furigana ruby, the romaji line and the
// translate affordances exactly as before, and CSS classes on <body>
// (aids-hide-furigana / aids-hide-romaji / aids-hide-en, rules in style.css)
// hide them when a toggle is off. No grading or session logic changes.

import { get, set, KEYS } from './settings.js';
import { DAILY_GOAL_DEFAULT } from './gamification.svelte.js';

export const DAILY_GOAL_MIN = 1;
export const DAILY_GOAL_MAX = 10;

export const prefs = $state({
  furigana: true,
  romaji: true,
  enHints: true,
  dailyGoal: DAILY_GOAL_DEFAULT,
});

function readStored() {
  prefs.furigana = get(KEYS.SHOW_FURIGANA) !== '0';
  prefs.romaji = get(KEYS.SHOW_ROMAJI) !== '0';
  prefs.enHints = get(KEYS.SHOW_EN_HINTS) !== '0';
  prefs.dailyGoal = clampGoal(parseInt(get(KEYS.DAILY_GOAL), 10));
}

function clampGoal(n) {
  if (!Number.isFinite(n)) return DAILY_GOAL_DEFAULT;
  return Math.min(Math.max(n, DAILY_GOAL_MIN), DAILY_GOAL_MAX);
}

/** Mirror the aid toggles onto <body> so CSS can hide the imperative nodes. */
function applyAidClasses() {
  const cls = document.body.classList;
  cls.toggle('aids-hide-furigana', !prefs.furigana);
  cls.toggle('aids-hide-romaji', !prefs.romaji);
  cls.toggle('aids-hide-en', !prefs.enHints);
}

const AID_KEYS = {
  furigana: KEYS.SHOW_FURIGANA,
  romaji: KEYS.SHOW_ROMAJI,
  enHints: KEYS.SHOW_EN_HINTS,
};

/** Flip one of the aid toggles ('furigana' | 'romaji' | 'enHints'). */
export function setAid(name, on) {
  if (!(name in AID_KEYS)) return;
  prefs[name] = !!on;
  set(AID_KEYS[name], on ? '1' : '0');
  applyAidClasses();
}

/** Set the sessions-per-day target, clamped to [MIN, MAX]. */
export function setDailyGoal(n) {
  prefs.dailyGoal = clampGoal(n);
  set(KEYS.DAILY_GOAL, String(prefs.dailyGoal));
}

/**
 * Load stored values and apply the body classes. Called from initApp, and
 * again whenever a login pull rewrites localStorage ('settings-synced').
 */
export function initPrefs() {
  readStored();
  applyAidClasses();
  window.addEventListener('settings-synced', () => {
    readStored();
    applyAidClasses();
  });
}
