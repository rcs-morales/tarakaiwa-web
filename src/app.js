import { DEFAULT_QA } from './data.js';
import {
  updateQACount, updateStartButton, updateSetupAccess, showApiKeyStatus, toggleKeyVisibility,
  showStartScreen
} from './ui.js';
import {
  getGradingModel, saveGradingModel, updateAIStatusChip,
  saveApiKeyFromInput, clearApiKey, hasGroqApiKey, getGroqApiKey,
  testApiConnection
} from './ai/index.js';
import { bugReporter } from './bugReporter.js';
import { initAvatar, getAvatarModelName, saveAvatarModel } from './avatar.js';
import { saveVoicevoxSpeaker, toggleTTSVoicePanels } from './tts.js';
import { abortRecognition, releaseMic } from './stt.js';
import { get, set, remove, KEYS } from './settings.js';
import {
  startPractice, toggleQuestionText, translateQuestion,
  finishRecording, checkAnswer, rerecordAnswer, nextQuestion,
  skipQuestion, endSession, setQA, QA
} from './session.js';
import {
  handleAssistantQuery, initAiPanelInteractivity, initAssistantFloatButton,
  assistantHistory
} from './assistant-ui.js';
import { initTranslateTool } from './translate-ui.js';
import { handleFileImport, clearDatabase } from './import.js';
import { clearAudioCache } from './db.js';

// ─────────────────────────────────────────────
// SETUP FLOW
// ─────────────────────────────────────────────

function refreshSetupAccess() {
  updateSetupAccess(get(KEYS.SETUP_COMPLETE) === '1');
}

function startSetupFlow(stepId = 'import-section') {
  document.getElementById('setup-entry-point')?.classList.add('hidden');
  document.getElementById('setup-return-point')?.classList.add('hidden');
  const section = document.getElementById('ai-settings-section');
  if (section) section.dataset.mode = 'wizard';
  nextSetupStep(stepId);
}

function reopenSetupFlow() {
  document.getElementById('setup-entry-point')?.classList.add('hidden');
  document.getElementById('setup-return-point')?.classList.add('hidden');
  const section = document.getElementById('ai-settings-section');
  if (section) section.dataset.mode = 'edit';
  nextSetupStep('settings-menu-section');
}

function nextSetupStep(stepId) {
  // 1. Hide ALL wizard step panels
  const stepsToHide = ['import-section', 'setup-step-api-key', 'setup-step-settings', 'settings-menu-section'];
  stepsToHide.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  // 2. Show the wrapper
  const section = document.getElementById('ai-settings-section');
  if (section) section.classList.remove('hidden');

  // 3. Show the target step
  const target = document.getElementById(stepId);
  if (target) target.classList.remove('hidden');
}

function finishSetup() {
  set(KEYS.SETUP_COMPLETE, '1');
  // Hide the entire wizard wrapper
  document.getElementById('ai-settings-section')?.classList.add('hidden');
  // Hide all step panels
  ['import-section', 'setup-step-api-key', 'setup-step-settings', 'settings-menu-section'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
  // Return to landing view
  document.getElementById('setup-entry-point')?.classList.add('hidden');
  document.getElementById('setup-return-point')?.classList.remove('hidden');
  refreshSetupAccess();
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
  updateQACount(QA.length);
  updateStartButton(QA.length);

  // Reset wizard state — hide settings panels, show landing view
  document.getElementById('ai-settings-section')?.classList.add('hidden');
  ['import-section', 'setup-step-api-key', 'setup-step-settings', 'settings-menu-section'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
  refreshSetupAccess();
}

// ─────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
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
    setQA(DEFAULT_QA.slice(0, 10));
  }
  updateQACount(QA.length);
  updateStartButton(QA.length);
  refreshSetupAccess();

  const savedProvider = get(KEYS.API_PROVIDER);
  if (savedProvider && savedProvider !== 'groq') {
    remove(KEYS.API_PROVIDER);
    remove(KEYS.API_KEY);
    showApiKeyStatus('Previous provider removed. Please save a Groq API key (starts with gsk_).', 'info');
  }

  const savedKey = getGroqApiKey();
  if (savedKey) {
    const input = document.getElementById('api-key-input');
    if (input) input.value = savedKey;
    updateAIStatusChip();
  }

  const gradingModelSelect = document.getElementById('grading-model-select');
  if (gradingModelSelect) gradingModelSelect.value = getGradingModel();

  const sttSelect = document.getElementById('stt-mode-select');
  if (sttSelect) sttSelect.value = get(KEYS.STT_MODE);

  const jlptSelect = document.getElementById('jlpt-level-select');
  if (jlptSelect) jlptSelect.value = get(KEYS.JLPT_LEVEL);

  const avatarModelSelect = document.getElementById('avatar-model-select');
  if (avatarModelSelect) avatarModelSelect.value = getAvatarModelName();

  const TTS_DEFAULT = 'browser';
  if (!get(KEYS.TTS_DEFAULT_FLAG)) {
    set(KEYS.TTS_MODE, TTS_DEFAULT);
    set(KEYS.TTS_DEFAULT_FLAG, '1');
  } else if (!get(KEYS.TTS_MODE)) {
    set(KEYS.TTS_MODE, TTS_DEFAULT);
  }

  const ttsSelect = document.getElementById('tts-mode-select');
  if (ttsSelect) {
    ttsSelect.value = get(KEYS.TTS_MODE);
    toggleTTSVoicePanels(get(KEYS.TTS_MODE));
  }

  const vvSpeakerSelect = document.getElementById('voicevox-speaker-select');
  if (vvSpeakerSelect) vvSpeakerSelect.value = get(KEYS.VOICEVOX_SPEAKER);

  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  };

  bind('btn-setup-env', () => startSetupFlow());
  bind('btn-reopen-setup', reopenSetupFlow);
  bind('btn-restart-app', restartApp);
  bind('btn-end-session', endSession);
  bind('btn-choose-file', () => document.getElementById('file-input')?.click());
  bind('btn-clear-db', clearDatabase);
  bind('btn-save-api', () => {
    saveApiKeyFromInput();
    refreshSetupAccess();
  });
  bind('btn-test-api', testApiConnection);
  bind('btn-clear-api', () => {
    clearApiKey();
    refreshSetupAccess();
  });
  bind('btn-toggle-key', toggleKeyVisibility);
  bind('btn-finish-setup', finishSetup);
  bind('btn-start-practice', startPractice);
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
    alert('Voicevox audio cache cleared successfully.');
  });
  bind('btn-close-final-overlay', () => {
    document.getElementById('final-score-overlay').style.display = 'none';
  });

  document.querySelectorAll('.btn-report-bug').forEach(btn => {
    btn.addEventListener('click', () => bugReporter.open());
  });

  document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-setup-next-import') {
      nextSetupStep('setup-step-api-key');
    } else if (e.target.id === 'btn-next-to-preferences') {
      nextSetupStep('setup-step-settings');
    } else if (e.target.id === 'btn-menu-step1') {
      nextSetupStep('import-section');
    } else if (e.target.id === 'btn-menu-step2') {
      nextSetupStep('setup-step-api-key');
    } else if (e.target.id === 'btn-menu-step3') {
      nextSetupStep('setup-step-settings');
    } else if (e.target.closest('.btn-back-to-menu')) {
      nextSetupStep('settings-menu-section');
    } else if (e.target.id === 'btn-close-settings-menu') {
      finishSetup();
    }
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
});
