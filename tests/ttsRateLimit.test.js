import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { preloadVoicevoxAudio, preloadAllVoicevoxAudio, isVoicevoxRateLimited } from '../src/lib/tts.js';

vi.mock('../src/lib/ui.js', () => ({ setStatus: vi.fn() }));
vi.mock('../src/lib/avatar.js', () => ({ toggleSpeaking: vi.fn() }));
vi.mock('../src/lib/settings.js', () => ({
  get: vi.fn(() => '3'),
  set: vi.fn(),
  KEYS: { TTS_MODE: 'tts_mode', VOICEVOX_SPEAKER: 'voicevox_speaker', TTS_SPEED: 'tts_speed', AVATAR_MODEL: 'avatar_model' },
}));
vi.mock('../src/lib/db.js', () => ({
  getAudio: vi.fn(async () => null),
  saveAudio: vi.fn(async () => {}),
}));

// The 429 cooldown is module state keyed on Date.now() — each test starts on
// fake timers far enough ahead of the previous one that no cooldown carries over.
let clock = Date.parse('2026-01-01T00:00:00Z');

describe('Voicevox 429 backoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    clock += 60 * 60_000;
    vi.setSystemTime(clock);
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 429, ok: false })));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('a 429 returns null and arms the shared cooldown', async () => {
    const blob = await preloadVoicevoxAudio('こんにちは');
    expect(blob).toBeNull();
    expect(isVoicevoxRateLimited()).toBe(true);

    // cooldown expires on its own
    vi.setSystemTime(clock + 61_000);
    expect(isVoicevoxRateLimited()).toBe(false);
  });

  it('batch waits out cooldowns and stops after repeated 429s instead of hammering', async () => {
    const done = preloadAllVoicevoxAudio(['あ', 'い', 'う', 'え', 'お'], null, { cancelled: false });

    // Simulate ~10 minutes: enough for 3 cooldown cycles, then the batch stops.
    let resolved = false;
    done.then(() => { resolved = true; });
    for (let i = 0; i < 150 && !resolved; i++) {
      await vi.advanceTimersByTimeAsync(5_000);
    }

    expect(resolved).toBe(true);
    // One synthesis attempt per cooldown cycle — 3 total, not one every 5s.
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('pauses the batch while the tab is hidden', async () => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    const done = preloadAllVoicevoxAudio(['あ'], null, { cancelled: false });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetch).not.toHaveBeenCalled();

    // Tab becomes visible again → the batch resumes (and here trips the 429 path).
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    let resolved = false;
    done.then(() => { resolved = true; });
    for (let i = 0; i < 150 && !resolved; i++) {
      await vi.advanceTimersByTimeAsync(5_000);
    }
    expect(fetch).toHaveBeenCalled();
    expect(resolved).toBe(true);
  });

  it('cancellation stops the batch even mid-cooldown', async () => {
    const signal = { cancelled: false };
    const done = preloadAllVoicevoxAudio(['あ', 'い'], null, signal);

    await vi.advanceTimersByTimeAsync(5_000); // first attempt → 429 → cooldown
    signal.cancelled = true;

    let resolved = false;
    done.then(() => { resolved = true; });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(resolved).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
