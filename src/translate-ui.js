import { translateToJapaneseWithAI, hasGroqApiKey, transcribeForTool } from './ai/index.js';
import { speakQuestion, cancelSpeech } from './tts.js';
import { makeDraggable } from './assistant-ui.js';
import { toFuriganaHtml } from './parser.js';
import { get, set, KEYS } from './settings.js';

async function requestTranslateMicAccess() {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    setTranslateStatus('Microphone access is not available in this browser.', 'error');
    return false;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    if (translateMicStream) {
      translateMicStream.getTracks().forEach(track => track.stop());
    }
    translateMicStream = stream;
    return true;
  } catch (_) {
    setTranslateStatus('Microphone permission denied. Please allow access and try again.', 'error');
    return false;
  }
}

let lastJapanese = '';
let translateRecog = null;
let translateRecording = false;
let translateMediaRecorder = null;
let translateAudioChunks = [];
let translateMicStream = null;

function getApiErrorMessage(error) {
  if (error === 'MISSING_KEY') return '❌ No API key found. Add one in Settings.';
  if (error === 'INVALID_KEY') return '❌ Invalid API key. Check your key in Settings.';
  if (error === 'RATE_LIMIT') return '⚠️ Rate limit exceeded. Wait a moment and try again.';
  if (error === 'NETWORK_ERROR') return '🌐 Network error. Check your connection.';
  if (error === 'EMPTY_RESPONSE') return '❌ Translation returned empty. Try rephrasing.';
  return `❌ Error (${error || 'Unknown'}). Please try again.`;
}

function setTranslateStatus(message, type = '') {
  const status = document.getElementById('translate-status');
  if (!status) return;
  status.textContent = message;
  status.className = 'translate-status' + (type ? ` ${type}` : '');
}

function showTranslateResult(result) {
  const area = document.getElementById('translate-result-area');
  const text = document.getElementById('translate-result-text');
  if (!area || !text) return;

  const { japanese, romaji } = result;
  text.innerHTML = `
    <div class="jp-text">${toFuriganaHtml(japanese, romaji)}</div>
    <div class="romaji-text" style="font-size: 0.9em; color: var(--muted); margin-top: 4px;">${romaji}</div>
  `;
  area.classList.remove('hidden');
}

function setMicRecording(active) {
  translateRecording = active;
  const micBtn = document.getElementById('btn-translate-mic');
  if (micBtn) {
    micBtn.classList.toggle('recording', active);
    micBtn.title = active ? 'Stop recording' : 'Speak your phrase';
  }
}

function stopBrowserTranslateRecog() {
  if (!translateRecog) return;
  try { translateRecog.stop(); } catch (_) { }
  translateRecog = null;
}

async function releaseTranslateMic() {
  if (translateMediaRecorder && translateMediaRecorder.state !== 'inactive') {
    try { translateMediaRecorder.stop(); } catch (_) { }
  }
  translateMediaRecorder = null;
  translateAudioChunks = [];
  if (translateMicStream) {
    translateMicStream.getTracks().forEach(track => track.stop());
    translateMicStream = null;
  }
}

async function startBrowserTranslateListening() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return false;

  const input = document.getElementById('translate-input');
  const micReady = await requestTranslateMicAccess();
  if (!micReady) return false;
  stopBrowserTranslateRecog();
  translateRecog = new SpeechRecognition();
  translateRecog.lang = 'en-US';
  translateRecog.continuous = true;
  translateRecog.interimResults = true;

  translateRecog.onstart = () => {
    setMicRecording(true);
    setTranslateStatus('🎤 Listening… speak your phrase, then tap the mic again to stop.', 'info');
  };

  translateRecog.onresult = (e) => {
    let transcript = '';
    for (let i = 0; i < e.results.length; i++) {
      transcript += e.results[i][0].transcript;
    }
    if (input) input.value = transcript.trim();
  };

  translateRecog.onerror = (e) => {
    if (e.error === 'no-speech') {
      setTranslateStatus('No speech detected. Try again.', 'error');
      return;
    }
    if (e.error === 'aborted') return;
    setTranslateStatus('Speech recognition error: ' + e.error, 'error');
  };

  translateRecog.onend = () => {
    setMicRecording(false);
    translateRecog = null;
    if (input?.value.trim()) {
      setTranslateStatus('Speech captured. Tap Translate & Speak when ready.', 'success');
    }
  };

  try {
    translateRecog.start();
    return true;
  } catch (_) {
    translateRecog = null;
    return false;
  }
}

