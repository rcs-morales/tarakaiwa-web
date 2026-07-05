// Daily per-user quota enforcement, backed by the increment_api_usage() RPC
// (migration 0002). Called with the SERVICE-ROLE key so it can touch the
// policy-less api_usage table.

export const CHAT_DAILY_LIMIT = 200;      // chat/grading/translate requests per day
export const WHISPER_DAILY_LIMIT = 600;   // whisper-seconds per day

/**
 * Reserve quota for a call, atomically checking + incrementing the daily
 * counters. Fails OPEN on infrastructure errors (e.g. the RPC not yet applied)
 * so the app keeps working — the quota only protects the shared Groq key, it's
 * not a security boundary.
 *
 * @returns {Promise<{ allowed: boolean }>}
 */
export async function reserveQuota(env, userId, { chat = 0, whisperSeconds = 0 } = {}) {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/increment_api_usage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        p_user_id: userId,
        p_chat_delta: chat,
        p_whisper_delta: whisperSeconds,
        p_chat_limit: CHAT_DAILY_LIMIT,
        p_whisper_limit: WHISPER_DAILY_LIMIT,
      }),
    });

    if (!res.ok) {
      console.error('quota RPC failed (allowing request):', res.status, await res.text());
      return { allowed: true };
    }

    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : rows;
    return { allowed: row ? !!row.allowed : true };
  } catch (e) {
    console.error('quota RPC error (allowing request):', e);
    return { allowed: true };
  }
}
