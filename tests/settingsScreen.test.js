import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent, waitFor } from '@testing-library/dom';
import { tick } from 'svelte';

vi.mock('#lib/avatarUpload.js', () => ({
  uploadAvatar: vi.fn(),
  removeAvatar: vi.fn(),
  selectPresetAvatar: vi.fn(),
  AVATAR_PRESETS: [
    { id: 'a', name: 'Preset A', path: '/assets/a.png' },
    { id: 'b', name: 'Preset B', path: '/assets/b.png' },
  ],
}));

// avatar.js loads the Live2D runtime at import (not available in jsdom).
vi.mock('#lib/avatar.js', () => ({ initAvatar: vi.fn() }));
vi.mock('#lib/tts.js', async (importOriginal) => ({
  ...(await importOriginal()),
  startVoicevoxWarmup: vi.fn(),
  cancelVoicevoxWarmup: vi.fn(),
  getVoicePackStatus: vi.fn(async () => ({ cached: 3, total: 13 })),
  preloadAllVoicevoxAudio: vi.fn(),
}));
vi.mock('#lib/sync.js', async (importOriginal) => ({
  ...(await importOriginal()),
  deleteAllSessionResults: vi.fn(async () => false),
  onLogout: vi.fn(),
}));
vi.mock('#lib/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getCurrentUser: vi.fn(() => null),
  signInWithEmail: vi.fn(async () => ({ error: null })),
  signInWithGoogle: vi.fn(async () => ({ error: null })),
  signOut: vi.fn(async () => {}),
}));
vi.mock('#lib/quota.svelte.js', async (importOriginal) => ({
  ...(await importOriginal()),
  updateQuotaDisplay: vi.fn(async () => {}),
}));

import Settings from '../src/lib/components/Settings.svelte';
import { initAvatar } from '#lib/avatar.js';
import { preloadAllVoicevoxAudio } from '#lib/tts.js';
import { deleteAllSessionResults } from '#lib/sync.js';
import { getCurrentUser, signInWithEmail, signInWithGoogle, signOut } from '#lib/auth.js';
import { onLogout } from '#lib/sync.js';
import { quota, updateQuotaDisplay } from '#lib/quota.svelte.js';
import { apiKey, loadApiKey } from '../src/lib/apiKey.svelte.js';
import { account } from '../src/lib/account.svelte.js';
import { voicePack } from '../src/lib/voicePack.svelte.js';
import { history, recordSession } from '../src/lib/history.svelte.js';
import { initPrefs, prefs } from '../src/lib/prefs.svelte.js';
import { get, KEYS } from '../src/lib/settings.js';
import { uploadAvatar, removeAvatar } from '#lib/avatarUpload.js';
import { profile } from '../src/lib/profile.svelte.js';
import { q } from './helpers.js';

