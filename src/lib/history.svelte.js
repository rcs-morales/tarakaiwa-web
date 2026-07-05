// ─────────────────────────────────────────────
// SESSION HISTORY — local record + dashboard stats (Phase 5c)
// ─────────────────────────────────────────────
//
// Every finished practice run is recorded to a device-local localStorage key
// (KEYS.SESSION_HISTORY, capped) so the dashboard has instant stats without a
// network round-trip — signed in or not. When the user IS signed in,
// syncFromRemote() swaps the in-memory view for the session_results table
// (their cross-device record); localStorage keeps only locally-played runs
// and is never overwritten by remote data.

import { get, set, KEYS } from './settings.js';
import { fetchSessionHistory } from './sync.js';

const MAX_ENTRIES = 100;

function loadLocal() {
  try {
    const raw = get(KEYS.SESSION_HISTORY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Reactive history view, newest first: [{ at, score, total, jlpt }] */
export const history = $state({ entries: loadLocal() });

/** Record a finished run (always local; cloud insert is sync.js's job). */
export function recordSession({ score, total, jlpt }) {
  const entry = { at: new Date().toISOString(), score, total, jlpt };
  const local = [entry, ...loadLocal()].slice(0, MAX_ENTRIES);
  set(KEYS.SESSION_HISTORY, JSON.stringify(local));
  // The in-memory view may be showing remote entries — prepend there too so
  // the dashboard updates instantly either way.
  history.entries = [entry, ...history.entries].slice(0, MAX_ENTRIES);
}

/**
 * Replace the in-memory view with the signed-in user's cross-device history.
 * No-op when logged out or when the fetch fails (local view stays).
 */
export async function syncFromRemote() {
  const remote = await fetchSessionHistory(MAX_ENTRIES);
  if (Array.isArray(remote)) history.entries = remote;
}

/** Reset the view to this device's local record (call on sign-out). */
export function resetToLocal() {
  history.entries = loadLocal();
}

/** yyyy-mm-dd in local time — streaks are calendar days where the user lives. */
function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Dashboard stats over a history array (newest first).
 * - sessions: total recorded runs
 * - avgPct: mean score percentage over the most recent 30 runs
 * - streakDays: consecutive practice days ending today, or yesterday (an
 *   unbroken streak isn't lost until a full day is missed)
 */
export function computeStats(entries) {
  const sessions = entries.length;

  const recent = entries.slice(0, 30);
  const avgPct = recent.length
    ? Math.round(recent.reduce((sum, e) => sum + (e.total ? e.score / e.total : 0), 0) / recent.length * 100)
    : 0;

  const days = new Set(entries.map((e) => dayKey(e.at)));
  const cursor = new Date();
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1); // grace: yesterday keeps it alive
  let streakDays = 0;
  while (days.has(dayKey(cursor))) {
    streakDays++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { sessions, avgPct, streakDays };
}
