import { showApiKeyStatus, loadApiKey } from './apiKey.svelte.js';
import { initAvatar } from './avatar.js';
import { warmVoicesIfNeeded, refreshVoicePackStatus } from './voicePack.svelte.js';
import { get, set, remove, KEYS } from './settings.js';
import { initPrefs } from './prefs.svelte.js';
import { initAuth, onAuthChange } from './auth.js';
import { registerSettingsSync, onLogin } from './sync.js';
import { syncFromRemote, resetToLocal } from './history.svelte.js';
import { decks, loadActiveDeckIntoSession, adoptSyncedDecks } from './decks.svelte.js';
import { updateQuotaDisplay } from './quota.svelte.js';
import { initTheme, applyTheme } from './theme.svelte.js';

// The Settings tab's preference controls are bound in Settings.svelte
// (prefs.svelte.js, voicePack.svelte.js); the voice pack warmup and status
// live in voicePack.svelte.js.

// The practice screen's controls (session buttons, status line, progress)
// are bound in Practice.svelte / Results.svelte (practiceView.svelte.js).

// The Settings tab (Account & Sync, API key, preferences), the account menu
// and the AI status chip render from reactive state: profile.svelte.js (who
// is signed in), apiKey.svelte.js, quota.svelte.js and prefs.svelte.js.

// ─────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────

// Called from +page.svelte's onMount (the SvelteKit replacement for the old
// DOMContentLoaded listener — the markup is guaranteed mounted by then).
export function initApp() {
  // Sync the theme toggle icon with the pre-paint theme from app.html, and
  // start following OS preference changes.
  initTheme();

  loadActiveDeckIntoSession();

  const savedProvider = get(KEYS.API_PROVIDER);
  if (savedProvider && savedProvider !== 'groq') {
    remove(KEYS.API_PROVIDER);
    remove(KEYS.API_KEY);
    showApiKeyStatus('Previous provider removed. Please save a Groq API key (starts with gsk_).', 'info');
  }
  loadApiKey();

  const TTS_DEFAULT = 'browser';
  if (!get(KEYS.TTS_DEFAULT_FLAG)) {
    set(KEYS.TTS_MODE, TTS_DEFAULT);
    set(KEYS.TTS_DEFAULT_FLAG, '1');
  } else if (!get(KEYS.TTS_MODE)) {
    set(KEYS.TTS_MODE, TTS_DEFAULT);
  }

  initPrefs();
  refreshVoicePackStatus();

  // The theme toggle lives in Shell.svelte (theme.svelte.js); the deck file
  // input in Decks.svelte (deckImport.svelte.js). btn-start-practice is wired
  // inside Dashboard.svelte (onclick={startPractice}, kept synchronous for the
  // mobile audio unlock); the practice screen's own controls inside
  // Practice.svelte.

  // The AI Study Assistant and Speak-in-Japanese panels are Svelte components
  // (StudyAssistant.svelte, TranslateTool.svelte).

  // Initialize avatar on startup
  initAvatar();

  // ── Cloud sync (accounts) ──
  // Install the settings-change hook (no-ops until signed in).
  registerSettingsSync();

  // A login pull rewrote localStorage settings — refresh the controls, avatar,
  // and theme (the synced choice may differ from this device's).
  // (prefs.svelte.js re-reads the preference controls on the same event.)
  window.addEventListener('settings-synced', () => {
    loadApiKey(); // a synced BYO key may differ from this device's
    updateQuotaDisplay();
    initAvatar();
    applyTheme();
    refreshVoicePackStatus(); // synced TTS mode / speaker may differ
  });

  // A fresh deck was imported from a file — its questions aren't cached yet.
  window.addEventListener('deck-imported', () => {
    warmVoicesIfNeeded();
    refreshVoicePackStatus();
  });

  // The deck list was merged with the cloud on login — adopt it and reload
  // whichever deck is active (its qa may have changed on another device).
  window.addEventListener('deck-list-synced', (/** @type {CustomEvent} */ e) => {
    const list = e.detail?.list;
    if (!Array.isArray(list)) return;
    adoptSyncedDecks(list);
    loadActiveDeckIntoSession();
    warmVoicesIfNeeded();
    refreshVoicePackStatus();
  });

  // Restore session, react to auth changes, and run the login sync once.
  let lastUserId = null;
  const handleUser = (user) => {
    updateQuotaDisplay();
    const uid = user?.id ?? null;
    if (uid && uid !== lastUserId) {
      // Transitioned into a signed-in state → pull settings + decks, and show
      // the cross-device practice history on the dashboard.
      onLogin(decks.list);
      syncFromRemote();
    } else if (!uid && lastUserId) {
      // Signed out — fall back to this device's own history.
      resetToLocal();
    }
    lastUserId = uid;
  };

  onAuthChange(handleUser);
  initAuth().then(handleUser);

  // Boot is done (deck loaded, settings applied) — components that mounted
  // before this ran (e.g. the onboarding sheet) refresh their view of it.
  window.dispatchEvent(new CustomEvent('app-ready'));
}