describe('Settings screen', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    history.entries = [];
    initPrefs();
    profile.user = null;
    profile.avatarUrl = null;
    profile.avatarBusting = '';
    vi.mocked(uploadAvatar).mockReset().mockResolvedValue('https://x/avatars/u1/avatar.jpg?v=1');
    vi.mocked(initAvatar).mockClear();
    vi.mocked(deleteAllSessionResults).mockReset().mockResolvedValue(false);
    vi.mocked(getCurrentUser).mockReset().mockReturnValue(null);
    vi.mocked(preloadAllVoicevoxAudio).mockReset();
    voicePack.status = '—';
    vi.mocked(signInWithEmail, { partial: true }).mockReset().mockResolvedValue({ error: null });
    vi.mocked(signInWithGoogle, { partial: true }).mockReset().mockResolvedValue({ error: null });
    vi.mocked(signOut).mockReset().mockResolvedValue(undefined);
    vi.mocked(onLogout).mockReset();
    vi.mocked(updateQuotaDisplay).mockReset();
    account.status = { message: '', type: '' };
    apiKey.status = { message: '', type: '' };
    loadApiKey();
    quota.usage = null;
    voicePack.downloading = false;
    voicePack.progress = 0;
    vi.mocked(removeAvatar).mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('collapses the Advanced disclosure with CSS, keeping its sections mounted', () => {
    const { container } = render(Settings);
    expect(container.querySelector('.advanced-body').classList.contains('open')).toBe(false);
    for (const id of ['setup-step-account', 'setup-step-api-key', 'setup-step-settings', 'setup-step-reset']) {
      expect(container.querySelector('#' + id), id).not.toBeNull();
    }
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
    const aidInputs = /** @type {HTMLInputElement[]} */ ([...container.querySelectorAll('.switch input')]);
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
    const [down, up] = /** @type {NodeListOf<HTMLButtonElement>} */ (container.querySelectorAll('.stepper-btn'));
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

    expect(q(container, '.profile-avatar').src).toContain('/assets/zundamon.png');

    await fireEvent.click(container.querySelector('.avatar-btn'));

    expect(container.querySelector('.advanced-body').classList.contains('open')).toBe(true);
    expect(container.querySelector('.modal')).toBeNull();
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it('shows the current avatar when signed in', () => {
    profile.user = /** @type {any} */ ({ id: 'u1', email: 'me@example.com' });
    profile.avatarUrl = 'https://x/avatars/u1/avatar.jpg';

    const { container } = render(Settings);

    expect(q(container, '.profile-avatar').src).toContain('avatars/u1/avatar.jpg');
  });

  it('tapping the avatar while signed in opens AvatarModal instead of a native picker', async () => {
    profile.user = /** @type {any} */ ({ id: 'u1', email: 'me@example.com' });
    profile.avatarUrl = 'https://x/avatars/u1/avatar.jpg';

    const { container } = render(Settings);
    await fireEvent.click(container.querySelector('.avatar-btn'));

    expect(container.querySelector('.avm-card')).not.toBeNull();
    expect(q(container, '.avm-preview').src).toContain('avatars/u1/avatar.jpg');
  });

  it('uploading inside the modal updates the small Settings avatar and closing the modal removes it', async () => {
    profile.user = /** @type {any} */ ({ id: 'u1', email: 'me@example.com' });
    profile.avatarUrl = 'https://x/avatars/u1/avatar.jpg';
    vi.mocked(uploadAvatar).mockResolvedValue('https://x/avatars/u1/avatar.jpg?v=42');

    const { container } = render(Settings);
    await fireEvent.click(container.querySelector('.avatar-btn'));

    const input = container.querySelector('.avm-card input[type="file"]');
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    await fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(q(container, '.profile-avatar').src).toContain('avatars/u1/avatar.jpg?v=42'));

    await fireEvent.click(container.querySelector('.avm-cancel'));
    expect(container.querySelector('.avm-card')).toBeNull();
    // small avatar keeps the uploaded photo after the modal closes
    expect(q(container, '.profile-avatar').src).toContain('avatars/u1/avatar.jpg?v=42');
  });

  it('removing inside the modal reverts the small Settings avatar to the placeholder', async () => {
    profile.user = /** @type {any} */ ({ id: 'u1', email: 'me@example.com' });
    profile.avatarUrl = 'https://x/avatars/u1/avatar.jpg';
    vi.mocked(removeAvatar).mockResolvedValue(undefined);

    const { container } = render(Settings);
    await fireEvent.click(container.querySelector('.avatar-btn'));

    await waitFor(() => expect(container.querySelector('.avm-remove')).not.toBeNull());
    await fireEvent.click(container.querySelector('.avm-remove'));

    await waitFor(() => expect(q(container, '.profile-avatar').src).toContain('/assets/zundamon.png'));
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
      const val = (id) => q(container, '#' + id).value;

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
      expect(q(container, '#grading-model-select').value).toBe('openai/gpt-oss-120b');
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
      const vv = q(container, '#voicevox-settings-section');
      const avatarSection = q(container, '#avatar-settings-section');
      expect(vv.style.display).toBe('none');
      expect(avatarSection.style.display).toBe('block');

      await fireEvent.change(container.querySelector('#tts-mode-select'), { target: { value: 'voicevox' } });

      expect(get(KEYS.TTS_MODE)).toBe('voicevox');
      expect(get(KEYS.VOICEVOX_SPEAKER)).toBe('3');
      expect(q(container, '#voicevox-speaker-select').value).toBe('3');
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
      await waitFor(() => expect(q(container, '#jlpt-level-select').value).toBe('N3'));
      expect(container.querySelector('#tts-speed-value').textContent).toBe('0.6×');
    });
  });

  describe('voice pack', () => {
    it('downloads with a progress bar, then shows the cached count', async () => {
      /** @type {any} */
      let report;
      /** @type {any} */
      let finish;
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
      expect(q(container, '#voicepack-progress-fill').style.width).toBe('50%');

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
      vi.mocked(getCurrentUser, { partial: true }).mockReturnValue({ id: 'u1' });
      vi.mocked(deleteAllSessionResults).mockResolvedValue(false);
      const { container } = render(Settings);

      await fireEvent.click(container.querySelector('#btn-reset-progress'));

      const status = container.querySelector('#reset-progress-status');
      await waitFor(() => expect(status.textContent).toContain('could not be deleted'));
      expect(status.classList.contains('error')).toBe(true);
    });

    it('reports success when signed in and the cloud delete worked', async () => {
      vi.stubGlobal('confirm', vi.fn(() => true));
      vi.mocked(getCurrentUser, { partial: true }).mockReturnValue({ id: 'u1' });
      vi.mocked(deleteAllSessionResults).mockResolvedValue(true);
      const { container } = render(Settings);

      await fireEvent.click(container.querySelector('#btn-reset-progress'));

      await waitFor(() => expect(container.querySelector('#reset-progress-status').textContent)
        .toContain('All progress has been reset'));
    });
  });

  describe('account & sync', () => {
    it('shows the sign-in form while signed out', () => {
      const { container } = render(Settings);
      expect(container.querySelector('#account-signed-out')).not.toBeNull();
      expect(container.querySelector('#account-signed-in')).toBeNull();
    });

    it('asks for an email before sending a magic link', async () => {
      const { container } = render(Settings);
      await fireEvent.click(container.querySelector('#btn-send-magic-link'));
      const status = container.querySelector('#account-status-msg');
      expect(status.textContent).toBe('Please enter your email address.');
      expect(status.classList.contains('error')).toBe(true);
      expect(signInWithEmail).not.toHaveBeenCalled();
    });

    it('sends a magic link from the button and from Enter in the field', async () => {
      const { container } = render(Settings);
      const input = container.querySelector('#account-email-input');
      await fireEvent.input(input, { target: { value: '  me@example.com ' } });

      await fireEvent.click(container.querySelector('#btn-send-magic-link'));
      await waitFor(() => expect(container.querySelector('#account-status-msg').textContent)
        .toBe('✅ Check your inbox for the sign-in link.'));
      expect(signInWithEmail).toHaveBeenCalledWith('me@example.com');

      await fireEvent.submit(container.querySelector('#magic-link-form'));
      expect(signInWithEmail).toHaveBeenCalledTimes(2);
    });

    it('shows the sign-in error', async () => {
      vi.mocked(signInWithGoogle).mockResolvedValue(/** @type {any} */ ({ error: { message: 'popup blocked' } }));
      const { container } = render(Settings);
      await fireEvent.click(container.querySelector('#btn-google-signin'));
      await waitFor(() => expect(container.querySelector('#account-status-msg').textContent).toBe('❌ popup blocked'));
    });

    it('shows who is signed in and signs out', async () => {
      profile.user = /** @type {any} */ ({ id: 'u1', email: 'me@example.com' });
      const { container } = render(Settings);
      expect(container.querySelector('#account-signed-out')).toBeNull();
      expect(container.querySelector('#account-email-display').textContent).toBe('me@example.com');

      await fireEvent.click(container.querySelector('#btn-sign-out'));
      await waitFor(() => expect(container.querySelector('#account-status-msg').textContent).toBe('Signed out.'));
      expect(signOut).toHaveBeenCalled();
      expect(onLogout).toHaveBeenCalled();
    });
  });

  describe('API key', () => {
    it('shows the stored key, hidden until toggled', async () => {
      localStorage.setItem('api_key', 'gsk_stored');
      loadApiKey();
      const { container } = render(Settings);
      const input = q(container, '#api-key-input');
      expect(input.value).toBe('gsk_stored');
      expect(input.type).toBe('password');

      await fireEvent.click(container.querySelector('#btn-toggle-key'));
      expect(input.type).toBe('text');
    });

    it('rejects a non-Groq key', async () => {
      const { container } = render(Settings);
      await fireEvent.input(container.querySelector('#api-key-input'), { target: { value: 'sk-openai' } });
      await fireEvent.click(container.querySelector('#btn-save-api'));
      expect(container.querySelector('#api-key-status').textContent).toContain('Keys start with gsk_');
      expect(localStorage.getItem('api_key')).toBeNull();
    });

    it('saves a cleaned-up key (button or Enter) and refreshes the quota', async () => {
      const { container } = render(Settings);
      const input = q(container, '#api-key-input');
      await fireEvent.input(input, { target: { value: ' gsk_abc 123\n' } });

      await fireEvent.submit(container.querySelector('#api-key-form'));

      expect(localStorage.getItem('api_key')).toBe('gsk_abc123');
      expect(localStorage.getItem('api_provider')).toBe('groq');
      expect(input.value).toBe('gsk_abc123');
      const status = container.querySelector('#api-key-status');
      expect(status.textContent).toBe('✅ Groq API key saved!');
      expect(status.classList.contains('success')).toBe(true);
      expect(updateQuotaDisplay).toHaveBeenCalled();
    });

    it('clears the key', async () => {
      localStorage.setItem('api_key', 'gsk_stored');
      localStorage.setItem('api_provider', 'groq');
      loadApiKey();
      const { container } = render(Settings);

      await fireEvent.click(container.querySelector('#btn-clear-api'));

      expect(localStorage.getItem('api_key')).toBeNull();
      expect(q(container, '#api-key-input').value).toBe('');
      expect(container.querySelector('#api-key-status').textContent).toContain('API key cleared');
      expect(updateQuotaDisplay).toHaveBeenCalled();
    });

    it('tests the typed key against Groq', async () => {
      const fetchMock = vi.fn(async () => ({ ok: false, status: 401 }));
      vi.stubGlobal('fetch', fetchMock);
      const { container } = render(Settings);
      await fireEvent.input(container.querySelector('#api-key-input'), { target: { value: 'gsk_bad' } });

      await fireEvent.click(container.querySelector('#btn-test-api'));

      await waitFor(() => expect(container.querySelector('#api-key-status').textContent)
        .toBe('❌ Invalid API key. Please check your key.'));
      expect(/** @type {any[]} */ (fetchMock.mock.calls[0])[1].headers.Authorization).toBe('Bearer gsk_bad');
    });

    it('hides a success message after 5s, but not a newer one early', async () => {
      vi.useFakeTimers();
      try {
        const { container } = render(Settings);
        const input = container.querySelector('#api-key-input');
        await fireEvent.input(input, { target: { value: 'gsk_one' } });
        await fireEvent.click(container.querySelector('#btn-save-api'));
        vi.advanceTimersByTime(4000);
        await fireEvent.input(input, { target: { value: 'nope' } });
        await fireEvent.click(container.querySelector('#btn-save-api')); // newer error message

        vi.advanceTimersByTime(1500); // the first message's 5s have passed
        await tick();
        expect(container.querySelector('#api-key-status').textContent).toContain('Keys start with gsk_');

        vi.advanceTimersByTime(4000);
        await tick();
        expect(container.querySelector('#api-key-status').textContent).toBe('');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('shared quota panel', () => {
    it('is hidden without shared-quota usage', () => {
      const { container } = render(Settings);
      expect(container.querySelector('#quota-panel').classList.contains('hidden')).toBe(true);
    });

    it('shows usage bars, amber past 80% and red when spent', () => {
      quota.usage = { chatRequests: 170, whisperSeconds: 600.4 };
      const { container } = render(Settings);
      expect(container.querySelector('#quota-panel').classList.contains('hidden')).toBe(false);
      expect(container.querySelector('#quota-chat-count').textContent).toBe('170 / 200');
      expect(q(container, '#quota-chat-fill').style.width).toBe('85%');
      expect(q(container, '#quota-chat-fill').style.background).toBe('var(--warn)');
      expect(container.querySelector('#quota-whisper-count').textContent).toBe('601s / 600s');
      expect(q(container, '#quota-whisper-fill').style.background).toBe('var(--wrong)');
    });
  });
});