async function startWhisperTranslateRecording() {
  if (!hasGroqApiKey()) {
    setTranslateStatus('Speech recognition unavailable. Type your phrase instead.', 'error');
    return;
  }

  const micReady = await requestTranslateMicAccess();
  if (!micReady) {
    return;
  }

  translateAudioChunks = [];
  const preferredMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : '';

  try {
    translateMediaRecorder = preferredMimeType
      ? new MediaRecorder(translateMicStream, { mimeType: preferredMimeType, audioBitsPerSecond: 64000 })
      : new MediaRecorder(translateMicStream);
  } catch (_) {
    await releaseTranslateMic();
    setTranslateStatus('Recording not supported in this browser.', 'error');
    return;
  }

  translateMediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) translateAudioChunks.push(e.data);
  };

  translateMediaRecorder.onstart = () => {
    setMicRecording(true);
    setTranslateStatus('🎤 Recording… tap the mic again when finished.', 'info');
  };

  translateMediaRecorder.start(250);
}

async function stopWhisperTranslateRecording() {
  if (!translateMediaRecorder || translateMediaRecorder.state === 'inactive') {
    await releaseTranslateMic();
    setMicRecording(false);
    return;
  }

  const input = document.getElementById('translate-input');
  const blob = await new Promise((resolve) => {
    translateMediaRecorder.onstop = () => {
      const mimeType = (translateMediaRecorder.mimeType || 'audio/webm').split(';')[0].trim();
      resolve(new Blob(translateAudioChunks, { type: mimeType }));
    };
    try { translateMediaRecorder.stop(); } catch (_) { resolve(null); }
  });

  await releaseTranslateMic();
  setMicRecording(false);

  if (!blob || blob.size === 0) {
    setTranslateStatus('No audio captured. Try again.', 'error');
    return;
  }

  setTranslateStatus('Transcribing speech…', 'info');
  const transcript = await transcribeForTool(blob);
  if (!transcript) {
    setTranslateStatus('Could not transcribe audio. Type your phrase instead.', 'error');
    return;
  }

  if (input) input.value = transcript;
  setTranslateStatus('Speech captured. Tap Translate & Speak when ready.', 'success');
}

export async function toggleTranslateMic() {
  if (translateRecording) {
    if (translateRecog) {
      stopBrowserTranslateRecog();
      setMicRecording(false);
      return;
    }
    await stopWhisperTranslateRecording();
    return;
  }

  const started = await startBrowserTranslateListening();
  if (!started) {
    await startWhisperTranslateRecording();
  }
}

/** strips AI furigana markers {reading} for TTS playback */
function stripFurigana(text) {
  return text.replace(/\{[^\}]*\}/g, '');
}

export async function handleTranslateAndSpeak() {
  const input = document.getElementById('translate-input');
  const speakBtn = document.getElementById('btn-translate-speak');
  const text = input?.value.trim();
  if (!text) {
    setTranslateStatus('Enter or speak a phrase first.', 'error');
    return;
  }

  if (speakBtn) speakBtn.disabled = true;
  cancelSpeech('tool');
  setTranslateStatus('Translating to Japanese…', 'info');

  const sourceLang = get(KEYS.SOURCE_LANGUAGE) || 'English';
  const result = await translateToJapaneseWithAI(text, sourceLang);

  if (!result || !result.japanese) {
    setTranslateStatus(getApiErrorMessage(result?.error), 'error');
    if (speakBtn) speakBtn.disabled = false;
    return;
  }

  lastJapanese = result.japanese;
  showTranslateResult(result);
  setTranslateStatus('Playing Japanese audio…', 'success');

  const ttsText = stripFurigana(lastJapanese);
  await speakQuestion(ttsText, () => {
    setTranslateStatus('Done! Edit the phrase or tap Replay.', 'success');
    if (speakBtn) speakBtn.disabled = false;
  }, 'tool');
}

