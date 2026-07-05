// POST /api/chat — authenticated passthrough to Groq's chat completions.
// Used by grading.js, studyAssistant.js (assistant + translation) when the user
// is signed in without a BYO key. The request body is the OpenAI-compatible
// chat payload; we validate the model, cap max_tokens, enforce quota, then
// forward with the server-side GROQ_API_KEY and stream the response back.

import { authenticateRequest } from '$lib/server/auth.js';
import { reserveQuota } from '$lib/server/quota.js';
import { json } from '$lib/server/http.js';

const ALLOWED_MODELS = new Set(['openai/gpt-oss-120b', 'openai/gpt-oss-20b']);
const MAX_TOKENS_CAP = 2048;
const MAX_BODY_BYTES = 64 * 1024;

export async function POST({ request, platform }) {
  // Cloudflare env bindings surface via `platform.env` under adapter-cloudflare
  // (absent in plain `vite dev`, where the endpoint returns 500 gracefully).
  const env = platform?.env ?? {};
  if (!env.GROQ_API_KEY) return json({ error: 'Server AI key not configured.' }, 500);

  const auth = await authenticateRequest(request, env);
  if (auth.error) return json({ error: auth.error }, auth.status);

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return json({ error: 'Request too large.' }, 413);

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  if (!ALLOWED_MODELS.has(body.model)) {
    return json({ error: 'Model not allowed.' }, 400);
  }
  body.max_tokens = typeof body.max_tokens === 'number'
    ? Math.min(body.max_tokens, MAX_TOKENS_CAP)
    : MAX_TOKENS_CAP;

  const quota = await reserveQuota(env, auth.user.id, { chat: 1 });
  if (!quota.allowed) {
    return json({ error: 'Shared daily quota reached. Add your own Groq key in settings to continue.' }, 429);
  }

  let groqRes;
  try {
    groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return json({ error: 'Upstream request failed.' }, 502);
  }

  // Pass through Groq's status + body verbatim so the client's existing
  // json_object-fallback and error handling keep working unchanged.
  return new Response(groqRes.body, {
    status: groqRes.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
