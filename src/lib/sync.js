// ─────────────────────────────────────────────
// SYNC MODULE — localStorage ⇄ Supabase (logged-in only)
// ─────────────────────────────────────────────
//
// Everything here is a no-op unless a user is signed in, so the offline /
// logged-out experience is unchanged. It syncs three things:
//   1. settings   → user_settings.settings (jsonb), debounced upsert
//   2. decks      → decks table (dual-write on import, pull latest on login)
//   3. results    → session_results (fire-and-forget insert on finish)
//
// Decoupled from the UI: instead of importing session.js / ui.js (which would
// create import cycles), it dispatches window CustomEvents that app.js listens
// for — 'settings-synced' and 'deck-synced'.

import { supabaseClient } from './supabase.js';
import { getCurrentUser, isLoggedIn } from './auth.js';
import { KEYS, get, onChange } from './settings.js';

// Keys that must NOT leave the device / go into user_settings:
//  - API_KEY / API_PROVIDER: secret, per-device BYO key
//  - TTS_DEFAULT_FLAG: one-time device migration flag
//  - QA_DATA: large; lives in the `decks` table instead
//  - DECK_ID: device-local pointer to the synced deck row
const SYNC_EXCLUDE = new Set([
  KEYS.API_KEY,
  KEYS.API_PROVIDER,
  KEYS.TTS_DEFAULT_FLAG,
  KEYS.QA_DATA,
  KEYS.DECK_ID,
  KEYS.DECK_UPDATED_AT,
  KEYS.SESSION_HISTORY, // device-local; the cloud record is session_results
]);

const SYNC_KEYS = Object.values(KEYS).filter((k) => !SYNC_EXCLUDE.has(k));

// ─────────────────────────────────────────────
// Settings sync
// ─────────────────────────────────────────────

let pushTimer = null;

/** Install the settings change hook. Call once on boot. */
export function registerSettingsSync() {
  onChange((key) => {
    if (!isLoggedIn()) return;
    if (SYNC_EXCLUDE.has(key)) return;
    schedulePush();
  });
}

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushSettings(); }, 1500);
}

function snapshotSettings() {
  const obj = {};
  for (const k of SYNC_KEYS) {
    const v = localStorage.getItem(k);
    if (v !== null) obj[k] = v;
  }
  return obj;
}

async function pushSettings() {
  const user = getCurrentUser();
  if (!user) return;
  const { error } = await supabaseClient
    .from('user_settings')
    .upsert({
      user_id: user.id,
      settings: snapshotSettings(),
      updated_at: new Date().toISOString(),
    });
  if (error) console.error('settings push failed:', error.message);
}

/**
 * On login: pull the remote settings blob (remote wins for keys it holds),
 * write them through to localStorage, then push a merged snapshot back up so
 * any local-only keys are captured / the row is created on first login.
 */
async function pullMergeSettings() {
  const user = getCurrentUser();
  if (!user) return;

  const { data, error } = await supabaseClient
    .from('user_settings')
    .select('settings')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('settings pull failed:', error.message);
    return;
  }

  if (data?.settings && typeof data.settings === 'object') {
    for (const [k, v] of Object.entries(data.settings)) {
      // Write raw (not via settings.set) so we don't re-trigger the push hook
      // once per key.
      if (SYNC_KEYS.includes(k) && v != null) localStorage.setItem(k, String(v));
    }
    // Let app.js refresh the wizard selects / avatar from the new values.
    window.dispatchEvent(new CustomEvent('settings-synced'));
  }

  await pushSettings();
}

// ─────────────────────────────────────────────
// Deck sync
// ─────────────────────────────────────────────

/**
 * Create or update the user's synced deck row from a freshly imported deck.
 * Called by import.js after a successful local import (dual-write). Reuses the
 * device-local DECK_ID when present, otherwise inserts a new row.
 *
 * @returns {Promise<boolean|null>} true = pushed, false = failed, null = logged out
 */
export async function pushDeck(qa, name) {
  const user = getCurrentUser();
  if (!user) return null;

  const row = {
    user_id: user.id,
    name: name || 'My Deck',
    jlpt_level: get(KEYS.JLPT_LEVEL),
    qa,
    updated_at: new Date().toISOString(),
  };

  const deckId = localStorage.getItem(KEYS.DECK_ID);
  try {
    if (deckId) {
      const { data, error } = await supabaseClient
        .from('decks')
        .update(row)
        .eq('id', deckId)
        .eq('user_id', user.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        // Stale pointer — the row no longer exists (0 rows matched, which
        // Supabase does not treat as an error). Drop it and insert fresh.
        localStorage.removeItem(KEYS.DECK_ID);
        return pushDeck(qa, name);
      }
    } else {
      const { data, error } = await supabaseClient
        .from('decks')
        .insert(row)
        .select('id')
        .single();
      if (error) throw error;
      if (data?.id) localStorage.setItem(KEYS.DECK_ID, data.id);
    }
    localStorage.setItem(KEYS.DECK_UPDATED_AT, row.updated_at);
    return true;
  } catch (e) {
    console.error('deck push failed:', e.message || e);
    return false;
  }
}

