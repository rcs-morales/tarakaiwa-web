import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent, waitFor } from '@testing-library/dom';

vi.mock('$lib/avatarUpload.js', () => ({
  uploadAvatar: vi.fn(),
  removeAvatar: vi.fn(),
  selectPresetAvatar: vi.fn(),
  AVATAR_PRESETS: [
    { id: 'a', name: 'Preset A', path: '/assets/a.png' },
    { id: 'b', name: 'Preset B', path: '/assets/b.png' },
  ],
}));

// avatar.js loads the Live2D runtime at import (not available in jsdom).
vi.mock('$lib/avatar.js', () => ({ initAvatar: vi.fn() }));
vi.mock('$lib/tts.js', async (importOriginal) => ({
  ...(await importOriginal()),
  startVoicevoxWarmup: vi.fn(),
  cancelVoicevoxWarmup: vi.fn(),
  getVoicePackStatus: vi.fn(async () => ({ cached: 3, total: 13 })),
  preloadAllVoicevoxAudio: vi.fn(),
}));
vi.mock('$lib/sync.js', async (importOriginal) => ({
  ...(await importOriginal()),
  deleteAllSessionResults: vi.fn(async () => false),
}));
vi.mock('$lib/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getCurrentUser: vi.fn(() => null),
}));

import Settings from '../src/lib/components/Settings.svelte';
import { initAvatar } from '$lib/avatar.js';
import { preloadAllVoicevoxAudio } from '$lib/tts.js';
import { deleteAllSessionResults } from '$lib/sync.js';
import { getCurrentUser } from '$lib/auth.js';
import { voicePack } from '../src/lib/voicePack.svelte.js';
import { history, recordSession } from '../src/lib/history.svelte.js';
import { initPrefs, prefs } from '../src/lib/prefs.svelte.js';
import { get, KEYS } from '../src/lib/settings.js';
import { uploadAvatar, removeAvatar } from '$lib/avatarUpload.js';
import { profile } from '../src/lib/profile.svelte.js';

// The ids the imperative modules (app.js, quota.js, groqClient.js) still
// look up for the Account and API-key sections — all must exist even while
// the Advanced disclosure is collapsed.
const WIRED_IDS = [
  'setup-step-account', 'account-signed-out', 'account-signed-in',
  'account-email-input', 'account-email-display', 'account-status-msg',
  'magic-link-form', 'btn-send-magic-link', 'btn-google-signin', 'btn-sign-out',
  'setup-step-api-key', 'api-key-form', 'api-key-input', 'btn-toggle-key',
  'btn-save-api', 'btn-test-api', 'btn-clear-api', 'api-key-status',
  'quota-panel', 'quota-chat-count', 'quota-chat-fill',
  'quota-whisper-count', 'quota-whisper-fill',
];

