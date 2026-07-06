// ─────────────────────────────────────────────
// GAMIFICATION — derived XP / level / daily-goal (Phase 5d)
// ─────────────────────────────────────────────
//
// Purely presentational state layered over the existing session history: no
// new persisted store. Each correct answer is worth XP_PER_CORRECT; total XP
// is the lifetime sum of correct answers across history.entries, and levels
// are fixed XP_PER_LEVEL bands. Screens derive these on demand from the
// reactive history view (Shell pills, Dashboard/Progress level card, Results).

export const XP_PER_CORRECT = 20;
export const XP_PER_LEVEL = 400;
export const DAILY_GOAL_DEFAULT = 3;

// Level titles by level number (1-indexed); levels past the list reuse the last.
const LEVEL_TITLES = [
  '入門',     // Lv 1 — Beginner
  '初心者',   // Lv 2 — Novice
  '練習生',   // Lv 3 — Trainee
  '見習い',   // Lv 4 — Apprentice
  '話し手',   // Lv 5 — Speaker
  '達人',     // Lv 6 — Expert
  '師範',     // Lv 7+ — Master
];

export function levelTitle(level) {
  return LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1] ?? LEVEL_TITLES[0];
}

/**
 * Derive XP / level facts from a history array (entries: [{ score, total, ... }]).
 * - totalXP:     lifetime XP (correct answers × XP_PER_CORRECT)
 * - level:       1-indexed level from fixed XP_PER_LEVEL bands
 * - xpInLevel:   XP earned within the current level (0..xpForLevel)
 * - xpForLevel:  XP span of a level
 * - xpToNext:    XP remaining until the next level
 * - title:       Japanese rank title for the level
 */
export function computeXP(entries) {
  const totalCorrect = entries.reduce((sum, e) => sum + (e.score || 0), 0);
  const totalXP = totalCorrect * XP_PER_CORRECT;
  const level = Math.floor(totalXP / XP_PER_LEVEL) + 1;
  const xpInLevel = totalXP % XP_PER_LEVEL;
  const xpForLevel = XP_PER_LEVEL;
  const xpToNext = xpForLevel - xpInLevel;
  return { totalXP, level, xpInLevel, xpForLevel, xpToNext, title: levelTitle(level) };
}

/** yyyy-mm-dd in local time — same day definition history.js uses for streaks. */
function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * How many sessions were completed today vs. the daily goal target.
 * - done:   today's entries, capped at target
 * - target: sessions/day goal (default DAILY_GOAL_DEFAULT)
 * - met:    whether the goal is reached
 */
export function computeDailyGoal(entries, target = DAILY_GOAL_DEFAULT) {
  const today = dayKey(new Date());
  const done = entries.reduce((n, e) => n + (dayKey(e.at) === today ? 1 : 0), 0);
  return { done: Math.min(done, target), rawDone: done, target, met: done >= target };
}
