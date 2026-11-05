import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { speakQuestion } from '../src/lib/tts.js';
import { getAudio } from '../src/lib/db.js';
import { get } from '../src/lib/settings.js';
import { voicevoxLoading } from '../src/lib/voicevoxLoading.svelte.js';
import VoicevoxLoadingOverlay from '../src/lib/components/VoicevoxLoadingOverlay.svelte';

vi.mock('../src/lib/ui.js', () => ({ setStatus: vi.fn() }));
vi.mock('../src/lib/avatar.js', () => ({ toggleSpeaking: vi.fn() }));
vi.mock('../src/lib/settings.js', () => ({
  get: vi.fn(),
  set: vi.fn(),
  KEYS: { TTS_MODE: 'tts_mode', VOICEVOX_SPEAKER: 'voicevox_speaker', TTS_SPEED: 'tts_speed', AVATAR_MODEL: 'avatar_model' },
}));
vi.mock('../src/lib/db.js', () => ({ getAudio: vi.fn(), saveAudio: vi.fn() }));

/** A VOICEVOX audio lookup that resolves when the test says so. */
function slowAudio() {
  /** @type {(b: Blob) => void} */ let resolve = () => {};
  const promise = new Promise((r) => { resolve = r; });
  return { promise, finish: () => resolve(new Blob(['x'], { type: 'audio/wav' })) };
}

describe('VOICEVOX loading overlay', () => {
  const realAudio = globalThis.Audio;

  beforeEach(() => {
    vi.useFakeTimers();
    voicevoxLoading.pending = 0;
    vi.mocked(get).mockImplementation((key) => (key === 'tts_mode' ? 'voicevox' : null));
    URL.createObjectURL = vi.fn(() => 'blob:url');
    URL.revokeObjectURL = vi.fn();
    globalThis.Audio = /** @type {any} */ (class {
      play() { return Promise.resolve(); }
      pause() {}
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.Audio = realAudio;
  });

  it('renders only while a slow fetch is pending', () => {
    const { container } = render(VoicevoxLoadingOverlay);
    expect(container.querySelector('#vv-loading-overlay')).toBeNull();
    voicevoxLoading.pending = 1;
    flushSync();
    expect(container.querySelector('#vv-loading-overlay').textContent).toContain('Loading Cloud Voice');
    voicevoxLoading.pending = 0;
    flushSync();
    expect(container.querySelector('#vv-loading-overlay')).toBeNull();
  });

  it('does not show for a fetch that finishes within 2.5s', async () => {
    const audio = slowAudio();
    vi.mocked(getAudio).mockReturnValueOnce(audio.promise);
    const done = speakQuestion('はやい', vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    audio.finish();
    await done;
    await vi.advanceTimersByTimeAsync(3000);
    expect(voicevoxLoading.pending).toBe(0);
  });

  it('shows after 2.5s and hides when the audio arrives', async () => {
    const audio = slowAudio();
    vi.mocked(getAudio).mockReturnValueOnce(audio.promise);
    const done = speakQuestion('おそい', vi.fn());
    await vi.advanceTimersByTimeAsync(2600);
    expect(voicevoxLoading.pending).toBe(1);
    audio.finish();
    await done;
    expect(voicevoxLoading.pending).toBe(0);
  });

  it('stays up until every overlapping slow fetch has finished', async () => {
    const practice = slowAudio();
    const tool = slowAudio();
    vi.mocked(getAudio).mockReturnValueOnce(practice.promise).mockReturnValueOnce(tool.promise);
    const a = speakQuestion('しつもん', vi.fn(), 'practice');
    const b = speakQuestion('ほんやく', vi.fn(), 'tool');
    await vi.advanceTimersByTimeAsync(2600);
    expect(voicevoxLoading.pending).toBe(2);

    practice.finish();
    await a;
    // The translate tool's audio is still loading — the overlay stays.
    expect(voicevoxLoading.pending).toBe(1);

    tool.finish();
    await b;
    expect(voicevoxLoading.pending).toBe(0);
  });

  it('hides when the audio lookup fails', async () => {
    vi.mocked(getAudio).mockReturnValueOnce(new Promise((_, reject) => setTimeout(() => reject(new Error('offline')), 4000)));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onEnd = vi.fn();
    const done = speakQuestion('しっぱい', onEnd);
    await vi.advanceTimersByTimeAsync(2600);
    expect(voicevoxLoading.pending).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    await done;
    expect(voicevoxLoading.pending).toBe(0);
    expect(onEnd).toHaveBeenCalled();
  });
});