/**
 * On login: pull the most-recently-updated remote deck (if any) and hand it to
 * the app via a 'deck-synced' event. If the user has no remote decks but has a
 * non-default local deck, push that up as their first deck (migration).
 *
 * @param {boolean} hasLocalCustomDeck — QA_DATA is set to a user-imported deck
 */
async function syncDecks(hasLocalCustomDeck) {
  const user = getCurrentUser();
  if (!user) return;

  const { data, error } = await supabaseClient
    .from('decks')
    .select('id, name, qa, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('deck pull failed:', error.message);
    return;
  }

  const remote = data && data[0];
  if (remote && Array.isArray(remote.qa) && remote.qa.length > 0) {
    // Last-write-wins: only let the remote deck replace the local one when it
    // is actually newer. A local import whose upload was interrupted (page
    // reload, OAuth redirect, network drop) must not be reverted on login.
    const localTs = localStorage.getItem(KEYS.DECK_UPDATED_AT);
    const remoteNewer = !hasLocalCustomDeck || !localTs
      || Date.parse(remote.updated_at) > Date.parse(localTs);

    localStorage.setItem(KEYS.DECK_ID, remote.id);
    if (remoteNewer) {
      localStorage.setItem(KEYS.DECK_UPDATED_AT, remote.updated_at);
      window.dispatchEvent(new CustomEvent('deck-synced', {
        detail: { qa: remote.qa, name: remote.name },
      }));
    } else {
      // Local deck is newer — push it up (re-uses the remote row via DECK_ID).
      await pushLocalDeck();
    }
    return;
  }

  // No usable remote deck — migrate the local custom deck up, if there is one.
  if (hasLocalCustomDeck) await pushLocalDeck();
}

/** Push the deck currently in localStorage up to Supabase. */
async function pushLocalDeck() {
  const raw = localStorage.getItem(KEYS.QA_DATA);
  if (!raw) return;
  try {
    const qa = JSON.parse(raw);
    if (Array.isArray(qa) && qa.length > 0) await pushDeck(qa, 'My Deck');
  } catch (e) {
    console.error('deck migration parse failed:', e.message || e);
  }
}

// ─────────────────────────────────────────────
// Session results
// ─────────────────────────────────────────────

/**
 * Fire-and-forget insert of a completed practice run. Never throws.
 * @param {{ jlpt_level?: string, score: number, total: number, results: any[] }} payload
 */
export async function saveSessionResult(payload) {
  const user = getCurrentUser();
  if (!user) return;

  const deckId = localStorage.getItem(KEYS.DECK_ID) || null;
  try {
    const { error } = await supabaseClient.from('session_results').insert({
      user_id: user.id,
      deck_id: deckId,
      jlpt_level: payload.jlpt_level ?? get(KEYS.JLPT_LEVEL),
      score: payload.score,
      total: payload.total,
      results: payload.results,
    });
    if (error) throw error;
  } catch (e) {
    console.error('session result save failed:', e.message || e);
  }
}

/**
 * Fetch the signed-in user's recent practice runs (newest first) in the
 * shape history.svelte.js uses. Returns null when logged out or on error.
 */
export async function fetchSessionHistory(limit = 100) {
  const user = getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabaseClient
    .from('session_results')
    .select('created_at, score, total, jlpt_level')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('session history fetch failed:', error.message);
    return null;
  }
  return (data || []).map((r) => ({
    at: r.created_at,
    score: r.score,
    total: r.total,
    jlpt: r.jlpt_level,
  }));
}

// ─────────────────────────────────────────────
// Orchestration
// ─────────────────────────────────────────────

/**
 * Run the full pull/merge on login. Safe to call more than once.
 * @param {boolean} hasLocalCustomDeck
 */
export async function onLogin(hasLocalCustomDeck) {
  if (!isLoggedIn()) return;
  await pullMergeSettings();
  await syncDecks(hasLocalCustomDeck);
}

/** Clear device-local sync pointers on sign-out (keeps synced data on server). */
export function onLogout() {
  localStorage.removeItem(KEYS.DECK_ID);
}
