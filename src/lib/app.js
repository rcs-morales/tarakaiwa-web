import { DEFAULT_QA } from './data.js';
import {
  showApiKeyStatus, toggleKeyVisibility,
  showStartScreen
} from './ui.js';
import {
  getGradingModel, saveGradingModel, updateAIStatusChip,
  saveApiKeyFromInput, clearApiKey, getGroqApiKey,
  testApiConnection
} from './ai/index.js';
import { bugReporter } from './bugReporter.js';
import { initAvatar, getAvatarModelName, saveAvatarModel } from './avatar.js';
import {
  saveVoicevoxSpeaker, toggleTTSVoicePanels,
  startVoicevoxWarmup, cancelVoicevoxWarmup, getVoicePackStatus,
  preloadAllVoicevoxAudio, VOICEVOX_STOCK_PHRASES
} from './tts.js';
import { abortRecognition, releaseMic } from './stt.js';
import { get, set, remove, KEYS } from './settings.js';
import {
  toggleQuestionText, translateQuestion,
  finishRecording, checkAnswer, rerecordAnswer, nextQuestion,
  skipQuestion, endSession, setQA, session
} from './session.svelte.js';
import {
  handleAssistantQuery, initAiPanelInteractivity, initAssistantFloatButton,
  assistantHistory
} from './assistant-ui.js';
import { initTranslateTool } from './translate-ui.js';
import { handleFileImport, clearDatabase } from './import.js';
import { clearAudioCache } from './db.js';
import {
  initAuth, onAuthChange,
  signInWithEmail, signInWithGoogle, signOut
} from './auth.js';
import { registerSettingsSync, onLogin, onLogout } from './sync.js';
import { syncFromRemote, resetToLocal } from './history.svelte.js';
import { updateQuotaDisplay } from './quota.js';
import { initTheme, toggleTheme, applyTheme } from './theme.js';

// ── Voicevox voice pack ──

/** All phrases a full session can speak: deck questions + stock phrases. */
function voicePackTexts() {
  return [...session.qa.map(q => q.q), ...VOICEVOX_STOCK_PHRASES];
}

/** Kick off a quiet background download of any uncached audio (voicevox only). */
function warmVoicesIfNeeded() {
  if (get(KEYS.TTS_MODE) !== 'voicevox' || session.qa.length === 0) return;
  startVoicevoxWarmup(voicePackTexts());
}

/** Refresh the "Voice pack: N/M cached" indicator in Voice settings. */
async function refreshVoicePackStatus() {
  const el = document.getElementById('voicepack-status');
  if (!el) return;
  const { cached, total } = await getVoicePackStatus(voicePackTexts());
  el.textContent = `${cached}/${total} phrases cached`;
}

async function downloadVoicePack() {
  const btn = document.getElementById('btn-download-voicepack');
  const el = document.getElementById('voicepack-status');
  const progress = document.getElementById('voicepack-progress');
  const fill = document.getElementById('voicepack-progress-fill');
  if (!btn || !el) return;
  // Swap the button out for the progress bar while the download runs.
  btn.classList.add('hidden');
  if (fill) fill.style.width = '0%';
  if (progress) progress.classList.remove('hidden');
  cancelVoicevoxWarmup(); // don't race the background warmup for the same files
  try {
    await preloadAllVoicevoxAudio(
      voicePackTexts(),
      (done, total, msg) => {
        el.textContent = msg || `downloading ${done}/${total}…`;
        if (fill && total) fill.style.width = `${Math.round((done / total) * 100)}%`;
      },
      { cancelled: false }
    );
  } finally {
    if (progress) progress.classList.add('hidden');
    btn.classList.remove('hidden');
    refreshVoicePackStatus();
  }
}

function saveTTSMode() {
  const select = document.getElementById('tts-mode-select');
  if (!select) return;
  const mode = select.value;
  set(KEYS.TTS_MODE, mode);

  if (mode === 'voicevox') {
    set(KEYS.VOICEVOX_SPEAKER, '3');
    const vvSelect = document.getElementById('voicevox-speaker-select');
    if (vvSelect) vvSelect.value = '3';
  }

  toggleTTSVoicePanels(mode);
  initAvatar();
  warmVoicesIfNeeded();
  refreshVoicePackStatus();
}

