import { describe, it, expect, beforeEach } from 'vitest';
import { prefs, setAid, setDailyGoal, initPrefs, DAILY_GOAL_MIN, DAILY_GOAL_MAX } from '../src/lib/prefs.svelte.js';
import { get, KEYS } from '../src/lib/settings.js';

describe('prefs.svelte.js — learning aids + daily goal', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    initPrefs();
  });

  it('defaults: all aids on, goal 3, no hide classes on <body>', () => {
    expect(prefs.furigana).toBe(true);
    expect(prefs.romaji).toBe(true);
    expect(prefs.enHints).toBe(true);
    expect(prefs.dailyGoal).toBe(3);
    expect(document.body.className).toBe('');
  });

  it('turning an aid off persists it and stamps the body class', () => {
    setAid('furigana', false);

    expect(get(KEYS.SHOW_FURIGANA)).toBe('0');
    expect(document.body.classList.contains('aids-hide-furigana')).toBe(true);
    // the other aids are untouched
    expect(document.body.classList.contains('aids-hide-romaji')).toBe(false);
    expect(document.body.classList.contains('aids-hide-en')).toBe(false);

    setAid('furigana', true);
    expect(get(KEYS.SHOW_FURIGANA)).toBe('1');
    expect(document.body.classList.contains('aids-hide-furigana')).toBe(false);
  });

  it('initPrefs restores stored values and classes', () => {
    localStorage.setItem(KEYS.SHOW_ROMAJI, '0');
    localStorage.setItem(KEYS.SHOW_EN_HINTS, '0');
    localStorage.setItem(KEYS.DAILY_GOAL, '5');

    initPrefs();

    expect(prefs.romaji).toBe(false);
    expect(prefs.enHints).toBe(false);
    expect(prefs.dailyGoal).toBe(5);
    expect(document.body.classList.contains('aids-hide-romaji')).toBe(true);
    expect(document.body.classList.contains('aids-hide-en')).toBe(true);
  });

  it('re-reads settings after a login pull (settings-synced)', () => {
    localStorage.setItem(KEYS.SHOW_FURIGANA, '0');
    localStorage.setItem(KEYS.DAILY_GOAL, '7');

    window.dispatchEvent(new CustomEvent('settings-synced'));

    expect(prefs.furigana).toBe(false);
    expect(prefs.dailyGoal).toBe(7);
    expect(document.body.classList.contains('aids-hide-furigana')).toBe(true);
  });

  it('clamps the daily goal to its bounds and persists it', () => {
    setDailyGoal(DAILY_GOAL_MAX + 5);
    expect(prefs.dailyGoal).toBe(DAILY_GOAL_MAX);
    expect(get(KEYS.DAILY_GOAL)).toBe(String(DAILY_GOAL_MAX));

    setDailyGoal(DAILY_GOAL_MIN - 5);
    expect(prefs.dailyGoal).toBe(DAILY_GOAL_MIN);

    setDailyGoal(NaN);
    expect(prefs.dailyGoal).toBe(3); // falls back to the default

    localStorage.setItem(KEYS.DAILY_GOAL, 'garbage');
    initPrefs();
    expect(prefs.dailyGoal).toBe(3);
  });

  it('ignores unknown aid names', () => {
    setAid('nonsense', false);
    expect(document.body.className).toBe('');
  });
});
