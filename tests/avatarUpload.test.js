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
  MAX_UPLOAD_BYTES,
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

  it('throws for a non-image MIME type', () => {
    expect(() => validateImageFile(makeFile({ type: 'text/plain' }))).toThrow('Please choose an image file.');
  });

  it('throws for a file over the max size', () => {
    expect(() => validateImageFile(makeFile({ size: MAX_UPLOAD_BYTES + 1 }))).toThrow('too large');
  });

  it('accepts a small, valid image file', () => {
    expect(() => validateImageFile(makeFile({ type: 'image/jpeg', size: 2048 }))).not.toThrow();
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

  it('center-crops the shorter side and resizes to AVATAR_SIZE', async () => {
    const blob = await cropResizeToSquare(makeFile());

    expect(blob).toBe(fakeBlob);
    // source is 800x600 -> shorter side 600, centered crop: sx=(800-600)/2=100, sy=0
    expect(drawImageCalls).toHaveLength(1);
    const [, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight] = drawImageCalls[0];
    expect([sx, sy, sWidth, sHeight]).toEqual([100, 0, 600, 600]);
    expect([dx, dy, dWidth, dHeight]).toEqual([0, 0, AVATAR_SIZE, AVATAR_SIZE]);
  });

  it('rejects when the canvas fails to produce a blob', async () => {
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (cb) { cb(null); });
    await expect(cropResizeToSquare(makeFile())).rejects.toThrow('Image processing failed.');
  });

  describe('uploadAvatar', () => {
    it('throws when logged out', async () => {
      getCurrentUser.mockReturnValue(null);
      await expect(uploadAvatar(makeFile())).rejects.toThrow('Sign in');
    });

    it('validates before touching the network', async () => {
      getCurrentUser.mockReturnValue({ id: 'u1', email: 'me@example.com' });
      await expect(uploadAvatar(makeFile({ type: 'text/plain' }))).rejects.toThrow('Please choose an image file.');
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
