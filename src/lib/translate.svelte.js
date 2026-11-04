// "Speak in Japanese" tool: state + the translate / speak / mic flows.
// Rendered by components/TranslateTool.svelte.

import { translateToJapaneseWithAI, hasAIAccess, transcribeForTool } from './ai/index.js';
import { speakQuestion, cancelSpeech } from './tts.js';
import { get, set, KEYS } from './settings.js';

export const SOURCE_LANGUAGES = ['English', 'Filipino', 'Spanish', 'French', 'Chinese', 'Korean'];

/** @typedef {{ japanese: string, romaji?: string, english?: string }} TranslateResult */
/** @typedef {'' | 'info' | 'success' | 'error'} StatusType */

export const translate = $state({
  open: false,
  input: '',
  sourceLang: 'English',
  /** @type {{ message: string, type: StatusType }} */
  status: { message: '', type: '' },
  /** @type {TranslateResult | null} */
  result: null,
  recording: false,
  /** True from "Translate & Speak" until the audio finishes (disables the button). */
  speaking: false,
});

// Recording handles — not reactive, never rendered.
/** @type {any} */ let recog = null;
/** @type {MediaRecorder | null} */ let mediaRecorder = null;
/** @type {Blob[]} */ let audioChunks = [];
/** @type {MediaStream | null} */ let micStream = null;

/** @param {string} message @param {StatusType} [type] */
function setStatus(message, type = '') {
  translate.status = { message, type };
}

/** Refresh the source language from settings (they may have synced since load). */
export function loadSourceLanguage() {
  translate.sourceLang = get(KEYS.SOURCE_LANGUAGE) || 'English';
}

/** @param {string} lang */
export function setSourceLanguage(lang) {
  translate.sourceLang = lang;
  set(KEYS.SOURCE_LANGUAGE, lang);
}

/** @param {string | undefined} error */
function getApiErrorMessage(error) {
  if (error === 'MISSING_KEY') return '❌ No API key found. Add one in Settings.';
  if (error === 'INVALID_KEY') return '❌ Invalid API key. Check your key in Settings.';
  if (error === 'RATE_LIMIT') return '⚠️ Rate limit exceeded. Wait a moment and try again.';
  if (error === 'NETWORK_ERROR') return '🌐 Network error. Check your connection.';
  if (error === 'EMPTY_RESPONSE') return '❌ Translation returned empty. Try rephrasing.';
  return `❌ Error (${error || 'Unknown'}). Please try again.`;
}

/** Strip the AI furigana markers {reading} before TTS playback. */
function stripFurigana(/** @type {string} */ text) {
  return text.replace(/\{[^}]*\}/g, '');
}

// ── Translate & speak ─────────────────────────────────────────────

export async function translateAndSpeak() {
  const text = translate.input.trim();
  if (!text) {
    setStatus('Enter or speak a phrase first.', 'error');
    return;
  }
  if (translate.speaking) return;

  translate.speaking = true;
  cancelSpeech('tool');
  setStatus('Translating to Japanese…', 'info');

  const result = await translateToJapaneseWithAI(text, translate.sourceLang || 'English');
  if (!result || !result.japanese) {
    setStatus(getApiErrorMessage(result?.error), 'error');
    translate.speaking = false;
    return;
  }

  translate.result = { japanese: result.japanese, romaji: result.romaji || '', english: result.english || '' };
  setStatus('Playing Japanese audio…', 'success');

  await speakQuestion(stripFurigana(result.japanese), () => {
    setStatus('Done! Edit the phrase or tap Replay.', 'success');
    translate.speaking = false;
  }, 'tool');
}

export async function replayJapaneseAudio() {
  const japanese = translate.result?.japanese;
  if (!japanese) return;
  cancelSpeech('tool');
  setStatus('Replaying audio…', 'info');
  await speakQuestion(stripFurigana(japanese), () => {
    setStatus('Replay finished.', 'success');
  }, 'tool');
}

// ── Microphone ────────────────────────────────────────────────────

async function requestMicAccess() {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    setStatus('Microphone access is not available in this browser.', 'error');
    return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    releaseMicStream();
    micStream = stream;
    return true;
  } catch {
    setStatus('Microphone permission denied. Please allow access and try again.', 'error');
    return false;
  }
}

