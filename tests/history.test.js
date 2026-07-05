import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/lib/sync.js', () => ({
  fetchSessionHistory: vi.fn(async () => null),
}));

import { history, recordSession, computeStats, syncFromRemote, resetToLocal } from '../src/lib/history.svelte.js';
import { fetchSessionHistory } from '../src/lib/sync.js';
import { KEYS } from '../src/lib/settings.js';

const iso = (daysAgo, hour = 12) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

describe('Session history', () => {
  beforeEach(() => {
    localStorage.clear();
    history.entries = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('records a run to localStorage and the reactive view, newest first', () => {
    recordSession({ score: 7, total: 10, jlpt: 'N5' });
    recordSession({ score: 9, total: 10, jlpt: 'N5' });

    expect(history.entries).toHaveLength(2);
    expect(history.entries[0].score).toBe(9);

    const stored = JSON.parse(localStorage.getItem(KEYS.SESSION_HISTORY));
    expect(stored).toHaveLength(2);
    expect(stored[0].score).toBe(9);
    expect(stored[0].at).toBeTruthy();
  });

  it('caps the local record at 100 entries', () => {
    for (let i = 0; i < 105; i++) recordSession({ score: 1, total: 2, jlpt: 'N5' });
    expect(history.entries).toHaveLength(100);
    expect(JSON.parse(localStorage.getItem(KEYS.SESSION_HISTORY))).toHaveLength(100);
  });

  it('computes averages over the most recent 30 runs', () => {
    const entries = [
      { at: iso(0), score: 10, total: 10 }, // 100%
      { at: iso(1), score: 5, total: 10 },  // 50%
    ];
    expect(computeStats(entries).avgPct).toBe(75);
    expect(computeStats(entries).sessions).toBe(2);
    expect(computeStats([]).avgPct).toBe(0);
    expect(computeStats([{ at: iso(0), score: 3, total: 0 }]).avgPct).toBe(0); // no div-by-zero
  });

  it('counts a streak of consecutive days including today', () => {
    const entries = [iso(0), iso(1), iso(2)].map((at) => ({ at, score: 1, total: 1 }));
    expect(computeStats(entries).streakDays).toBe(3);
  });

  it('keeps the streak alive if today has no session yet (yesterday grace)', () => {
    const entries = [iso(1), iso(2)].map((at) => ({ at, score: 1, total: 1 }));
    expect(computeStats(entries).streakDays).toBe(2);
  });

  it('breaks the streak after a missed day', () => {
    const entries = [iso(0), iso(2), iso(3)].map((at) => ({ at, score: 1, total: 1 }));
    expect(computeStats(entries).streakDays).toBe(1);
  });

  it('swaps to remote history when signed in and back to local on sign-out', async () => {
    recordSession({ score: 1, total: 2, jlpt: 'N5' });
    fetchSessionHistory.mockResolvedValueOnce([
      { at: iso(5), score: 8, total: 10, jlpt: 'N4' },
      { at: iso(6), score: 6, total: 10, jlpt: 'N4' },
    ]);

    await syncFromRemote();
    expect(history.entries).toHaveLength(2);
    expect(history.entries[0].jlpt).toBe('N4');

    resetToLocal();
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0].score).toBe(1);
  });

  it('keeps the local view when the remote fetch fails', async () => {
    recordSession({ score: 1, total: 2, jlpt: 'N5' });
    fetchSessionHistory.mockResolvedValueOnce(null);
    await syncFromRemote();
    expect(history.entries).toHaveLength(1);
  });
});
