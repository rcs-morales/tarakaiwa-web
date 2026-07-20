import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/lib/auth.js', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('../src/lib/supabase.js', () => ({
  supabaseClient: {
    storage: { from: vi.fn() },
    from: vi.fn(),
  },
}));

import {
  validateImageFile,
  cropResizeToSquare,
  fetchAvatarUrl,
  uploadAvatar,
  removeAvatar,
  selectPresetAvatar,
  AVATAR_PRESETS,
  MAX_UPLOAD_BYTES,
  MAX_OUTPUT_BYTES,
  AVATAR_SIZE,
} from '../src/lib/avatarUpload.js';
import { getCurrentUser } from '../src/lib/auth.js';
import { supabaseClient } from '../src/lib/supabase.js';

function makeFile({ type = 'image/png', size = 1024 } = {}) {
  const file = new File([new Uint8Array(size)], 'photo.png', { type });
  return file;
}

describe('validateImageFile', () => {
  it('throws when no file is given', () => {
    expect(() => validateImageFile(null)).toThrow('No file selected.');
  });

  it('throws for a MIME type outside the jpg/png/gif allow-list', () => {
    expect(() => validateImageFile(makeFile({ type: 'text/plain' }))).toThrow('Please choose a JPG, PNG, or GIF image.');
  });

  it('throws for an unsupported image type like webp', () => {
    expect(() => validateImageFile(makeFile({ type: 'image/webp' }))).toThrow('Please choose a JPG, PNG, or GIF image.');
  });

  it('throws for a file over the max size', () => {
    expect(() => validateImageFile(makeFile({ size: MAX_UPLOAD_BYTES + 1 }))).toThrow('too large');
  });

  it('accepts a small, valid jpeg file', () => {
    expect(() => validateImageFile(makeFile({ type: 'image/jpeg', size: 2048 }))).not.toThrow();
  });

  it('accepts png and gif', () => {
    expect(() => validateImageFile(makeFile({ type: 'image/png', size: 2048 }))).not.toThrow();
    expect(() => validateImageFile(makeFile({ type: 'image/gif', size: 2048 }))).not.toThrow();
  });
});

