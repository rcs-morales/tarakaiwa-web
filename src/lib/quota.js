// Quota indicator — shows the user's daily shared quota usage when signed in
// without a BYO key. Fetches current usage from the RPC (read-only, allowed
// for authenticated users).

import { supabaseClient } from './supabase.js';
import { hasAIAccess, hasGroqApiKey } from './ai/index.js';

const CHAT_DAILY_LIMIT = 200;
const WHISPER_DAILY_LIMIT = 600;

/**
 * Fetch the current user's API usage for today. Returns null if not logged in
 * or if they have a BYO key (quota doesn't apply).
 */
export async function fetchQuotaUsage() {
  // Only show quota if signed in AND without a BYO key (using shared quota)
  if (!hasAIAccess() || hasGroqApiKey()) return null;

  try {
    const { data, error } = await supabaseClient.rpc('get_api_usage');
    if (error) {
      console.error('quota fetch failed:', error.message);
      return null;
    }
    if (!Array.isArray(data) || data.length === 0) {
      // First day, no usage yet
      return { chatRequests: 0, whisperSeconds: 0 };
    }
    const row = data[0];
    return {
      chatRequests: row.chat_requests ?? 0,
      whisperSeconds: row.whisper_seconds ?? 0,
    };
  } catch (e) {
    console.error('quota RPC error:', e);
    return null;
  }
}

/**
 * Format quota for display (e.g. "18/200 chat requests remaining").
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
 */
export function isQuotaLow(usage) {
  if (!usage) return false;
  const chatUsagePercent = (usage.chatRequests / CHAT_DAILY_LIMIT) * 100;
  const whisperUsagePercent = (usage.whisperSeconds / WHISPER_DAILY_LIMIT) * 100;
  // Low if either counter is >80% used
  return chatUsagePercent > 80 || whisperUsagePercent > 80;
}

/**
 * Refresh the quota display on the start screen.
 */
export async function updateQuotaDisplay() {
  const quotaChip = document.getElementById('quota-chip');
  const quotaText = document.getElementById('quota-text');
  if (!quotaChip || !quotaText) return;

  const usage = await fetchQuotaUsage();
  if (!usage) {
    quotaChip.classList.add('hidden');
    return;
  }

  quotaChip.classList.remove('hidden');
  quotaText.textContent = formatQuotaDisplay(usage);
  if (isQuotaLow(usage)) {
    quotaChip.style.color = 'var(--warn)';
  } else {
    quotaChip.style.color = 'var(--muted)';
  }
}
