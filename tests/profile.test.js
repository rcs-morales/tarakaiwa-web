import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/auth.js', () => ({
  getCurrentUser: vi.fn(),
  onAuthChange: vi.fn(),
}));

vi.mock('../src/lib/avatarUpload.js', () => ({
  fetchAvatarUrl: vi.fn(),
}));

import { profile, DEFAULT_AVATAR, avatarSrc, applyAvatarChange, watchProfile } from '../src/lib/profile.svelte.js';
import { getCurrentUser, onAuthChange } from '../src/lib/auth.js';
import { fetchAvatarUrl } from '../src/lib/avatarUpload.js';

describe('avatarSrc', () => {
  beforeEach(() => {
    profile.user = null;
    profile.avatarUrl = null;
    profile.avatarBusting = '';
  });

  it('falls back to the default avatar when signed out', () => {
    expect(avatarSrc()).toBe(DEFAULT_AVATAR);
  });

  it('falls back to the default avatar when signed in with no stored picture', () => {
    profile.user = { id: 'u1' };
    expect(avatarSrc()).toBe(DEFAULT_AVATAR);
  });

  it('returns the stored URL plus cache-busting query when both are set', () => {
    profile.user = { id: 'u1' };
    profile.avatarUrl = 'https://x/avatars/u1/avatar.jpg';
    profile.avatarBusting = '?v=42';
    expect(avatarSrc()).toBe('https://x/avatars/u1/avatar.jpg?v=42');
  });
});

describe('applyAvatarChange', () => {
  it('clears both fields when passed null', () => {
    profile.avatarUrl = 'https://x/avatar.jpg';
    profile.avatarBusting = '?v=1';
    applyAvatarChange(null);
    expect(profile.avatarUrl).toBeNull();
    expect(profile.avatarBusting).toBe('');
  });

  it('splits a cache-busted URL into avatarUrl and avatarBusting', () => {
    applyAvatarChange('https://x/avatars/u1/avatar.jpg?v=42');
    expect(profile.avatarUrl).toBe('https://x/avatars/u1/avatar.jpg');
    expect(profile.avatarBusting).toBe('?v=42');
  });

  it('handles a URL with no query string', () => {
    applyAvatarChange('https://x/avatars/u1/avatar.jpg');
    expect(profile.avatarUrl).toBe('https://x/avatars/u1/avatar.jpg');
    expect(profile.avatarBusting).toBe('');
  });
});

describe('watchProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profile.user = null;
    profile.avatarUrl = null;
    profile.avatarBusting = '';
  });

  it('loads the current user and avatar, and subscribes to auth changes', async () => {
    getCurrentUser.mockReturnValue({ id: 'u1' });
    fetchAvatarUrl.mockResolvedValue('https://x/avatars/u1/avatar.jpg');

    watchProfile();

    expect(profile.user).toEqual({ id: 'u1' });
    await vi.waitFor(() => expect(profile.avatarUrl).toBe('https://x/avatars/u1/avatar.jpg'));
    expect(onAuthChange).toHaveBeenCalledTimes(1);
  });

  it('does not fetch the avatar when signed out', async () => {
    getCurrentUser.mockReturnValue(null);
    watchProfile();
    expect(profile.user).toBeNull();
    expect(fetchAvatarUrl).not.toHaveBeenCalled();
  });

  it('reloads user/avatar when the subscribed auth callback fires', async () => {
    getCurrentUser.mockReturnValue({ id: 'u1' });
    fetchAvatarUrl.mockResolvedValue('https://x/avatars/u1/avatar.jpg');
    watchProfile();
    await vi.waitFor(() => expect(profile.avatarUrl).toBe('https://x/avatars/u1/avatar.jpg'));

    const authCallback = onAuthChange.mock.calls[0][0];
    fetchAvatarUrl.mockClear();
    authCallback(null);

    expect(profile.user).toBeNull();
    await vi.waitFor(() => expect(profile.avatarUrl).toBeNull());
    expect(fetchAvatarUrl).not.toHaveBeenCalled();
  });
});