describe('cropResizeToSquare / uploadAvatar (canvas-stubbed)', () => {
  let fakeBlob;
  let originalGetContext;
  let originalToBlob;
  let drawImageCalls;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeBlob = new Blob(['fake-jpeg-bytes'], { type: 'image/jpeg' });
    drawImageCalls = [];

    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() })));

    originalGetContext = HTMLCanvasElement.prototype.getContext;
    originalToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      imageSmoothingQuality: 'high',
      drawImage: (...args) => drawImageCalls.push(args),
    }));
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (cb) { cb(fakeBlob); });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toBlob = originalToBlob;
  });

  it('center-crops horizontally for a landscape source and resizes to AVATAR_SIZE', async () => {
    const blob = await cropResizeToSquare(makeFile());

    expect(blob).toBe(fakeBlob);
    // source is 800x600 -> shorter side 600, horizontally centered, top-anchored: sx=(800-600)/2=100, sy=0
    expect(drawImageCalls).toHaveLength(1);
    const [, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight] = drawImageCalls[0];
    expect([sx, sy, sWidth, sHeight]).toEqual([100, 0, 600, 600]);
    expect([dx, dy, dWidth, dHeight]).toEqual([0, 0, AVATAR_SIZE, AVATAR_SIZE]);
  });

  it('anchors the crop to the top for a portrait source, keeping the top of the image (face/upper chest) in frame', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 600, height: 800, close: vi.fn() })));

    const blob = await cropResizeToSquare(makeFile());

    expect(blob).toBe(fakeBlob);
    // source is 600x800 (portrait) -> shorter side 600, no horizontal crop needed,
    // top-anchored vertically: sx=0, sy=0 (NOT the old centered (800-600)/2=100)
    const [, sx, sy, sWidth, sHeight] = drawImageCalls[0];
    expect([sx, sy, sWidth, sHeight]).toEqual([0, 0, 600, 600]);
  });

  it('rejects when the canvas fails to produce a blob', async () => {
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (cb) { cb(null); });
    await expect(cropResizeToSquare(makeFile())).rejects.toThrow('Image processing failed.');
  });

  it('re-encodes at a lower quality when the first pass exceeds the 32KB cap, and stops at the first pass that fits', async () => {
    const bigBlob = { size: MAX_OUTPUT_BYTES + 1, type: 'image/jpeg' };
    const smallBlob = { size: MAX_OUTPUT_BYTES - 1, type: 'image/jpeg' };
    const qualityCalls = [];
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (cb, type, quality) {
      qualityCalls.push(quality);
      cb(qualityCalls.length === 1 ? bigBlob : smallBlob);
    });

    const blob = await cropResizeToSquare(makeFile());

    expect(blob).toBe(smallBlob);
    expect(qualityCalls).toEqual([0.82, 0.65]);
  });

  it('returns the last (lowest-quality) attempt instead of throwing when nothing fits under 32KB', async () => {
    const oversizedBlob = { size: MAX_OUTPUT_BYTES + 1, type: 'image/jpeg' };
    const qualityCalls = [];
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (cb, type, quality) {
      qualityCalls.push(quality);
      cb(oversizedBlob);
    });

    const blob = await cropResizeToSquare(makeFile());

    expect(blob).toBe(oversizedBlob);
    expect(qualityCalls).toEqual([0.82, 0.65, 0.5, 0.35, 0.2]);
  });

  describe('uploadAvatar', () => {
    it('throws when logged out', async () => {
      getCurrentUser.mockReturnValue(null);
      await expect(uploadAvatar(makeFile())).rejects.toThrow('Sign in');
    });

    it('validates before touching the network', async () => {
      getCurrentUser.mockReturnValue({ id: 'u1', email: 'me@example.com' });
      await expect(uploadAvatar(makeFile({ type: 'text/plain' }))).rejects.toThrow('Please choose a JPG, PNG, or GIF image.');
      expect(supabaseClient.storage.from).not.toHaveBeenCalled();
    });

    it('uploads to a stable per-user path with upsert, updates profiles, and returns a cache-busted URL', async () => {
      getCurrentUser.mockReturnValue({ id: 'user-123', email: 'me@example.com' });

      const upload = vi.fn().mockResolvedValue({ error: null });
      const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: 'https://x.supabase.co/storage/v1/object/public/avatars/user-123/avatar.jpg' } });
      supabaseClient.storage.from.mockReturnValue({ upload, getPublicUrl });

      const eq = vi.fn().mockResolvedValue({ error: null });
      const update = vi.fn().mockReturnValue({ eq });
      supabaseClient.from.mockReturnValue({ update });

      const url = await uploadAvatar(makeFile());

      expect(supabaseClient.storage.from).toHaveBeenCalledWith('avatars');
      expect(upload).toHaveBeenCalledWith(
        'user-123/avatar.jpg',
        fakeBlob,
        expect.objectContaining({ upsert: true, contentType: 'image/jpeg' })
      );
      expect(getPublicUrl).toHaveBeenCalledWith('user-123/avatar.jpg');

      expect(supabaseClient.from).toHaveBeenCalledWith('profiles');
      expect(update).toHaveBeenCalledWith({ avatar_url: 'https://x.supabase.co/storage/v1/object/public/avatars/user-123/avatar.jpg' });
      expect(eq).toHaveBeenCalledWith('id', 'user-123');

      expect(url).toMatch(/^https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/avatars\/user-123\/avatar\.jpg\?v=\d+$/);
    });

    it('throws when the storage upload fails', async () => {
      getCurrentUser.mockReturnValue({ id: 'user-123', email: 'me@example.com' });
      const upload = vi.fn().mockResolvedValue({ error: new Error('network down') });
      supabaseClient.storage.from.mockReturnValue({ upload, getPublicUrl: vi.fn() });

      await expect(uploadAvatar(makeFile())).rejects.toThrow('network down');
      expect(supabaseClient.from).not.toHaveBeenCalled();
    });

    it('throws when the profiles update fails', async () => {
      getCurrentUser.mockReturnValue({ id: 'user-123', email: 'me@example.com' });
      supabaseClient.storage.from.mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://x/avatars/user-123/avatar.jpg' } }),
      });
      const eq = vi.fn().mockResolvedValue({ error: new Error('rls denied') });
      supabaseClient.from.mockReturnValue({ update: vi.fn().mockReturnValue({ eq }) });

      await expect(uploadAvatar(makeFile())).rejects.toThrow('rls denied');
    });
  });

  describe('selectPresetAvatar', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    it('exposes exactly the 7 bundled character portraits', () => {
      expect(AVATAR_PRESETS).toHaveLength(7);
      for (const preset of AVATAR_PRESETS) {
        expect(preset.id).toEqual(expect.any(String));
        expect(preset.name).toEqual(expect.any(String));
        expect(preset.path).toMatch(/^\/assets\/.+\.png$/);
      }
    });

    it('throws when logged out, without fetching', async () => {
      getCurrentUser.mockReturnValue(null);
      await expect(selectPresetAvatar('zundamon')).rejects.toThrow('Sign in');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('throws for an unknown preset id', async () => {
      getCurrentUser.mockReturnValue({ id: 'user-123', email: 'me@example.com' });
      await expect(selectPresetAvatar('nope')).rejects.toThrow('Unknown avatar.');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('throws when the preset image fails to load', async () => {
      getCurrentUser.mockReturnValue({ id: 'user-123', email: 'me@example.com' });
      fetch.mockResolvedValue({ ok: false });
      await expect(selectPresetAvatar('zundamon')).rejects.toThrow('Could not load that avatar.');
      expect(supabaseClient.storage.from).not.toHaveBeenCalled();
    });

    it('fetches the preset image, resizes it, and stores it exactly like a normal upload', async () => {
      getCurrentUser.mockReturnValue({ id: 'user-123', email: 'me@example.com' });
      const sourceBlob = new Blob(['fake-png-bytes'], { type: 'image/png' });
      fetch.mockResolvedValue({ ok: true, blob: async () => sourceBlob });

      const upload = vi.fn().mockResolvedValue({ error: null });
      const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: 'https://x.supabase.co/storage/v1/object/public/avatars/user-123/avatar.jpg' } });
      supabaseClient.storage.from.mockReturnValue({ upload, getPublicUrl });
      const eq = vi.fn().mockResolvedValue({ error: null });
      supabaseClient.from.mockReturnValue({ update: vi.fn().mockReturnValue({ eq }) });

      const url = await selectPresetAvatar('zundamon');

      expect(fetch).toHaveBeenCalledWith('/assets/zundamon.png');
      expect(upload).toHaveBeenCalledWith('user-123/avatar.jpg', fakeBlob, expect.objectContaining({ upsert: true, contentType: 'image/jpeg' }));
      expect(url).toMatch(/^https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/avatars\/user-123\/avatar\.jpg\?v=\d+$/);
    });

    it('throws when the storage upload fails, same as uploadAvatar', async () => {
      getCurrentUser.mockReturnValue({ id: 'user-123', email: 'me@example.com' });
      fetch.mockResolvedValue({ ok: true, blob: async () => new Blob(['x'], { type: 'image/png' }) });
      supabaseClient.storage.from.mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: new Error('network down') }), getPublicUrl: vi.fn() });

      await expect(selectPresetAvatar('zundamon')).rejects.toThrow('network down');
      expect(supabaseClient.from).not.toHaveBeenCalled();
    });
  });
});

