// Quota indicator — shows the user's daily shared quota usage when signed in
// without a BYO key. Fetches current usage from the RPC (read-only, allowed
// for authenticated users). Rendered by Shell.svelte (account menu chip) and
// Settings.svelte (usage bars).

import { supabaseClient } from './supabase.js';
import { hasAIAccess, hasGroqApiKey } from './ai/index.js';

export const CHAT_DAILY_LIMIT = 200;
export const WHISPER_DAILY_LIMIT = 600;

/**
 * Fetch the current user's API usage for today. Returns null if not logged in
 * or if they have a BYO key (quota doesn't apply).
 */
export async function fetchQuotaUsage() {
  try {
    // Only show quota if signed in AND without a BYO key (using shared quota)
    if (!hasAIAccess()) {
      console.info('quota: hidden (not signed in)');
      return null;
    }
    if (hasGroqApiKey()) {
      console.info('quota: hidden (BYO key saved — personal Groq allowance applies, not the shared quota)');
      return null;
    }

    const { data, error } = await supabaseClient.rpc('get_api_usage');
    if (error) {
      console.error('quota: get_api_usage RPC failed —', error.message);
      return null;
    }
    if (!Array.isArray(data) || data.length === 0) {
      // First day, no usage yet
      return { chatRequests: 0, whisperSeconds: 0 };
    }
    const row = data[0];
    return {
      chatRequests: Number(row.chat_requests) || 0,
      whisperSeconds: Number(row.whisper_seconds) || 0,
    };
  } catch (e) {
    console.error('quota: fetch error —', e);
    return null;
  }
}

/** @typedef {{ chatRequests: number, whisperSeconds: number }} QuotaUsage  Today's shared-quota use. */

/**
 * Format quota for display (e.g. "18/200 chat requests remaining").
 * @param {QuotaUsage | null} usage
 */
export function formatQuotaDisplay(usage) {
  if (!usage) return '';
  const chatRemaining = Math.max(0, CHAT_DAILY_LIMIT - usage.chatRequests);
  const whisperRemaining = Math.max(0, WHISPER_DAILY_LIMIT - usage.whisperSeconds);
  return `💬 ${chatRemaining}/${CHAT_DAILY_LIMIT} chat • 🎤 ${Math.ceil(whisperRemaining)}s/${WHISPER_DAILY_LIMIT}s`;
}

/**
 * Check if the user is on the shared quota and approaching the limit
 * (useful for warning UI).
 * @param {QuotaUsage | null} usage
 */
export function isQuotaLow(usage) {
  if (!usage) return false;
  const chatUsagePercent = (usage.chatRequests / CHAT_DAILY_LIMIT) * 100;
  const whisperUsagePercent = (usage.whisperSeconds / WHISPER_DAILY_LIMIT) * 100;
  // Low if either counter is >80% used
  return chatUsagePercent > 80 || whisperUsagePercent > 80;
}

export const quota = $state({
  /** @type {{ chatRequests: number, whisperSeconds: number } | null} */
  usage: null,
});

/**
 * Usage bar for one counter: fill width and colour (green normally, amber
 * past 80%, red when spent).
 * @param {number} used
 * @param {number} limit
 */
export function quotaMeter(used, limit) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const color = pct >= 100 ? 'var(--wrong)' : pct > 80 ? 'var(--warn)' : 'var(--success)';
  return { pct, color };
}

let latestRequest = 0;

/**
 * Refresh the shared-quota usage shown in the account menu chip and the
 * Settings usage bars. Both hide when the shared quota doesn't apply
 * (signed out, or a BYO key is saved). Overlapping refreshes (e.g. a sign-out
 * while one is in flight) keep only the latest result.
 */
export async function updateQuotaDisplay() {
  const request = ++latestRequest;
  const usage = await fetchQuotaUsage();
  if (request === latestRequest) quota.usage = usage;
}
