// ─────────────────────────────────────────────
// CENTRALIZED SETTINGS / LOCALSTORAGE MODULE
// ─────────────────────────────────────────────

/**
 * All known localStorage keys used across the app.
 * Import KEYS instead of scattering raw strings in every module.
 */
export const KEYS = {
  API_KEY: 'api_key',
  LEGACY_API_KEY: 'gemini_api_key',
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
};

/**
 * Read a setting from localStorage, falling back to DEFAULTS.
 * @param {string} key — one of the KEYS constants
 * @returns {string|null}
 */
export function get(key) {
  return localStorage.getItem(key) ?? DEFAULTS[key] ?? null;
}

/**
 * Write a setting to localStorage.
 * @param {string} key
 * @param {string} value
 */
export function set(key, value) {
  localStorage.setItem(key, value);
}

/**
 * Remove a setting from localStorage.
 * @param {string} key
 */
export function remove(key) {
  localStorage.removeItem(key);
}
