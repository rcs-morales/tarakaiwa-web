// ─────────────────────────────────────────────
// AVATAR UPLOAD — profile picture crop/validate/upload/fetch
// ─────────────────────────────────────────────
//
// Signed-in only: uploads always go to the current auth user's own storage
// folder (avatars/<uid>/avatar.jpg), enforced both here (no-op when logged
// out) and by RLS (0004_profile_avatars.sql). No local/offline fallback —
// guests keep seeing the default static avatar (Settings.svelte's concern).

import { supabaseClient } from './supabase.js';
import { getCurrentUser } from './auth.js';

const BUCKET = 'avatars';
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // reject > 8 MB originals
export const AVATAR_SIZE = 125;

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif']);

/** Throws an Error with a user-facing message if the file is unusable. */
export function validateImageFile(file) {
  if (!file) throw new Error('No file selected.');
  if (!ALLOWED_TYPES.has(file.type)) throw new Error('Please choose a JPG, PNG, or GIF image.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Image is too large (max 8 MB).');
}

export const MAX_OUTPUT_BYTES = 32 * 1024; // 32kb cap on the stored/uploaded blob

const QUALITY_STEPS = [0.82, 0.65, 0.5, 0.35, 0.2];

function encodeAtQuality(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Image processing failed.'))),
      'image/jpeg',
      quality
    );
  });
}

/**
 * Draw `file` to a canvas, center-cropped to a square and downscaled to
 * size×size, returning a JPEG Blob. No interactive cropping — just an
 * automatic center crop of the shorter side. Re-encodes at progressively
 * lower quality until the blob is under MAX_OUTPUT_BYTES; if even the
 * lowest quality step is still over, returns that last attempt rather
 * than failing the upload.
 * @returns {Promise<Blob>}
 */
export async function cropResizeToSquare(file, size = AVATAR_SIZE) {
  const bitmap = await createImageBitmap(file); // decodes + honors EXIF orientation
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close?.();

  let blob;
  for (const quality of QUALITY_STEPS) {
    blob = await encodeAtQuality(canvas, quality);
    if (blob.size <= MAX_OUTPUT_BYTES) return blob;
  }
  return blob;
}

/** Fetch the signed-in user's stored avatar URL, or null. No-op when logged out. */
export async function fetchAvatarUrl() {
  const user = getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabaseClient
    .from('profiles')
    .select('avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('avatar fetch failed:', error.message);
    return null;
  }
  return data?.avatar_url ?? null;
}

export const AVATAR_PRESETS = [
  { id: 'zundamon', name: 'Zundamon', path: '/assets/zundamon.png' },
  { id: 'shikoku_metan', name: 'Shikoku Metan', path: '/assets/shikoku_metan.png' },
  { id: 'kasukabe_tsumugi', name: 'Kasukabe Tsumugi', path: '/assets/kasukabe_tsumugi.png' },
  { id: 'sayo', name: 'Sayo', path: '/assets/sayo.png' },
  { id: 'aoyama_ryusei', name: 'Aoyama Ryusei', path: '/assets/aoyama_ryusei.png' },
  { id: 'shirakami_kotarou', name: 'Shirakami Kotarou', path: '/assets/shirakami_kotarou.png' },
  { id: 'kurono_takehiro', name: 'Takehiro', path: '/assets/kurono_takehiro.png' },
];

/**
 * Upload `blob` to the signed-in `user`'s storage path (upsert) and write
 * `profiles.avatar_url`. Returns a cache-busted public URL. Throws on
 * failure — shared tail for both a custom upload and a preset pick.
 * @returns {Promise<string>}
 */
async function storeAvatarBlob(blob, user) {
  const path = `${user.id}/avatar.jpg`;

  const { error: uploadError } = await supabaseClient.storage
    .from(BUCKET)
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
  if (uploadError) throw uploadError;

  const { data: pub } = supabaseClient.storage.from(BUCKET).getPublicUrl(path);
  const baseUrl = pub.publicUrl;

  const { error: dbError } = await supabaseClient
    .from('profiles')
    .update({ avatar_url: baseUrl })
    .eq('id', user.id);
  if (dbError) throw dbError;

  // The object path is stable across re-uploads, so bust the cache at render
  // time rather than storing a versioned URL in the database.
  return `${baseUrl}?v=${Date.now()}`;
}

/**
 * Full flow: validate → crop/resize → upload (upsert) → write profiles.avatar_url.
 * Returns a cache-busted public URL to display immediately. Throws on failure —
 * the caller shows the message via its own status UI.
 * @returns {Promise<string>}
 */
export async function uploadAvatar(file) {
  const user = getCurrentUser();
  if (!user) throw new Error('Sign in to set a profile picture.');

  validateImageFile(file);
  const blob = await cropResizeToSquare(file);
  return storeAvatarBlob(blob, user);
}

/**
 * Set one of the bundled character portraits (AVATAR_PRESETS) as the
 * signed-in user's avatar — fetches the bundled asset, resizes it through
 * the same pipeline as a custom upload, and stores it the same way.
 * @returns {Promise<string>}
 */
export async function selectPresetAvatar(id) {
  const user = getCurrentUser();
  if (!user) throw new Error('Sign in to set a profile picture.');

  const preset = AVATAR_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error('Unknown avatar.');

  const response = await fetch(preset.path);
  if (!response.ok) throw new Error('Could not load that avatar.');
  const sourceBlob = await response.blob();

  const blob = await cropResizeToSquare(sourceBlob);
  return storeAvatarBlob(blob, user);
}

/**
 * Delete the signed-in user's stored avatar (storage object + profiles.avatar_url).
 * Throws on failure — the caller shows the message via its own status UI.
 */
export async function removeAvatar() {
  const user = getCurrentUser();
  if (!user) throw new Error('Sign in to manage your profile picture.');

  const path = `${user.id}/avatar.jpg`;

  const { error: removeError } = await supabaseClient.storage.from(BUCKET).remove([path]);
  if (removeError) throw removeError;

  const { error: dbError } = await supabaseClient
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', user.id);
  if (dbError) throw dbError;
}