function saveSTTMode() {
  const select = document.getElementById('stt-mode-select');
  if (select) set(KEYS.STT_MODE, select.value);
}

function saveJLPTLevel() {
  const select = document.getElementById('jlpt-level-select');
  if (select) set(KEYS.JLPT_LEVEL, select.value);
}

function restartApp() {
  abortRecognition();
  releaseMic();
  assistantHistory.splice(0, assistantHistory.length);
  showStartScreen();
  updateQuotaDisplay();
}

// Reflect the current stored settings into the wizard controls. Safe to call
// repeatedly — used on boot and after a login pull ('settings-synced').
function applySettingsToUI() {
  const savedKey = getGroqApiKey();
  const input = document.getElementById('api-key-input');
  if (input) input.value = savedKey || '';
  updateAIStatusChip();

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val != null) el.value = val;
  };

  setVal('grading-model-select', getGradingModel());
  setVal('stt-mode-select', get(KEYS.STT_MODE));
  setVal('jlpt-level-select', get(KEYS.JLPT_LEVEL));
  setVal('avatar-model-select', getAvatarModelName());
  setVal('voicevox-speaker-select', get(KEYS.VOICEVOX_SPEAKER));

  const ttsSelect = document.getElementById('tts-mode-select');
  if (ttsSelect) {
    ttsSelect.value = get(KEYS.TTS_MODE);
    toggleTTSVoicePanels(get(KEYS.TTS_MODE));
  }

  const shuffleBox = document.getElementById('shuffle-questions-checkbox');
  if (shuffleBox) shuffleBox.checked = get(KEYS.SHUFFLE_QUESTIONS) !== '0';

  const speedSlider = document.getElementById('tts-speed-slider');
  if (speedSlider) {
    speedSlider.value = get(KEYS.TTS_SPEED);
    updateTTSSpeedLabel(speedSlider.value);
  }
}

