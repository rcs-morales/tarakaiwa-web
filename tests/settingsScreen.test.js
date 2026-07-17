import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent, waitFor } from '@testing-library/dom';

// auth.js would construct a supabase client — stub the bits the screen reads.
const mockGetCurrentUser = vi.fn(() => null);
vi.mock('$lib/auth.js', () => ({
  onAuthChange: vi.fn(),
  getCurrentUser: (...args) => mockGetCurrentUser(...args),
}));

vi.mock('$lib/avatarUpload.js', () => ({
  fetchAvatarUrl: vi.fn(async () => null),
  uploadAvatar: vi.fn(async () => 'https://x/avatars/u1/avatar.jpg?v=1'),
  removeAvatar: vi.fn(async () => undefined),
}));

import Settings from '../src/lib/components/Settings.svelte';
import { history, recordSession } from '../src/lib/history.svelte.js';
import { initPrefs, prefs } from '../src/lib/prefs.svelte.js';
import { get, KEYS } from '../src/lib/settings.js';
import { fetchAvatarUrl, uploadAvatar, removeAvatar } from '$lib/avatarUpload.js';

// The ids the imperative modules (app.js, quota.js, tts.js, avatar.js,
// groqClient.js) look up at mount — all must exist even while the Advanced
// disclosure is collapsed.
const WIRED_IDS = [
  'setup-step-account', 'account-signed-out', 'account-signed-in',
  'account-email-input', 'account-email-display', 'account-status-msg',
  'magic-link-form', 'btn-send-magic-link', 'btn-google-signin', 'btn-sign-out',
  'setup-step-api-key', 'api-key-form', 'api-key-input', 'btn-toggle-key',
  'btn-save-api', 'btn-test-api', 'btn-clear-api', 'api-key-status',
  'quota-panel', 'quota-chat-count', 'quota-chat-fill',
  'quota-whisper-count', 'quota-whisper-fill',
  'jlpt-level-select', 'grading-model-select',
  'setup-step-settings', 'stt-mode-select', 'tts-mode-select',
  'tts-speed-slider', 'tts-speed-value',
  'voicevox-settings-section', 'voicevox-speaker-select', 'voicevox-speaker-input',
  'voicepack-status', 'btn-download-voicepack', 'voicepack-progress',
  'voicepack-progress-fill', 'btn-clear-audio-cache',
  'avatar-settings-section', 'avatar-model-select',
  'setup-step-reset', 'btn-reset-progress', 'reset-progress-status',
];