export async function replayJapaneseAudio() {
  if (!lastJapanese) return;
  cancelSpeech('tool');
  setTranslateStatus('Replaying audio…', 'info');
  const ttsText = stripFurigana(lastJapanese);
  await speakQuestion(ttsText, () => {
    setTranslateStatus('Replay finished.', 'success');
  }, 'tool');
}

function initTranslatePanelInteractivity() {
  const panel = document.getElementById('translate-tool-panel');
  const header = panel?.querySelector('.ai-panel-header');
  const resizer = panel?.querySelector('.ai-panel-resizer');
  if (!panel || !header || !resizer) return;

  makeDraggable(panel, header);

  let isResizing = false;
  let startWidth = 0, startHeight = 0, startX = 0, startY = 0;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    e.preventDefault();
    e.stopPropagation();
    startWidth = panel.offsetWidth;
    startHeight = panel.offsetHeight;
    startX = e.clientX;
    startY = e.clientY;
    panel.style.transition = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const width = startWidth + (e.clientX - startX);
    const height = startHeight + (e.clientY - startY);
    if (width > 280) panel.style.width = width + 'px';
    if (height > 280) panel.style.height = height + 'px';
  });

  window.addEventListener('mouseup', () => {
    if (isResizing) panel.style.transition = '';
    isResizing = false;
  });
}

function toggleTranslatePanel() {
  const btn = document.getElementById('btn-translate-tool');
  const panel = document.getElementById('translate-tool-panel');
  if (!btn || !panel) return;

  if (panel.classList.contains('hidden')) {
    const btnRect = btn.getBoundingClientRect();
    panel.style.transition = 'none';
    panel.style.left = (btnRect.right - (panel.offsetWidth || 360)) + 'px';
    panel.style.top = (btnRect.top - (panel.offsetHeight || 420)) + 'px';
    panel.style.bottom = 'auto';
    panel.style.right = 'auto';
    const panelRect = panel.getBoundingClientRect();
    if (panelRect.left < 0) panel.style.left = '10px';
    if (panelRect.top < 0) panel.style.top = '10px';
    panel.classList.remove('hidden');
    setTimeout(() => { panel.style.transition = ''; }, 10);
  } else {
    panel.classList.add('hidden');
    if (translateRecording) toggleTranslateMic();
    cancelSpeech('tool');
  }
}

/** Wire up the Speak in Japanese study tool. */
export function initTranslateTool() {
  const floatBtn = document.getElementById('btn-translate-tool');
  const closeBtn = document.getElementById('btn-close-translate');
  const micBtn = document.getElementById('btn-translate-mic');
  const speakBtn = document.getElementById('btn-translate-speak');
  const replayBtn = document.getElementById('btn-translate-replay');
  const input = document.getElementById('translate-input');
  const langPicker = document.getElementById('translate-source-lang');

  if (floatBtn) {
    makeDraggable(floatBtn, floatBtn);
    floatBtn.addEventListener('click', toggleTranslatePanel);
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('translate-tool-panel')?.classList.add('hidden');
      if (translateRecording) toggleTranslateMic();
      cancelSpeech('tool');
    });
  }

  if (langPicker) {
    langPicker.value = get(KEYS.SOURCE_LANGUAGE) || 'English';
    langPicker.addEventListener('change', (e) => {
      set(KEYS.SOURCE_LANGUAGE, e.target.value);
    });
  }

  if (micBtn) micBtn.addEventListener('click', () => toggleTranslateMic());
  if (speakBtn) speakBtn.addEventListener('click', () => handleTranslateAndSpeak());
  if (replayBtn) replayBtn.addEventListener('click', () => replayJapaneseAudio());

  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleTranslateAndSpeak();
      }
    });
  }

  initTranslatePanelInteractivity();
}
