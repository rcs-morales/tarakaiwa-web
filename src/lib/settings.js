// ─────────────────────────────────────────────
// CENTRALIZED SETTINGS / LOCALSTORAGE MODULE
// ─────────────────────────────────────────────

/**
 * All known localStorage keys used across the app.
 * Import KEYS instead of scattering raw strings in every module.
 */
export const KEYS = {
  API_KEY: 'api_key',
  API_PROVIDER: 'api_provider',
  JLPT_LEVEL: 'jlpt_level',
  STT_MODE: 'stt_mode',
  TTS_MODE: 'tts_mode',
  TTS_DEFAULT_FLAG: 'tts_default_browser_v1',
  VOICEVOX_SPEAKER: 'voicevox_speaker',
  GRADING_MODEL: 'groq_grading_model',
  QA_DATA: 'jlpt_qa_data',
  AVATAR_MODEL: 'avatar_model',
  TTS_SPEED: 'tts_speed',
  SOURCE_LANGUAGE: 'source_language',
  SETUP_COMPLETE: 'setup_complete',
  TUTORIAL_DONE: 'tutorial_done',
  // 'light' | 'dark'; absent = follow the system preference. Synced.
  THEME: 'app_theme',
  // '1' (default) = shuffle question order each session; '0' = deck order.
  SHUFFLE_QUESTIONS: 'shuffle_questions',
  // Device-local record of finished practice runs (newest first, capped) —
  // the dashboard's stats source. The signed-in cross-device record lives in
  // the session_results table instead; this key never syncs.
  SESSION_HISTORY: 'session_history',
  // Device-local id of the synced deck row (never synced itself).
  // Legacy (pre multi-deck) — read once for migration, no longer written.
  DECK_ID: 'synced_deck_id',
  // Legacy (pre multi-deck) — read once for migration, no longer written.
  DECK_UPDATED_AT: 'deck_updated_at',
  // Multi-deck list: JSON array of { id, name, jlptLevel, qa, updatedAt }.
  // `id` is a client-generated uuid, reused as-is for the Supabase `decks.id`
  // primary key. Never synced itself — decks.js pushes/pulls each deck row
  // individually via the `decks` table instead.
  DECKS: 'decks_list',
  // Device-local pointer: which deck id is currently loaded into the
  // session. `null` (absent) means the built-in Sample deck.
  ACTIVE_DECK_ID: 'active_deck_id',
  // Learning aids (Phase 5f) — '1' shows the aid, '0' hides it. Synced.
  SHOW_FURIGANA: 'show_furigana',
  SHOW_ROMAJI: 'show_romaji',
  SHOW_EN_HINTS: 'show_en_hints',
  // Sessions-per-day goal target ('1'..'10'). Synced.
  DAILY_GOAL: 'daily_goal_target',
};

/**
 * Default values returned by get() when a key has no stored value.
 */
const DEFAULTS = {
  [KEYS.JLPT_LEVEL]: 'N5',
  [KEYS.STT_MODE]: 'ai',
  [KEYS.TTS_MODE]: 'browser',
  [KEYS.VOICEVOX_SPEAKER]: '3',
  [KEYS.AVATAR_MODEL]: 'simple',
  [KEYS.TTS_SPEED]: '0.85',
  [KEYS.SOURCE_LANGUAGE]: 'English',
  [KEYS.SHUFFLE_QUESTIONS]: '1',
  [KEYS.SHOW_FURIGANA]: '1',
  [KEYS.SHOW_ROMAJI]: '1',
  [KEYS.SHOW_EN_HINTS]: '1',
  [KEYS.DAILY_GOAL]: '3',
};

/**
 * Read a setting from localStorage, falling back to DEFAULTS.
 * @param {string} key — one of the KEYS constants
 * @returns {string|null}
 */
export function get(key) {
  return localStorage.getItem(key) ?? DEFAULTS[key] ?? null;
}

// Optional hook invoked after every set()/remove(). sync.js registers this to
// debounce-upload changed settings; when nothing registers it, set/remove keep
// their original localStorage-only behaviour (logged-out path unchanged).
let changeHook = null;

/**
 * Register a callback fired after each set()/remove(). Called as (key).
 * Pass null to unregister.
 */
export function onChange(hook) {
  changeHook = hook;
}

function notifyChange(key) {
  if (!changeHook) return;
  try { changeHook(key); } catch (e) { console.error('settings change hook error:', e); }
}

/**
 * Write a setting to localStorage.
 * @param {string} key
 * @param {string} value
 */
export function set(key, value) {
  localStorage.setItem(key, value);
  notifyChange(key);
}

/**
 * Remove a setting from localStorage.
 * @param {string} key
 */
export function remove(key) {
  localStorage.removeItem(key);
  notifyChange(key);
}
