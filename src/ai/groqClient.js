// ─────────────────────────────────────────────
// GROQ API CLIENT & KEY MANAGEMENT
// ─────────────────────────────────────────────

import { GROQ_GRADING_MODELS, DEPRECATED_GROQ_GRADING_MODEL } from '../data.js';
import { showApiKeyStatus } from '../ui.js';
import { get, set, remove, KEYS } from '../settings.js';

/**
 * Return the stored Groq API key, checking both current and legacy storage keys.
 */
export function getGroqApiKey() {
  return get(KEYS.API_KEY) || get(KEYS.LEGACY_API_KEY);
}

/** True when a Groq key is present. */
export function hasGroqApiKey() {
  return !!getGroqApiKey();
}

/** Return the selected grading model, defaulting to balanced. */
export function getGradingModel() {
  const saved = get(KEYS.GRADING_MODEL);
  if (saved === DEPRECATED_GROQ_GRADING_MODEL) {
    return GROQ_GRADING_MODELS.fast;
  }
  if (saved === GROQ_GRADING_MODELS.fast || saved === GROQ_GRADING_MODELS.balanced) {
    return saved;
  }
  return GROQ_GRADING_MODELS.balanced;
}

/** Save the grading model from the settings select. */
export function saveGradingModel() {
  const select = document.getElementById('grading-model-select');
  if (select) set(KEYS.GRADING_MODEL, select.value);
}

/** Update the AI status chip badge in the start screen. */
export function updateAIStatusChip() {
  const apiKey = getGroqApiKey();
  const chip = document.getElementById('ai-status-chip');
  const text = document.getElementById('ai-status-text');

  if (!chip || !text) return;
  if (apiKey) {
    chip.classList.add('active');
    text.textContent = 'Groq Active';
  } else {
    chip.classList.remove('active');
    text.textContent = 'Not configured';
  }
}

/** Save the Groq API key from the settings input field. */
export function saveApiKeyFromInput() {
  const input = document.getElementById('api-key-input');
  let key = input ? input.value : '';
  key = key.replace(/[^\x21-\x7E]/g, '');
  if (input) input.value = key;

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
  updateAIStatusChip();
  showApiKeyStatus('✅ Groq API key saved!', 'success');
}

/** Clear the stored API key. */
export function clearApiKey() {
  remove(KEYS.API_KEY);
  remove(KEYS.LEGACY_API_KEY);
  remove(KEYS.API_PROVIDER);
  const input = document.getElementById('api-key-input');
  if (input) input.value = '';
  updateAIStatusChip();
  showApiKeyStatus('🗑 API key cleared. Grading will use local fallback.', 'info');
}

/** Test the API connection using the key in the input field. */
export async function testApiConnection() {
  const input = document.getElementById('api-key-input');
  let key = input ? input.value : '';
  key = key.replace(/[^\x21-\x7E]/g, '');
  if (input) input.value = key;

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
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: getGradingModel(),
        messages: [{role: 'user', content: 'Reply with exactly: OK'}]
      })
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
    const msg = e.message || String(e);
    if (msg.includes('API_KEY_INVALID') || msg.includes('401')) {
      showApiKeyStatus('❌ Invalid API key. Please check your key.', 'error');
    } else if (msg.includes('429')) {
      showApiKeyStatus('⚠️ Rate limited — hit the free tier limit. Try again shortly.', 'error');
    } else {
      showApiKeyStatus('❌ Connection failed: ' + msg.substring(0, 80), 'error');
    }
  }
}
