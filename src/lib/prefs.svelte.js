// ─────────────────────────────────────────────
// PREFERENCES — the Settings controls, as reactive state
// ─────────────────────────────────────────────
//
// Reactive view over the settings.js keys the Settings screen (and the Decks
// shuffle toggle / onboarding level step) edit: the learning-aid toggles,
// the daily goal, and the practice/voice/AI preferences. Setters persist via
// settings.js (which the cloud sync hook watches); side effects such as
// reloading the avatar stay with the caller. The aids act purely presentationally — the
// imperative modules keep rendering furigana ruby, the romaji line and the
// translate affordances exactly as before, and CSS classes on <body>
// (aids-hide-furigana / aids-hide-romaji / aids-hide-en, rules in style.css)
// hide them when a toggle is off. No grading or session logic changes.

import { get, set, KEYS } from './settings.js';
import { DAILY_GOAL_DEFAULT } from './gamification.svelte.js';
import { GROQ_GRADING_MODELS } from './data.js';

export const DAILY_GOAL_MIN = 1;
export const DAILY_GOAL_MAX = 10;

export const prefs = $state({
  furigana: true,
  romaji: true,
  enHints: true,
  dailyGoal: DAILY_GOAL_DEFAULT,
  // Practice / voice / AI (defaults mirror settings.js DEFAULTS)
  jlptLevel: 'N5',
  gradingModel: GROQ_GRADING_MODELS.balanced,
  sttMode: 'ai',
  ttsMode: 'browser',
  voicevoxSpeaker: '3',
  avatarModel: 'simple',
  ttsSpeed: '0.85',
  shuffle: true,
});

function readStored() {
  prefs.furigana = get(KEYS.SHOW_FURIGANA) !== '0';
  prefs.romaji = get(KEYS.SHOW_ROMAJI) !== '0';
  prefs.enHints = get(KEYS.SHOW_EN_HINTS) !== '0';
  prefs.dailyGoal = clampGoal(parseInt(get(KEYS.DAILY_GOAL), 10));
  prefs.jlptLevel = get(KEYS.JLPT_LEVEL);
  // Same rule as groqClient getGradingModel(): unknown values fall back to Balanced.
  const model = get(KEYS.GRADING_MODEL);
  prefs.gradingModel = Object.values(GROQ_GRADING_MODELS).includes(model) ? model : GROQ_GRADING_MODELS.balanced;
  prefs.sttMode = get(KEYS.STT_MODE);
  prefs.ttsMode = get(KEYS.TTS_MODE);
  prefs.voicevoxSpeaker = get(KEYS.VOICEVOX_SPEAKER);
  prefs.avatarModel = get(KEYS.AVATAR_MODEL);
  prefs.ttsSpeed = get(KEYS.TTS_SPEED);
  prefs.shuffle = get(KEYS.SHUFFLE_QUESTIONS) !== '0';
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

/** Default level for new decks ('N5' | 'N4' | 'N3'). */
export function setJlptLevel(level) {
  prefs.jlptLevel = level;
  set(KEYS.JLPT_LEVEL, level);
}

/** Groq model used for grading and the study tools. */
export function setGradingModel(model) {
  prefs.gradingModel = model;
  set(KEYS.GRADING_MODEL, model);
}

/** Speech recognition: 'ai' (Groq Whisper) | 'browser'. */
export function setSttMode(mode) {
  prefs.sttMode = mode;
  set(KEYS.STT_MODE, mode);
}

/**
 * Text-to-speech: 'browser' | 'voicevox'. Switching to VOICEVOX starts on the
 * default cloud voice (Zundamon, '3').
 */
export function setTtsMode(mode) {
  prefs.ttsMode = mode;
  set(KEYS.TTS_MODE, mode);
  if (mode === 'voicevox') setVoicevoxSpeaker('3');
}

/** VOICEVOX speaker id. */
export function setVoicevoxSpeaker(id) {
  if (!id) return;
  prefs.voicevoxSpeaker = id;
  set(KEYS.VOICEVOX_SPEAKER, id);
}

/** Live2D avatar model name. */
export function setAvatarModel(name) {
  if (name === get(KEYS.AVATAR_MODEL)) return;
  prefs.avatarModel = name;
  set(KEYS.AVATAR_MODEL, name);
}

/** Question speaking speed, e.g. '0.85'. */
export function setTtsSpeed(value) {
  prefs.ttsSpeed = String(value);
  set(KEYS.TTS_SPEED, prefs.ttsSpeed);
}

/** Shuffle question order each session. */
export function setShuffle(on) {
  prefs.shuffle = !!on;
  set(KEYS.SHUFFLE_QUESTIONS, on ? '1' : '0');
}

let syncListenerAdded = false;

/**
 * Load stored values and apply the body classes. Called from initApp (after
 * its first-run defaults are written), and again whenever a login pull
 * rewrites localStorage ('settings-synced').
 */
export function initPrefs() {
  readStored();
  applyAidClasses();
  if (syncListenerAdded) return;
  syncListenerAdded = true;
  window.addEventListener('settings-synced', () => {
    readStored();
    applyAidClasses();
  });
}
