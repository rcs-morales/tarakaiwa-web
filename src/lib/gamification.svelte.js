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

// ─────────────────────────────────────────────
// WEEKLY VIEW — streak circles + XP chart (Progress screen)
// ─────────────────────────────────────────────

/**
 * The current Monday-first week as 7 day objects for the Progress screen:
 * [{ label, key, xp, practiced, isToday, isFuture }], plus weekXP (total XP
 * earned this week). XP per day = correct answers that day × XP_PER_CORRECT.
 */
export function computeWeek(entries, now = new Date()) {
  const xpByDay = new Map();
  const playedDays = new Set();
  for (const e of entries) {
    const k = dayKey(e.at);
    playedDays.add(k);
    xpByDay.set(k, (xpByDay.get(k) || 0) + (e.score || 0) * XP_PER_CORRECT);
  }

  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // back to Monday
  const todayKey = dayKey(now);
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  let weekXP = 0;
  const days = labels.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = dayKey(d);
    const xp = xpByDay.get(key) || 0;
    weekXP += xp;
    return {
      label,
      key,
      xp,
      practiced: playedDays.has(key),
      isToday: key === todayKey,
      isFuture: key > todayKey, // zero-padded yyyy-mm-dd compares lexicographically
    };
  });
  return { days, weekXP };
}

// ─────────────────────────────────────────────
// BADGES — achievement catalog derived from history
// ─────────────────────────────────────────────
//
// Same philosophy as XP: purely presentational over the retained history
// (capped at 100 entries) — no separate persisted store, so badges reflect
// what the record shows. Every condition below is derivable from entries.

/** Longest run of consecutive practice days anywhere in the record. */
function bestStreakDays(entries) {
  const days = [...new Set(entries.map((e) => dayKey(e.at)))].sort();
  let best = 0;
  let run = 0;
  let prevMs = null;
  for (const k of days) {
    const ms = Date.parse(k); // UTC midnight — uniform for day arithmetic
    run = prevMs !== null && ms - prevMs === 86_400_000 ? run + 1 : 1;
    if (run > best) best = run;
    prevMs = ms;
  }
  return best;
}

function badgeFacts(entries) {
  const { totalXP, level } = computeXP(entries);
  const perDay = new Map();
  let perfectSessions = 0;
  for (const e of entries) {
    const k = dayKey(e.at);
    perDay.set(k, (perDay.get(k) || 0) + 1);
    if (e.total > 0 && e.score === e.total) perfectSessions++;
  }
  const goalDays = [...perDay.values()].filter((n) => n >= DAILY_GOAL_DEFAULT).length;
  return {
    sessions: entries.length,
    totalXP,
    level,
    perfectSessions,
    goalDays,
    bestStreak: bestStreakDays(entries),
  };
}

/** tint: which card palette the earned tile uses — 'amber' | 'green' | 'primary'. */
export const BADGES = [
  { id: 'first-session', emoji: '🌱', caption: 'はじめの一歩', label: 'First session',   tint: 'green',   test: (f) => f.sessions >= 1 },
  { id: 'streak-3',      emoji: '🔥', caption: '3日連続',      label: '3-day streak',    tint: 'amber',   test: (f) => f.bestStreak >= 3 },
  { id: 'streak-7',      emoji: '🏅', caption: '7日連続',      label: '7-day streak keeper', tint: 'amber', test: (f) => f.bestStreak >= 7 },
  { id: 'streak-30',     emoji: '👑', caption: '30日連続',     label: '30-day streak',   tint: 'amber',   test: (f) => f.bestStreak >= 30 },
  { id: 'perfect',       emoji: '🎯', caption: '満点',         label: 'Perfect score',   tint: 'green',   test: (f) => f.perfectSessions >= 1 },
  { id: 'perfect-5',     emoji: '💎', caption: '満点×5',       label: '5 perfect scores', tint: 'primary', test: (f) => f.perfectSessions >= 5 },
  { id: 'goal-day',      emoji: '⚡', caption: '目標達成',     label: 'Daily goal met',  tint: 'primary', test: (f) => f.goalDays >= 1 },
  { id: 'sessions-10',   emoji: '📚', caption: '十回練習',     label: '10 sessions',     tint: 'green',   test: (f) => f.sessions >= 10 },
  { id: 'sessions-50',   emoji: '🎓', caption: '五十回',       label: '50 sessions',     tint: 'green',   test: (f) => f.sessions >= 50 },
  { id: 'level-5',       emoji: '⭐', caption: '話し手',       label: 'Reach Lv 5',      tint: 'primary', test: (f) => f.level >= 5 },
  { id: 'level-10',      emoji: '🚀', caption: 'Lv 10',        label: 'Reach Lv 10',     tint: 'amber',   test: (f) => f.level >= 10 },
  { id: 'xp-1000',       emoji: '✨', caption: '千XP',         label: 'Earn 1,000 XP',   tint: 'primary', test: (f) => f.totalXP >= 1000 },
];

/**
 * Evaluate the catalog against a history array.
 * Returns { badges: [{ ...def, earned }], earnedCount, total }.
 */
export function computeBadges(entries) {
  const facts = badgeFacts(entries);
  const badges = BADGES.map((b) => ({ ...b, earned: b.test(facts) }));
  return { badges, earnedCount: badges.filter((b) => b.earned).length, total: BADGES.length };
}

/**
 * Badges that flipped to earned because of the newest entry — i.e. earned on
 * the full history but not without entries[0]. Results calls this right after
 * recordSession prepends the finished run, to show the "new badge" banner.
 */
export function newlyEarnedBadges(entries) {
  if (!entries.length) return [];
  const before = new Set(
    computeBadges(entries.slice(1)).badges.filter((b) => b.earned).map((b) => b.id)
  );
  return computeBadges(entries).badges.filter((b) => b.earned && !before.has(b.id));
}
