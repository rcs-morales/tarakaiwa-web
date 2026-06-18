import { describe, it, expect, beforeEach } from 'vitest';
import { get, set, remove, KEYS } from '../src/settings.js';

describe('settings.js', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null for unknown keys with no default', () => {
    expect(get('nonexistent_key')).toBeNull();
  });

  it('returns stored values when present', () => {
    localStorage.setItem(KEYS.JLPT_LEVEL, 'N3');
    expect(get(KEYS.JLPT_LEVEL)).toBe('N3');
  });

  it('falls back to defaults for known keys', () => {
    expect(get(KEYS.JLPT_LEVEL)).toBe('N5');
    expect(get(KEYS.STT_MODE)).toBe('ai');
    expect(get(KEYS.TTS_MODE)).toBe('browser');
    expect(get(KEYS.VOICEVOX_SPEAKER)).toBe('3');
    expect(get(KEYS.AVATAR_MODEL)).toBe('simple');
    expect(get(KEYS.TTS_SPEED)).toBe('0.85');
  });

  it('set() writes values readable by get()', () => {
    set(KEYS.JLPT_LEVEL, 'N4');
    expect(get(KEYS.JLPT_LEVEL)).toBe('N4');
  });

  it('remove() clears stored values', () => {
    set(KEYS.API_KEY, 'gsk_test');
    remove(KEYS.API_KEY);
    expect(get(KEYS.API_KEY)).toBeNull();
  });
});