function updateTTSSpeedLabel(value) {
  const label = document.getElementById('tts-speed-value');
  if (label) label.textContent = `${parseFloat(value)}×`;
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

  const savedQA = get(KEYS.QA_DATA);
  if (savedQA) {
    try {
      const parsed = JSON.parse(savedQA);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setQA(parsed);
      }
    } catch (e) {
      console.error('Error loading saved QA data:', e);
    }
  } else {
    setQA(DEFAULT_QA.slice(0, 10), { isDefault: true });
  }

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
  refreshVoicePackStatus();

  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  };

  bind('btn-theme-toggle', toggleTheme);
  bind('btn-restart-app', restartApp);
  bind('btn-end-session', endSession);
  bind('btn-choose-file', () => document.getElementById('file-input')?.click());
  bind('btn-clear-db', clearDatabase);
  bind('btn-save-api', saveApiKeyFromInput);
  bind('btn-test-api', testApiConnection);
  bind('btn-clear-api', clearApiKey);
  bind('btn-toggle-key', toggleKeyVisibility);
  // btn-start-practice is wired inside Dashboard.svelte (onclick={startPractice},
  // kept synchronous for the mobile audio unlock).
  bind('btn-toggle-question', toggleQuestionText);
  bind('btn-translate', translateQuestion);
  bind('btn-submit', finishRecording);
  bind('btn-check', checkAnswer);
  bind('btn-rerecord', rerecordAnswer);
  bind('btn-next', nextQuestion);
  bind('btn-skip', skipQuestion);
  bind('bug-close-btn', () => bugReporter.close());
  bind('bug-submit-btn', () => bugReporter.submit());
  bind('btn-clear-audio-cache', async () => {
    await clearAudioCache();
    refreshVoicePackStatus();
    alert('Voicevox audio cache cleared successfully.');
  });
  bind('btn-download-voicepack', downloadVoicePack);
  bind('btn-close-final-overlay', () => {
    document.getElementById('final-score-overlay').style.display = 'none';
  });

  // ── Account / auth ──
  // (the account menu's "Account & sync settings" button is wired inside
  // Shell.svelte — it just switches to the Settings tab)
  bind('btn-send-magic-link', async () => {
    const email = document.getElementById('account-email-input')?.value.trim();
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

  document.querySelectorAll('.btn-report-bug').forEach(btn => {
    btn.addEventListener('click', () => bugReporter.open());
  });

  // Magic-link form: Enter should send the link, not reload the page.
  document.getElementById('magic-link-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    document.getElementById('btn-send-magic-link')?.click();
  });

  const fileInput = document.getElementById('file-input');
  if (fileInput) fileInput.addEventListener('change', handleFileImport);

  const bindChange = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', fn);
  };

  bindChange('grading-model-select', saveGradingModel);
  bindChange('stt-mode-select', saveSTTMode);
  bindChange('tts-mode-select', saveTTSMode);
  bindChange('jlpt-level-select', saveJLPTLevel);
  bindChange('voicevox-speaker-select', () => {
    saveVoicevoxSpeaker();
    initAvatar();
    // The audio cache is keyed by speaker, so a new voice starts cold.
    warmVoicesIfNeeded();
    refreshVoicePackStatus();
  });
  bindChange('shuffle-questions-checkbox', (e) => {
    set(KEYS.SHUFFLE_QUESTIONS, e.target.checked ? '1' : '0');
  });
  // 'input' (not 'change') so the label and saved value track the drag live;
  // the settings sync push is debounced, so this doesn't spam the network.
  document.getElementById('tts-speed-slider')?.addEventListener('input', (e) => {
    set(KEYS.TTS_SPEED, e.target.value);
    updateTTSSpeedLabel(e.target.value);
  });
  bindChange('avatar-model-select', () => {
    saveAvatarModel();
    initAvatar();
  });

  const btnAiAssistant = document.getElementById('btn-ai-assistant');
  const aiPanel = document.getElementById('ai-assistant-panel');
  const btnCloseAi = document.getElementById('btn-close-ai');
  const btnAiSend = document.getElementById('btn-ai-send');
  const aiChatInput = document.getElementById('ai-chat-input');

  if (btnAiAssistant && aiPanel) {
    btnAiAssistant.addEventListener('click', () => {
      if (aiPanel.classList.contains('hidden')) {
        const btnRect = btnAiAssistant.getBoundingClientRect();
        aiPanel.style.transition = 'none';
        aiPanel.style.left = (btnRect.right - (aiPanel.offsetWidth || 360)) + 'px';
        aiPanel.style.top = (btnRect.top - (aiPanel.offsetHeight || 500)) + 'px';
        aiPanel.style.bottom = 'auto';
        aiPanel.style.right = 'auto';
        const panelRect = aiPanel.getBoundingClientRect();
        if (panelRect.left < 0) aiPanel.style.left = '10px';
        if (panelRect.top < 0) aiPanel.style.top = '10px';
        aiPanel.classList.remove('hidden');
        setTimeout(() => { aiPanel.style.transition = ''; }, 10);
      } else {
        aiPanel.classList.add('hidden');
      }
    });
  }

  if (btnCloseAi && aiPanel) {
    btnCloseAi.addEventListener('click', () => aiPanel.classList.add('hidden'));
  }

  initAiPanelInteractivity();
  initAssistantFloatButton();
  initTranslateTool();

  if (btnAiSend && aiChatInput) {
    btnAiSend.addEventListener('click', () => handleAssistantQuery(aiChatInput.value));
  }

  if (aiChatInput) {
    aiChatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleAssistantQuery(aiChatInput.value);
    });
  }

  // Initialize avatar on startup
  initAvatar();

  // ── Cloud sync (accounts) ──
  // Install the settings-change hook (no-ops until signed in).
  registerSettingsSync();

  // A login pull rewrote localStorage settings — refresh the controls, avatar,
  // and theme (the synced choice may differ from this device's).
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

  // A synced deck arrived from the cloud — load it into the session + storage.
  window.addEventListener('deck-synced', (e) => {
    const qa = e.detail?.qa;
    if (!Array.isArray(qa) || qa.length === 0) return;
    setQA(qa);
    set(KEYS.QA_DATA, JSON.stringify(qa));
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
      const hasLocalCustomDeck = !session.isDefaultDeck && session.qa.length > 0;
      onLogin(hasLocalCustomDeck);
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
