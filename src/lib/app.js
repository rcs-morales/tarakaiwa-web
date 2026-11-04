import {
  showApiKeyStatus, toggleKeyVisibility,
  showStartScreen
} from './ui.js';
import {
  updateAIStatusChip,
  saveApiKeyFromInput, clearApiKey, getGroqApiKey,
  testApiConnection
} from './ai/index.js';
import { initAvatar } from './avatar.js';
import { warmVoicesIfNeeded, refreshVoicePackStatus } from './voicePack.svelte.js';
import { abortRecognition, releaseMic } from './stt.js';
import { get, set, remove, KEYS } from './settings.js';
import { initPrefs } from './prefs.svelte.js';
import {
  toggleQuestionText, translateQuestion, getQuestionRomaji,
  finishRecording, checkAnswer, rerecordAnswer, nextQuestion,
  skipQuestion, endSession, session,
  editTranscript, saveEditedTranscript, cancelEditTranscript,
  revealAnswerHint
} from './session.svelte.js';
import { assistantHistory } from './assistant.svelte.js';
import { handleFileImport } from './import.js';
import {
  initAuth, onAuthChange,
  signInWithEmail, signInWithGoogle, signOut
} from './auth.js';
import { registerSettingsSync, onLogin, onLogout } from './sync.js';
import { syncFromRemote, resetToLocal } from './history.svelte.js';
import { decks, loadActiveDeckIntoSession, adoptSyncedDecks } from './decks.svelte.js';
import { updateQuotaDisplay } from './quota.js';
import { initTheme, toggleTheme, applyTheme } from './theme.js';

// The Settings tab's preference controls are bound in Settings.svelte
// (prefs.svelte.js, voicePack.svelte.js); the voice pack warmup and status
// live in voicePack.svelte.js.

function restartApp() {
  abortRecognition();
  releaseMic();
  assistantHistory.splice(0, assistantHistory.length);
  showStartScreen();
  updateQuotaDisplay();
}

// Reflect the stored API key into the Settings input. Safe to call
// repeatedly — used on boot and after a login pull ('settings-synced').
// (The other Settings controls follow prefs.svelte.js reactively.)
function applySettingsToUI() {
  const savedKey = getGroqApiKey();
  const input = /** @type {HTMLInputElement} */ (document.getElementById('api-key-input'));
  if (input) input.value = savedKey || '';
  updateAIStatusChip();
}

// ─────────────────────────────────────────────
// ACCOUNT / AUTH UI
// ─────────────────────────────────────────────

function setAccountStatus(msg, type = 'info') {
  const el = document.getElementById('account-status-msg');
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'import-status' + (type ? ' ' + type : '');
}

function updateAccountUI(user) {
  const signedOut = document.getElementById('account-signed-out');
  const signedIn = document.getElementById('account-signed-in');
  const emailDisplay = document.getElementById('account-email-display');
  const barStatus = document.getElementById('account-bar-status');

  if (user) {
    signedOut?.classList.add('hidden');
    signedIn?.classList.remove('hidden');
    if (emailDisplay) emailDisplay.textContent = user.email || 'your account';
    if (barStatus) barStatus.textContent = '🔒 Synced as ' + (user.email || 'your account');
  } else {
    signedOut?.classList.remove('hidden');
    signedIn?.classList.add('hidden');
    if (barStatus) barStatus.textContent = '🔓 Not signed in — practice saves to this device only';
  }
}

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

  const TTS_DEFAULT = 'browser';
  if (!get(KEYS.TTS_DEFAULT_FLAG)) {
    set(KEYS.TTS_MODE, TTS_DEFAULT);
    set(KEYS.TTS_DEFAULT_FLAG, '1');
  } else if (!get(KEYS.TTS_MODE)) {
    set(KEYS.TTS_MODE, TTS_DEFAULT);
  }

  applySettingsToUI();
  initPrefs();
  refreshVoicePackStatus();

  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  };

  bind('btn-theme-toggle', toggleTheme);
  bind('btn-restart-app', restartApp);
  bind('btn-end-session', endSession);
  bind('btn-save-api', saveApiKeyFromInput);
  bind('btn-test-api', testApiConnection);
  bind('btn-clear-api', clearApiKey);
  bind('btn-toggle-key', toggleKeyVisibility);
  // btn-start-practice is wired inside Dashboard.svelte (onclick={startPractice},
  // kept synchronous for the mobile audio unlock).
  bind('btn-toggle-question', toggleQuestionText);
  bind('btn-translate', translateQuestion);
  bind('btn-romaji', getQuestionRomaji);
  bind('btn-hint-prompt', revealAnswerHint);
  bind('btn-submit', finishRecording);
  bind('btn-check', checkAnswer);
  bind('btn-edit-transcript', editTranscript);
  bind('btn-save-edit', saveEditedTranscript);
  bind('btn-cancel-edit', cancelEditTranscript);
  bind('btn-rerecord', rerecordAnswer);
  bind('btn-next', nextQuestion);
  bind('btn-skip', skipQuestion);

  // ── Account / auth ──
  // (the account menu's "Account & sync settings" button is wired inside
  // Shell.svelte — it just switches to the Settings tab)
  bind('btn-send-magic-link', async () => {
    const email = /** @type {HTMLInputElement} */ (document.getElementById('account-email-input'))?.value.trim();
    if (!email) { setAccountStatus('Please enter your email address.', 'error'); return; }
    setAccountStatus('Sending magic link…', 'info');
    const { error } = await signInWithEmail(email);
    if (error) setAccountStatus('❌ ' + error.message, 'error');
    else setAccountStatus('✅ Check your inbox for the sign-in link.', 'success');
  });
  bind('btn-google-signin', async () => {
    const { error } = await signInWithGoogle();
    if (error) setAccountStatus('❌ ' + error.message, 'error');
  });
  bind('btn-sign-out', async () => {
    await signOut();
    onLogout();
    setAccountStatus('Signed out.', 'info');
  });

  // Magic-link form: Enter should send the link, not reload the page.
  document.getElementById('magic-link-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    document.getElementById('btn-send-magic-link')?.click();
  });

  const fileInput = document.getElementById('file-input');
  if (fileInput) fileInput.addEventListener('change', handleFileImport);

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
    applySettingsToUI();
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
    updateAccountUI(user);
    updateAIStatusChip();
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