describe('fetchAvatarUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when logged out, without querying supabase', async () => {
    getCurrentUser.mockReturnValue(null);
    const result = await fetchAvatarUrl();
    expect(result).toBeNull();
    expect(supabaseClient.from).not.toHaveBeenCalled();
  });

  it('returns the stored avatar_url when signed in', async () => {
    getCurrentUser.mockReturnValue({ id: 'user-123', email: 'me@example.com' });
    const maybeSingle = vi.fn().mockResolvedValue({ data: { avatar_url: 'https://x/avatar.jpg' }, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    supabaseClient.from.mockReturnValue({ select });

    const result = await fetchAvatarUrl();

    expect(supabaseClient.from).toHaveBeenCalledWith('profiles');
    expect(select).toHaveBeenCalledWith('avatar_url');
    expect(eq).toHaveBeenCalledWith('id', 'user-123');
    expect(result).toBe('https://x/avatar.jpg');
  });

  it('returns null when the row has no avatar_url yet', async () => {
    getCurrentUser.mockReturnValue({ id: 'user-123', email: 'me@example.com' });
    const maybeSingle = vi.fn().mockResolvedValue({ data: { avatar_url: null }, error: null });
    supabaseClient.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) });

    expect(await fetchAvatarUrl()).toBeNull();
  });

  it('returns null and logs when the query errors', async () => {
    getCurrentUser.mockReturnValue({ id: 'user-123', email: 'me@example.com' });
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: new Error('boom') });
    supabaseClient.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await fetchAvatarUrl()).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('removeAvatar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when logged out', async () => {
    getCurrentUser.mockReturnValue(null);
    await expect(removeAvatar()).rejects.toThrow('Sign in');
  });

  it('deletes the storage object at the stable per-user path and clears profiles.avatar_url', async () => {
    getCurrentUser.mockReturnValue({ id: 'user-123', email: 'me@example.com' });

    const remove = vi.fn().mockResolvedValue({ error: null });
    supabaseClient.storage.from.mockReturnValue({ remove });

    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    supabaseClient.from.mockReturnValue({ update });

    await removeAvatar();

    expect(supabaseClient.storage.from).toHaveBeenCalledWith('avatars');
    expect(remove).toHaveBeenCalledWith(['user-123/avatar.jpg']);
    expect(supabaseClient.from).toHaveBeenCalledWith('profiles');
    expect(update).toHaveBeenCalledWith({ avatar_url: null });
    expect(eq).toHaveBeenCalledWith('id', 'user-123');
  });

  it('throws when the storage delete fails', async () => {
    getCurrentUser.mockReturnValue({ id: 'user-123', email: 'me@example.com' });
    supabaseClient.storage.from.mockReturnValue({ remove: vi.fn().mockResolvedValue({ error: new Error('network down') }) });

    await expect(removeAvatar()).rejects.toThrow('network down');
    expect(supabaseClient.from).not.toHaveBeenCalled();
  });

  it('throws when the profiles update fails', async () => {
    getCurrentUser.mockReturnValue({ id: 'user-123', email: 'me@example.com' });
    supabaseClient.storage.from.mockReturnValue({ remove: vi.fn().mockResolvedValue({ error: null }) });
    const eq = vi.fn().mockResolvedValue({ error: new Error('rls denied') });
    supabaseClient.from.mockReturnValue({ update: vi.fn().mockReturnValue({ eq }) });

    await expect(removeAvatar()).rejects.toThrow('rls denied');
  });
});
