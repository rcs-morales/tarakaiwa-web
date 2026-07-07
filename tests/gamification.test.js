import { describe, it, expect } from 'vitest';
import {
  computeXP, computeWeek, computeBadges, newlyEarnedBadges,
  XP_PER_CORRECT, BADGES,
} from '../src/lib/gamification.svelte.js';

/** ISO timestamp n days before now (local). */
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const run = (score, total, at = new Date().toISOString()) => ({ at, score, total, jlpt: 'N5' });

describe('computeWeek', () => {
  it('maps this week Monday-first with per-day XP and today flagged', () => {
    const now = new Date();
    const entries = [run(5, 10), run(3, 10)]; // both today
    const week = computeWeek(entries, now);

    expect(week.days).toHaveLength(7);
    expect(week.days.map((d) => d.label)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);

    const today = week.days.find((d) => d.isToday);
    expect(today.practiced).toBe(true);
    expect(today.xp).toBe(8 * XP_PER_CORRECT);
    expect(week.weekXP).toBe(8 * XP_PER_CORRECT);

    // Monday-first ordering: days after today are future, none before are.
    const todayIdx = week.days.indexOf(today);
    expect(week.days.slice(todayIdx + 1).every((d) => d.isFuture)).toBe(true);
    expect(week.days.slice(0, todayIdx).every((d) => !d.isFuture)).toBe(true);
  });

  it('marks a zero-score session day as practiced with 0 XP', () => {
    const week = computeWeek([run(0, 10)]);
    const today = week.days.find((d) => d.isToday);
    expect(today.practiced).toBe(true);
    expect(today.xp).toBe(0);
  });
});

describe('computeBadges', () => {
  it('locks the whole catalog on an empty record', () => {
    const shelf = computeBadges([]);
    expect(shelf.total).toBe(BADGES.length);
    expect(shelf.earnedCount).toBe(0);
    expect(shelf.badges.every((b) => b.earned === false)).toBe(true);
  });

  it('earns first-session and perfect from one perfect run', () => {
    const shelf = computeBadges([run(10, 10)]);
    const earned = new Set(shelf.badges.filter((b) => b.earned).map((b) => b.id));
    expect(earned.has('first-session')).toBe(true);
    expect(earned.has('perfect')).toBe(true);
    expect(earned.has('streak-3')).toBe(false);
    expect(earned.has('sessions-10')).toBe(false);
  });

  it('earns streak badges from the best consecutive-day run anywhere in history', () => {
    // 7 consecutive days ending 3 days ago — a broken current streak still counts.
    const entries = [3, 4, 5, 6, 7, 8, 9].map((n) => run(2, 10, daysAgo(n)));
    const earned = new Set(computeBadges(entries).badges.filter((b) => b.earned).map((b) => b.id));
    expect(earned.has('streak-3')).toBe(true);
    expect(earned.has('streak-7')).toBe(true);
    expect(earned.has('streak-30')).toBe(false);
  });

  it('earns goal-day when any day has 3+ sessions', () => {
    const entries = [run(1, 10), run(1, 10), run(1, 10)]; // all today
    const earned = new Set(computeBadges(entries).badges.filter((b) => b.earned).map((b) => b.id));
    expect(earned.has('goal-day')).toBe(true);
  });

  it('earns level and XP badges from lifetime correct answers', () => {
    // 100 correct = 2000 XP = level 6.
    const entries = Array.from({ length: 10 }, () => run(10, 10));
    expect(computeXP(entries).totalXP).toBe(2000);
    const earned = new Set(computeBadges(entries).badges.filter((b) => b.earned).map((b) => b.id));
    expect(earned.has('level-5')).toBe(true);
    expect(earned.has('xp-1000')).toBe(true);
    expect(earned.has('level-10')).toBe(false);
  });
});

describe('newlyEarnedBadges', () => {
  it('returns only badges the newest entry flipped', () => {
    // 9 prior imperfect sessions; the newest (10th) is perfect.
    const prior = Array.from({ length: 9 }, (_, i) => run(5, 10, daysAgo(i + 1)));
    const entries = [run(10, 10), ...prior];

    const fresh = newlyEarnedBadges(entries).map((b) => b.id);
    expect(fresh).toContain('perfect');     // first perfect run
    expect(fresh).toContain('sessions-10'); // 10th session
    expect(fresh).not.toContain('first-session'); // earned long before
  });

  it('is empty when the newest entry unlocks nothing new', () => {
    // first-session was already earned by the older entry alone, and a 2-day
    // streak / 2 sessions crosses no other threshold.
    const entries = [run(5, 10), run(6, 10, daysAgo(1))];
    expect(newlyEarnedBadges(entries)).toEqual([]);
  });

  it('is empty on an empty record', () => {
    expect(newlyEarnedBadges([])).toEqual([]);
  });
});
