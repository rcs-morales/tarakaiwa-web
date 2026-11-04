// ─────────────────────────────────────────────
// GROQ API CLIENT & KEY MANAGEMENT
// ─────────────────────────────────────────────

import { GROQ_GRADING_MODELS} from '../data.js';
import { get, KEYS } from '../settings.js';
import { isLoggedIn, getFreshAccessToken } from '../auth.js';

/**
 * Return the stored Groq API key, checking both current and legacy storage keys.
 */
export function getGroqApiKey() {
  return get(KEYS.API_KEY);
}

/** True when a Groq key is present. */
export function hasGroqApiKey() {
  return !!getGroqApiKey();
}

/**
 * True when AI features (grading, Whisper, translation, study assistant) are
 * usable — either via a BYO Groq key, or via the signed-in server-side proxy.
 * This is the gate to use for UI/behavior decisions; hasGroqApiKey() alone is
 * only about whether a BYO key specifically is present.
 */
export function hasAIAccess() {
  return hasGroqApiKey() || isLoggedIn();
}

/**
 * Resolve where AI requests should go and how to authenticate them.
 *   - BYO key present: straight to api.groq.com with the user's own key.
 *   - Otherwise, signed in: through the Cloudflare Pages proxy with the
 *     Supabase JWT (the proxy holds the shared, quota-limited Groq key).
 *   - Neither: null — callers should fall back to local grading / show a
 *     "sign in or add a key" message.
 *
 * Async because the proxy path fetches a guaranteed-fresh Supabase token
 * (an expired cached one would 401 at the proxy).
 * @returns {Promise<{ chatUrl: string, transcribeUrl: string, headers: Record<string,string> } | null>}
 */
export async function resolveAIRoute() {
  const apiKey = getGroqApiKey();
  if (apiKey) {
    return {
      chatUrl: 'https://api.groq.com/openai/v1/chat/completions',
      transcribeUrl: 'https://api.groq.com/openai/v1/audio/transcriptions',
      headers: { 'Authorization': 'Bearer ' + apiKey },
    };
  }

  const token = await getFreshAccessToken();
  if (token) {
    return {
      chatUrl: '/api/chat',
      transcribeUrl: '/api/transcribe',
      headers: { 'Authorization': 'Bearer ' + token },
    };
  }

  return null;
}

/** Return the selected grading model, defaulting to balanced. */
export function getGradingModel() {
  const saved = get(KEYS.GRADING_MODEL);
  if (saved === GROQ_GRADING_MODELS.fast || saved === GROQ_GRADING_MODELS.balanced) {
    return saved;
  }
  return GROQ_GRADING_MODELS.balanced;
}

