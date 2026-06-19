// ─────────────────────────────────────────────
// WHISPER SPEECH-TO-TEXT TRANSCRIPTION
// ─────────────────────────────────────────────

import { getGroqApiKey, hasGroqApiKey } from './groqClient.js';

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
  if (!hasGroqApiKey()) return null;
  if (!audioBlob || audioBlob.size === 0) return null;

  const apiKey = getGroqApiKey();
  const formData = new FormData();
  const fileName = (audioBlob.type || 'audio/webm').includes('mp4') ? 'audio.mp4' : 'audio.webm';

  formData.append('file', audioBlob, fileName);
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('temperature', '0');
  formData.append('response_format', 'json');

  try {
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey },
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
  if (!hasGroqApiKey()) return null;
  if (!audioBlob || audioBlob.size === 0) {
    console.error('Whisper request skipped: empty audio blob');
    return null;
  }

  const apiKey = getGroqApiKey();
  const formData = new FormData();
  const fileName = (audioBlob.type || 'audio/webm').includes('mp4') ? 'audio.mp4' : 'audio.webm';

  formData.append('file', audioBlob, fileName);
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('language', 'en');
  formData.append('temperature', '0');
  formData.append('response_format', 'json');
  
  const promptText = (expectedAnswer || '').trim();
  if (promptText) {
    formData.append('prompt', promptText.slice(0, 120));
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey
      },
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Whisper API failed:', response.status, errText);
      return null;
    }

    const data = await response.json();
    return data.text || '';
  } catch (e) {
    console.error('Transcription error:', e);
    return null;
  }
}
