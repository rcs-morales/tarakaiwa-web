// POST /api/transcribe — authenticated passthrough to Groq's Whisper endpoint.
// Used by whisper.js when the user is signed in without a BYO key. Body is the
// multipart form built in whisper.js (file + model + language + ...). We cap
// the audio size, force the allowed Whisper model, charge quota estimated from
// the blob size (≈ size/8000 seconds at the 64 kbps recorder bitrate), then
// forward with the server-side GROQ_API_KEY.

import { authenticateRequest } from '$lib/server/auth.js';
import { reserveQuota } from '$lib/server/quota.js';
import { json } from '$lib/server/http.js';

const WHISPER_MODEL = 'whisper-large-v3-turbo';
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // Groq's per-file Whisper limit

export async function POST({ request, platform }) {
  // Cloudflare env bindings surface via `platform.env` under adapter-cloudflare
  // (absent in plain `vite dev`, where the endpoint returns 500 gracefully).
  const env = platform?.env ?? {};
  if (!env.GROQ_API_KEY) return json({ error: 'Server AI key not configured.' }, 500);

  const auth = await authenticateRequest(request, env);
  if (auth.error) return json({ error: auth.error }, auth.status);

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Invalid multipart body.' }, 400);
  }

  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'No audio file.' }, 400);
  if (file.size > MAX_AUDIO_BYTES) return json({ error: 'Audio too large.' }, 413);

  const model = form.get('model');
  if (model && model !== WHISPER_MODEL) return json({ error: 'Model not allowed.' }, 400);

  // 64 kbps ≈ 8000 bytes/sec → estimate the billed Whisper-seconds.
  const whisperSeconds = Math.max(1, Math.ceil(file.size / 8000));
  const quota = await reserveQuota(env, auth.user.id, { whisperSeconds });
  if (!quota.allowed) {
    return json({ error: 'Shared daily quota reached. Add your own Groq key in settings to continue.' }, 429);
  }

  // Rebuild the form, forcing the allowed model regardless of what was sent.
  const outForm = new FormData();
  for (const [key, value] of form.entries()) {
    if (key === 'model') continue;
    outForm.append(key, value);
  }
  outForm.append('model', WHISPER_MODEL);

  let groqRes;
  try {
    groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: outForm,
    });
  } catch (e) {
    return json({ error: 'Upstream request failed.' }, 502);
  }

  return new Response(groqRes.body, {
    status: groqRes.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
