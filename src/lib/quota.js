// Quota indicator — shows the user's daily shared quota usage when signed in
// without a BYO key. Fetches current usage from the RPC (read-only, allowed
// for authenticated users).

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

/** Paint one usage bar (fill width + count + color state) by key. */
function updateQuotaMeter(key, used, limit, unit) {
  const fill = document.getElementById(`quota-${key}-fill`);
  const count = document.getElementById(`quota-${key}-count`);
  const pct = Math.min(100, Math.round((used / limit) * 100));
  if (fill) {
    fill.style.width = `${pct}%`;
    // green normally, amber past 80%, red when spent
    fill.style.background = pct >= 100 ? 'var(--wrong)'
      : pct > 80 ? 'var(--warn)'
      : 'var(--success)';
  }
  if (count) count.textContent = `${used}${unit} / ${limit}${unit}`;
}

/**
 * Refresh both quota indicators from a single usage fetch: the compact text
 * chip in the account menu and the usage bars in Settings. Both are hidden
 * when the shared quota doesn't apply (signed out, or a BYO key is saved).
 */
export async function updateQuotaDisplay() {
  const quotaChip = document.getElementById('quota-chip');
  const quotaText = document.getElementById('quota-text');
  const quotaPanel = document.getElementById('quota-panel');

  const usage = await fetchQuotaUsage();

  // Compact chip in the 👤 account menu
  if (quotaChip && quotaText) {
    if (!usage) {
      quotaChip.classList.add('hidden');
    } else {
      quotaChip.classList.remove('hidden');
      quotaText.textContent = formatQuotaDisplay(usage);
      quotaChip.style.color = isQuotaLow(usage) ? 'var(--warn)' : 'var(--muted)';
    }
  }

  // Usage bars in Settings → AI grading
  if (quotaPanel) {
    if (!usage) {
      quotaPanel.classList.add('hidden');
    } else {
      quotaPanel.classList.remove('hidden');
      updateQuotaMeter('chat', usage.chatRequests, CHAT_DAILY_LIMIT, '');
      updateQuotaMeter('whisper', Math.ceil(usage.whisperSeconds), WHISPER_DAILY_LIMIT, 's');
    }
  }
}
