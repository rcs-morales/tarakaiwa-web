// Groq API key (Settings → AI Answer Grading): the saved key, the input's
// text, the status line, and the save / test / clear flows. The key itself
// is stored by settings.js (and read by ai/groqClient.js for requests).

import { get, set, remove, KEYS } from './settings.js';
import { getGradingModel } from './ai/groqClient.js';
import { updateQuotaDisplay } from './quota.svelte.js';
import { errorMessage } from './errors.js';

/** @typedef {'' | 'info' | 'success' | 'error'} StatusType */

export const apiKey = $state({
  /** The stored key ('' when none) — what requests use. */
  saved: '',
  /** What's typed in the Settings input. */
  input: '',
  /** @type {{ message: string, type: StatusType }} */
  status: { message: '', type: '' },
});

const STATUS_HIDE_MS = 5000;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let statusTimer;

/**
 * Show a status line under the key input. Success and error messages hide
 * after 5s; info messages stay until replaced.
 * @param {string} message
 * @param {StatusType} type
 */
export function showApiKeyStatus(message, type) {
  clearTimeout(statusTimer);
  apiKey.status = { message, type };
  if (type !== 'info') {
    // Only this message's timer may hide it — an older one was just cleared.
    statusTimer = setTimeout(() => { apiKey.status = { message: '', type: '' }; }, STATUS_HIDE_MS);
  }
}

/** Load the stored key into state (boot, and after a login sync rewrote it). */
export function loadApiKey() {
  apiKey.saved = get(KEYS.API_KEY) || '';
  apiKey.input = apiKey.saved;
}

/** Strip whitespace and other non-printable characters pasted with the key. */
function cleanInput() {
  apiKey.input = apiKey.input.replace(/[^\x21-\x7E]/g, '');
  return apiKey.input;
}

/** Save the key typed in the input. */
export function saveApiKey() {
  const key = cleanInput();
  if (!key) {
    showApiKeyStatus('❌ Please enter an API key.', 'error');
    return;
  }
  if (!key.startsWith('gsk_')) {
    showApiKeyStatus('❌ This app uses Groq only. Keys start with gsk_ — get one at console.groq.com.', 'error');
    return;
  }
  set(KEYS.API_KEY, key);
  set(KEYS.API_PROVIDER, 'groq');
  apiKey.saved = key;
  showApiKeyStatus('✅ Groq API key saved!', 'success');
  updateQuotaDisplay(); // the shared quota no longer applies
}

/** Remove the stored key. */
export function clearApiKey() {
  remove(KEYS.API_KEY);
  remove(KEYS.API_PROVIDER);
  apiKey.saved = '';
  apiKey.input = '';
  showApiKeyStatus('🗑 API key cleared. Grading will use local fallback.', 'info');
  updateQuotaDisplay(); // signed-in users fall back to the shared quota
}

/** Check the key typed in the input with a tiny request to Groq. */
export async function testApiKey() {
  const key = cleanInput();
  if (!key) {
    showApiKeyStatus('❌ Please enter an API key first.', 'error');
    return;
  }
  if (!key.startsWith('gsk_')) {
    showApiKeyStatus('❌ Groq keys start with gsk_. Get one at console.groq.com.', 'error');
    return;
  }
  showApiKeyStatus('🔄 Testing connection…', 'info');
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: getGradingModel(),
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      }),
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error('API_KEY_INVALID');
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    const text = data.choices[0].message.content || '';
    if (text.toLowerCase().includes('ok')) {
      showApiKeyStatus('✅ Connection successful! Groq is ready.', 'success');
    } else {
      showApiKeyStatus('✅ Connected, got response: ' + text.substring(0, 50), 'success');
    }
  } catch (e) {
    const msg = errorMessage(e);
    if (msg.includes('API_KEY_INVALID') || msg.includes('401')) {
      showApiKeyStatus('❌ Invalid API key. Please check your key.', 'error');
    } else if (msg.includes('429')) {
      showApiKeyStatus('⚠️ Rate limited — hit the free tier limit. Try again shortly.', 'error');
    } else {
      showApiKeyStatus('❌ Connection failed: ' + msg.substring(0, 80), 'error');
    }
  }
}