describe('Settings screen', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    history.entries = [];
    initPrefs();
    mockGetCurrentUser.mockReturnValue(null);
    fetchAvatarUrl.mockReset().mockResolvedValue(null);
    uploadAvatar.mockReset().mockResolvedValue('https://x/avatars/u1/avatar.jpg?v=1');
    removeAvatar.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps every imperatively wired element id in the DOM while collapsed', () => {
    const { container } = render(Settings);
    for (const id of WIRED_IDS) {
      expect(container.querySelector(`#${id}`), `#${id} missing`).not.toBeNull();
    }
    // collapsed via CSS class, never unmounted
    const body = container.querySelector('.advanced-body');
    expect(body.classList.contains('open')).toBe(false);
  });

  it('opens and closes the Advanced disclosure', async () => {
    const { container } = render(Settings);
    const toggle = container.querySelector('.advanced-toggle');

    await fireEvent.click(toggle);
    expect(container.querySelector('.advanced-body').classList.contains('open')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    await fireEvent.click(toggle);
    expect(container.querySelector('.advanced-body').classList.contains('open')).toBe(false);
  });

  it('shows level, title and XP from history in the profile card', () => {
    recordSession({ score: 10, total: 10, jlpt: 'N5' }); // 200 XP
    const { container } = render(Settings);
    const meta = container.querySelector('.profile-meta').textContent;
    expect(meta).toContain('Lv 1');
    expect(meta).toContain('200 XP');
    expect(container.querySelector('.profile-name').textContent).toContain('Guest');
  });

  it('renders three aid toggles, on by default, and persists a flip', async () => {
    const { container } = render(Settings);
    const aidInputs = [...container.querySelectorAll('.switch input')];
    expect(aidInputs).toHaveLength(3);
    expect(aidInputs.every((el) => el.checked)).toBe(true);

    // first row is furigana
    await fireEvent.click(aidInputs[0]);
    expect(prefs.furigana).toBe(false);
    expect(get(KEYS.SHOW_FURIGANA)).toBe('0');
    expect(document.body.classList.contains('aids-hide-furigana')).toBe(true);
  });

  it('steps the daily goal up and down within bounds', async () => {
    const { container } = render(Settings);
    const [down, up] = container.querySelectorAll('.stepper-btn');
    expect(container.querySelector('.stepper-value').textContent).toBe('3');

    await fireEvent.click(up);
    expect(container.querySelector('.stepper-value').textContent).toBe('4');
    expect(get(KEYS.DAILY_GOAL)).toBe('4');

    await fireEvent.click(down);
    await fireEvent.click(down);
    await fireEvent.click(down);
    expect(container.querySelector('.stepper-value').textContent).toBe('1');
    expect(down.disabled).toBe(true);
  });

  it('hides the sign-out button while signed out', () => {
    render(Settings);
    expect(screen.queryByRole('button', { name: /Sign out/ })).toBeNull();
  });

  it('shows the default avatar with no camera badge while signed out, and tapping it opens Advanced/Account instead of a picker', async () => {
    const { container } = render(Settings);

    expect(container.querySelector('.profile-avatar').src).toContain('/assets/zundamon.png');
    expect(container.querySelector('.avatar-cam')).toBeNull();
    expect(fetchAvatarUrl).not.toHaveBeenCalled();

    await fireEvent.click(container.querySelector('.avatar-btn'));

    expect(container.querySelector('.advanced-body').classList.contains('open')).toBe(true);
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it('shows the fetched avatar and a camera badge when signed in', async () => {
    mockGetCurrentUser.mockReturnValue({ id: 'u1', email: 'me@example.com' });
    fetchAvatarUrl.mockResolvedValue('https://x/avatars/u1/avatar.jpg');

    const { container } = render(Settings);

    await waitFor(() => expect(container.querySelector('.profile-avatar').src).toContain('avatars/u1/avatar.jpg'));
    expect(container.querySelector('.avatar-cam')).not.toBeNull();
  });

  it('uploading a new picture updates the avatar and shows a success status', async () => {
    mockGetCurrentUser.mockReturnValue({ id: 'u1', email: 'me@example.com' });
    uploadAvatar.mockResolvedValue('https://x/avatars/u1/avatar.jpg?v=42');

    const { container } = render(Settings);
    await waitFor(() => expect(fetchAvatarUrl).toHaveBeenCalled());

    const input = container.querySelector('input[type="file"]');
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    await fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(uploadAvatar).toHaveBeenCalledWith(file));
    await waitFor(() => expect(container.querySelector('.profile-avatar').src).toContain('avatars/u1/avatar.jpg?v=42'));
    expect(container.querySelector('.import-status.success').textContent).toContain('updated');
  });

  it('a failed upload shows an error status and leaves the previous avatar in place', async () => {
    mockGetCurrentUser.mockReturnValue({ id: 'u1', email: 'me@example.com' });
    fetchAvatarUrl.mockResolvedValue('https://x/avatars/u1/avatar.jpg');
    uploadAvatar.mockRejectedValue(new Error('Upload failed.'));

    const { container } = render(Settings);
    await waitFor(() => expect(container.querySelector('.profile-avatar').src).toContain('avatars/u1/avatar.jpg'));

    const input = container.querySelector('input[type="file"]');
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    await fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(container.querySelector('.import-status.error')).not.toBeNull());
    expect(container.querySelector('.import-status.error').textContent).toContain('Upload failed.');
    expect(container.querySelector('.profile-avatar').src).toContain('avatars/u1/avatar.jpg');
    expect(container.querySelector('.profile-avatar').src).not.toContain('?v=');
  });

  it('hides the remove badge for guests and for a signed-in user with no custom photo', async () => {
    const { container } = render(Settings);
    expect(container.querySelector('.avatar-remove-btn')).toBeNull();

    mockGetCurrentUser.mockReturnValue({ id: 'u1', email: 'me@example.com' });
    fetchAvatarUrl.mockResolvedValue(null); // signed in, but no photo set yet
    const { container: c2 } = render(Settings);
    await waitFor(() => expect(fetchAvatarUrl).toHaveBeenCalled());
    expect(c2.querySelector('.avatar-remove-btn')).toBeNull();
  });

  it('shows the remove badge once signed in with a custom photo, and removing reverts to the placeholder', async () => {
    mockGetCurrentUser.mockReturnValue({ id: 'u1', email: 'me@example.com' });
    fetchAvatarUrl.mockResolvedValue('https://x/avatars/u1/avatar.jpg');
    vi.stubGlobal('confirm', vi.fn(() => true));

    const { container } = render(Settings);
    await waitFor(() => expect(container.querySelector('.avatar-remove-btn')).not.toBeNull());

    await fireEvent.click(container.querySelector('.avatar-remove-btn'));

    expect(removeAvatar).toHaveBeenCalled();
    await waitFor(() => expect(container.querySelector('.profile-avatar').src).toContain('/assets/zundamon.png'));
    expect(container.querySelector('.avatar-remove-btn')).toBeNull();
    expect(container.querySelector('.import-status.info').textContent).toContain('removed');
  });

  it('does nothing when the remove confirmation is dismissed', async () => {
    mockGetCurrentUser.mockReturnValue({ id: 'u1', email: 'me@example.com' });
    fetchAvatarUrl.mockResolvedValue('https://x/avatars/u1/avatar.jpg');
    vi.stubGlobal('confirm', vi.fn(() => false));

    const { container } = render(Settings);
    await waitFor(() => expect(container.querySelector('.avatar-remove-btn')).not.toBeNull());

    await fireEvent.click(container.querySelector('.avatar-remove-btn'));

    expect(removeAvatar).not.toHaveBeenCalled();
    expect(container.querySelector('.profile-avatar').src).toContain('avatars/u1/avatar.jpg');
  });

  it('shows an error status and keeps the photo when removal fails', async () => {
    mockGetCurrentUser.mockReturnValue({ id: 'u1', email: 'me@example.com' });
    fetchAvatarUrl.mockResolvedValue('https://x/avatars/u1/avatar.jpg');
    removeAvatar.mockRejectedValue(new Error('Remove failed.'));
    vi.stubGlobal('confirm', vi.fn(() => true));

    const { container } = render(Settings);
    await waitFor(() => expect(container.querySelector('.avatar-remove-btn')).not.toBeNull());

    await fireEvent.click(container.querySelector('.avatar-remove-btn'));

    await waitFor(() => expect(container.querySelector('.import-status.error')).not.toBeNull());
    expect(container.querySelector('.import-status.error').textContent).toContain('Remove failed.');
    expect(container.querySelector('.profile-avatar').src).toContain('avatars/u1/avatar.jpg');
    expect(container.querySelector('.avatar-remove-btn')).not.toBeNull();
  });
});
