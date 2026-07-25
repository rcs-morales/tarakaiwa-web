// ─────────────────────────────────────────────
// WHISPER SPEECH-TO-TEXT TRANSCRIPTION
// ─────────────────────────────────────────────

import { resolveAIRoute } from './groqClient.js';

// Set by transcribeWithWhisper on failure/empty-result so the UI can show a
// specific reason instead of one generic "transcription failed" message —
// mirrors grading.js's lastGradingErrorReason pattern.
let lastWhisperErrorReason = null;
export function getLastWhisperErrorReason() {
  return lastWhisperErrorReason;
}

/**
 * Transcribe an audio blob using Groq's Whisper endpoint.
 * @param {Blob} audioBlob - recorded audio
 * @param {string} expectedAnswer - optional prompt hint for Whisper
 * @returns {Promise<string|null>} transcribed text or null on failure
 */
/**
 * Transcribe speech for study tools (auto-detect language).
 * @param {Blob} audioBlob
 * @returns {Promise<string|null>}
 */
export async function transcribeForTool(audioBlob) {
  const route = await resolveAIRoute();
  if (!route) return null;
  if (!audioBlob || audioBlob.size === 0) return null;

  const formData = new FormData();
  const fileName = (audioBlob.type || 'audio/webm').includes('mp4') ? 'audio.mp4' : 'audio.webm';

  formData.append('file', audioBlob, fileName);
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('temperature', '0');
  formData.append('response_format', 'json');

  try {
    const response = await fetch(route.transcribeUrl, {
      method: 'POST',
      headers: route.headers,
      body: formData
    });

    if (!response.ok) {
      console.error('Whisper tool transcription failed:', response.status);
      return null;
    }

    const data = await response.json();
    return (data.text || '').trim();
  } catch (e) {
    console.error('Tool transcription error:', e);
    return null;
  }
}

export async function transcribeWithWhisper(audioBlob, expectedAnswer = '') {
  lastWhisperErrorReason = null;
  const route = await resolveAIRoute();
  if (!route) {
    lastWhisperErrorReason = 'NO_AI_ACCESS';
    return null;
  }
  if (!audioBlob || audioBlob.size === 0) {
    console.error('Whisper request skipped: empty audio blob — the recording captured no audio data.');
    lastWhisperErrorReason = 'EMPTY_BLOB';
    return null;
  }

  const formData = new FormData();
  const fileName = (audioBlob.type || 'audio/webm').includes('mp4') ? 'audio.mp4' : 'audio.webm';

  formData.append('file', audioBlob, fileName);
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('language', 'ja');
  formData.append('temperature', '0');
  formData.append('response_format', 'json');
  
  const promptText = (expectedAnswer || '').trim();
  if (promptText) {
    formData.append('prompt', promptText.slice(0, 120));
  }

  try {
    const response = await fetch(route.transcribeUrl, {
      method: 'POST',
      headers: route.headers,
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Whisper API failed:', response.status, errText);
      lastWhisperErrorReason = response.status === 429 ? 'RATE_LIMIT' : 'API_ERROR_' + response.status;
      return null;
    }

    const data = await response.json();
    const text = data.text || '';
    if (!text.trim()) {
      // Request succeeded — Whisper just didn't hear anything transcribable
      // (silence, mic captured no speech, or audio too quiet/garbled).
      console.warn('Whisper returned an empty transcript for a', audioBlob.size, 'byte', audioBlob.type, 'clip.');
      lastWhisperErrorReason = 'EMPTY_TRANSCRIPT';
    }
    return text;
  } catch (e) {
    console.error('Transcription error:', e);
    lastWhisperErrorReason = 'NETWORK_ERROR';
    return null;
  }
}