describe('Settings screen', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    history.entries = [];
    initPrefs();
    profile.user = null;
    profile.avatarUrl = null;
    profile.avatarBusting = '';
    uploadAvatar.mockReset().mockResolvedValue('https://x/avatars/u1/avatar.jpg?v=1');
    vi.mocked(initAvatar).mockClear();
    vi.mocked(deleteAllSessionResults).mockReset().mockResolvedValue(false);
    vi.mocked(getCurrentUser).mockReset().mockReturnValue(null);
    vi.mocked(preloadAllVoicevoxAudio).mockReset();
    voicePack.status = '—';
    voicePack.downloading = false;
    voicePack.progress = 0;
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

  it('shows the default avatar while signed out, and tapping it opens Advanced/Account instead of a picker', async () => {
    const { container } = render(Settings);

    expect(container.querySelector('.profile-avatar').src).toContain('/assets/zundamon.png');

    await fireEvent.click(container.querySelector('.avatar-btn'));

    expect(container.querySelector('.advanced-body').classList.contains('open')).toBe(true);
    expect(container.querySelector('.modal')).toBeNull();
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it('shows the current avatar when signed in', () => {
    profile.user = { id: 'u1', email: 'me@example.com' };
    profile.avatarUrl = 'https://x/avatars/u1/avatar.jpg';

    const { container } = render(Settings);

    expect(container.querySelector('.profile-avatar').src).toContain('avatars/u1/avatar.jpg');
  });

  it('tapping the avatar while signed in opens AvatarModal instead of a native picker', async () => {
    profile.user = { id: 'u1', email: 'me@example.com' };
    profile.avatarUrl = 'https://x/avatars/u1/avatar.jpg';

    const { container } = render(Settings);
    await fireEvent.click(container.querySelector('.avatar-btn'));

    expect(container.querySelector('.avm-card')).not.toBeNull();
    expect(container.querySelector('.avm-preview').src).toContain('avatars/u1/avatar.jpg');
  });

  it('uploading inside the modal updates the small Settings avatar and closing the modal removes it', async () => {
    profile.user = { id: 'u1', email: 'me@example.com' };
    profile.avatarUrl = 'https://x/avatars/u1/avatar.jpg';
    uploadAvatar.mockResolvedValue('https://x/avatars/u1/avatar.jpg?v=42');

    const { container } = render(Settings);
    await fireEvent.click(container.querySelector('.avatar-btn'));

    const input = container.querySelector('.avm-card input[type="file"]');
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    await fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(container.querySelector('.profile-avatar').src).toContain('avatars/u1/avatar.jpg?v=42'));

    await fireEvent.click(container.querySelector('.avm-cancel'));
    expect(container.querySelector('.avm-card')).toBeNull();
    // small avatar keeps the uploaded photo after the modal closes
    expect(container.querySelector('.profile-avatar').src).toContain('avatars/u1/avatar.jpg?v=42');
  });

  it('removing inside the modal reverts the small Settings avatar to the placeholder', async () => {
    profile.user = { id: 'u1', email: 'me@example.com' };
    profile.avatarUrl = 'https://x/avatars/u1/avatar.jpg';
    removeAvatar.mockResolvedValue(undefined);

    const { container } = render(Settings);
    await fireEvent.click(container.querySelector('.avatar-btn'));

    await waitFor(() => expect(container.querySelector('.avm-remove')).not.toBeNull());
    await fireEvent.click(container.querySelector('.avm-remove'));

    await waitFor(() => expect(container.querySelector('.profile-avatar').src).toContain('/assets/zundamon.png'));
  });

  describe('preference controls', () => {
    it('shows the stored values', () => {
      localStorage.setItem('jlpt_level', 'N4');
      localStorage.setItem('groq_grading_model', 'openai/gpt-oss-20b');
      localStorage.setItem('stt_mode', 'browser');
      localStorage.setItem('tts_mode', 'voicevox');
      localStorage.setItem('voicevox_speaker', '13');
      localStorage.setItem('avatar_model', 'haru');
      localStorage.setItem('tts_speed', '1.1');
      initPrefs();
      const { container } = render(Settings);
      const val = (id) => container.querySelector('#' + id).value;

      expect(val('jlpt-level-select')).toBe('N4');
      expect(val('grading-model-select')).toBe('openai/gpt-oss-20b');
      expect(val('stt-mode-select')).toBe('browser');
      expect(val('tts-mode-select')).toBe('voicevox');
      expect(val('voicevox-speaker-select')).toBe('13');
      expect(val('avatar-model-select')).toBe('haru');
      expect(val('tts-speed-slider')).toBe('1.1');
      expect(container.querySelector('#tts-speed-value').textContent).toBe('1.1×');
    });

    it('falls back to Balanced for an unknown stored grading model', () => {
      localStorage.setItem('groq_grading_model', 'retired-model');
      initPrefs();
      const { container } = render(Settings);
      expect(container.querySelector('#grading-model-select').value).toBe('openai/gpt-oss-120b');
    });

    it('saves simple selects and the speed slider', async () => {
      const { container } = render(Settings);

      await fireEvent.change(container.querySelector('#jlpt-level-select'), { target: { value: 'N3' } });
      await fireEvent.change(container.querySelector('#grading-model-select'), { target: { value: 'openai/gpt-oss-20b' } });
      await fireEvent.change(container.querySelector('#stt-mode-select'), { target: { value: 'browser' } });
      await fireEvent.input(container.querySelector('#tts-speed-slider'), { target: { value: '1.25' } });

      expect(get(KEYS.JLPT_LEVEL)).toBe('N3');
      expect(get(KEYS.GRADING_MODEL)).toBe('openai/gpt-oss-20b');
      expect(get(KEYS.STT_MODE)).toBe('browser');
      expect(get(KEYS.TTS_SPEED)).toBe('1.25');
      expect(container.querySelector('#tts-speed-value').textContent).toBe('1.25×');
    });

    it('switching TTS to VOICEVOX shows the voice section, resets the voice and reloads the avatar', async () => {
      localStorage.setItem('voicevox_speaker', '13');
      initPrefs();
      const { container } = render(Settings);
      const vv = container.querySelector('#voicevox-settings-section');
      const avatarSection = container.querySelector('#avatar-settings-section');
      expect(vv.style.display).toBe('none');
      expect(avatarSection.style.display).toBe('block');

      await fireEvent.change(container.querySelector('#tts-mode-select'), { target: { value: 'voicevox' } });

      expect(get(KEYS.TTS_MODE)).toBe('voicevox');
      expect(get(KEYS.VOICEVOX_SPEAKER)).toBe('3');
      expect(container.querySelector('#voicevox-speaker-select').value).toBe('3');
      expect(vv.style.display).toBe('block');
      expect(avatarSection.style.display).toBe('none');
      expect(initAvatar).toHaveBeenCalled();
    });

    it('changing the cloud voice or avatar saves it and reloads the avatar', async () => {
      const { container } = render(Settings);

      await fireEvent.change(container.querySelector('#voicevox-speaker-select'), { target: { value: '46' } });
      expect(get(KEYS.VOICEVOX_SPEAKER)).toBe('46');
      expect(initAvatar).toHaveBeenCalledTimes(1);

      await fireEvent.change(container.querySelector('#avatar-model-select'), { target: { value: 'chitose' } });
      expect(get(KEYS.AVATAR_MODEL)).toBe('chitose');
      expect(initAvatar).toHaveBeenCalledTimes(2);
    });

    it('follows settings pulled in by a login sync', async () => {
      initPrefs();
      const { container } = render(Settings);
      localStorage.setItem('jlpt_level', 'N3');
      localStorage.setItem('tts_speed', '0.6');
      window.dispatchEvent(new CustomEvent('settings-synced'));
      await waitFor(() => expect(container.querySelector('#jlpt-level-select').value).toBe('N3'));
      expect(container.querySelector('#tts-speed-value').textContent).toBe('0.6×');
    });
  });

  describe('voice pack', () => {
    it('downloads with a progress bar, then shows the cached count', async () => {
      let report, finish;
      vi.mocked(preloadAllVoicevoxAudio).mockImplementation((_texts, onProgress) => {
        report = onProgress;
        return new Promise((r) => { finish = r; });
      });
      const { container } = render(Settings);
      const btn = container.querySelector('#btn-download-voicepack');
      const bar = container.querySelector('#voicepack-progress');

      await fireEvent.click(btn);
      expect(btn.classList.contains('hidden')).toBe(true);
      expect(bar.classList.contains('hidden')).toBe(false);

      report(5, 10);
      await waitFor(() => expect(container.querySelector('#voicepack-status').textContent).toBe('downloading 5/10…'));
      expect(container.querySelector('#voicepack-progress-fill').style.width).toBe('50%');

      finish();
      await waitFor(() => expect(container.querySelector('#voicepack-status').textContent).toBe('3/13 phrases cached'));
      expect(btn.classList.contains('hidden')).toBe(false);
      expect(bar.classList.contains('hidden')).toBe(true);
    });
  });

  describe('reset progress', () => {
    it('does nothing if not confirmed', async () => {
      vi.stubGlobal('confirm', vi.fn(() => false));
      recordSession({ score: 10, total: 10, jlpt: 'N5' });
      const { container } = render(Settings);

      await fireEvent.click(container.querySelector('#btn-reset-progress'));

      expect(history.entries).toHaveLength(1);
      expect(deleteAllSessionResults).not.toHaveBeenCalled();
    });

    it('clears history and reports success when signed out', async () => {
      vi.stubGlobal('confirm', vi.fn(() => true));
      recordSession({ score: 10, total: 10, jlpt: 'N5' });
      const { container } = render(Settings);

      await fireEvent.click(container.querySelector('#btn-reset-progress'));

      const status = container.querySelector('#reset-progress-status');
      await waitFor(() => expect(status.textContent).toContain('All progress has been reset'));
      expect(status.classList.contains('success')).toBe(true);
      expect(history.entries).toHaveLength(0);
    });

    it('warns when signed in and the cloud history could not be deleted', async () => {
      vi.stubGlobal('confirm', vi.fn(() => true));
      vi.mocked(getCurrentUser).mockReturnValue({ id: 'u1' });
      vi.mocked(deleteAllSessionResults).mockResolvedValue(false);
      const { container } = render(Settings);

      await fireEvent.click(container.querySelector('#btn-reset-progress'));

      const status = container.querySelector('#reset-progress-status');
      await waitFor(() => expect(status.textContent).toContain('could not be deleted'));
      expect(status.classList.contains('error')).toBe(true);
    });

    it('reports success when signed in and the cloud delete worked', async () => {
      vi.stubGlobal('confirm', vi.fn(() => true));
      vi.mocked(getCurrentUser).mockReturnValue({ id: 'u1' });
      vi.mocked(deleteAllSessionResults).mockResolvedValue(true);
      const { container } = render(Settings);

      await fireEvent.click(container.querySelector('#btn-reset-progress'));

      await waitFor(() => expect(container.querySelector('#reset-progress-status').textContent)
        .toContain('All progress has been reset'));
    });
  });
});