function releaseMicStream() {
  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop());
    micStream = null;
  }
}

function stopBrowserRecognition() {
  if (!recog) return;
  try { recog.stop(); } catch { /* already stopped */ }
  recog = null;
}

function releaseRecorder() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.stop(); } catch { /* already stopped */ }
  }
  mediaRecorder = null;
  audioChunks = [];
  releaseMicStream();
}

async function startBrowserListening() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return false;

  if (!(await requestMicAccess())) return false;
  stopBrowserRecognition();
  const r = new SpeechRecognition();
  recog = r;
  r.lang = 'en-US';
  r.continuous = true;
  r.interimResults = true;

  r.onstart = () => {
    translate.recording = true;
    setStatus('🎤 Listening… speak your phrase, then tap the mic again to stop.', 'info');
  };
  r.onresult = (/** @type {any} */ e) => {
    let transcript = '';
    for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
    translate.input = transcript.trim();
  };
  r.onerror = (/** @type {any} */ e) => {
    if (e.error === 'no-speech') {
      setStatus('No speech detected. Try again.', 'error');
      return;
    }
    if (e.error === 'aborted') return;
    setStatus('Speech recognition error: ' + e.error, 'error');
  };
  r.onend = () => {
    // A late onend from a recognizer we already replaced must not touch the new session.
    if (recog !== r && recog !== null) return;
    recog = null;
    translate.recording = false;
    // Recognition has its own audio capture; drop the permission stream so the
    // browser's mic indicator turns off.
    releaseMicStream();
    if (translate.input.trim()) {
      setStatus('Speech captured. Tap Translate & Speak when ready.', 'success');
    }
  };

  try {
    r.start();
    return true;
  } catch {
    recog = null;
    releaseMicStream();
    return false;
  }
}

async function startWhisperRecording() {
  if (!hasAIAccess()) {
    setStatus('Speech recognition unavailable. Type your phrase instead.', 'error');
    return;
  }
  if (!(await requestMicAccess())) return;

  audioChunks = [];
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
  try {
    mediaRecorder = mimeType
      ? new MediaRecorder(micStream, { mimeType, audioBitsPerSecond: 64000 })
      : new MediaRecorder(micStream);
  } catch {
    releaseRecorder();
    setStatus('Recording not supported in this browser.', 'error');
    return;
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };
  mediaRecorder.onstart = () => {
    translate.recording = true;
    setStatus('🎤 Recording… tap the mic again when finished.', 'info');
  };
  mediaRecorder.start(250);
}

async function stopWhisperRecording() {
  const recorder = mediaRecorder;
  if (!recorder || recorder.state === 'inactive') {
    releaseRecorder();
    translate.recording = false;
    return;
  }

  /** @type {Blob | null} */
  const blob = await new Promise((resolve) => {
    recorder.onstop = () => {
      const type = (recorder.mimeType || 'audio/webm').split(';')[0].trim();
      resolve(new Blob(audioChunks, { type }));
    };
    try { recorder.stop(); } catch { resolve(null); }
  });

  releaseRecorder();
  translate.recording = false;

  if (!blob || blob.size === 0) {
    setStatus('No audio captured. Try again.', 'error');
    return;
  }

  setStatus('Transcribing speech…', 'info');
  const transcript = await transcribeForTool(blob);
  if (!transcript) {
    setStatus('Could not transcribe audio. Type your phrase instead.', 'error');
    return;
  }
  translate.input = transcript;
  setStatus('Speech captured. Tap Translate & Speak when ready.', 'success');
}

/** Mic button: start listening, or stop and use what was heard. */
export async function toggleMic() {
  if (translate.recording) {
    if (recog) {
      stopBrowserRecognition();
      translate.recording = false;
      releaseMicStream();
      return;
    }
    await stopWhisperRecording();
    return;
  }
  if (!(await startBrowserListening())) {
    await startWhisperRecording();
  }
}

/** Close the panel, stopping any recording and audio. */
export function closeTranslateTool() {
  translate.open = false;
  if (translate.recording) toggleMic();
  cancelSpeech('tool');
}
