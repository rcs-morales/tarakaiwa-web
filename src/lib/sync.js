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
//  - QA_DATA / DECK_ID / DECK_UPDATED_AT: legacy single-deck keys, read once
//    for migration only (see decks.svelte.js)
//  - DECKS: large; each deck lives in the `decks` table instead (syncDecks)
//  - ACTIVE_DECK_ID: device-local pointer, not meaningful cross-device
//  - WHATS_NEW_SEEN: device-local, so a signed-in user still sees the
//    announcement once on each device rather than it syncing away silently
const SYNC_EXCLUDE = new Set([
  KEYS.API_KEY,
  KEYS.API_PROVIDER,
  KEYS.TTS_DEFAULT_FLAG,
  KEYS.QA_DATA,
  KEYS.DECK_ID,
  KEYS.DECK_UPDATED_AT,
  KEYS.DECKS,
  KEYS.ACTIVE_DECK_ID,
  KEYS.SESSION_HISTORY, // device-local; the cloud record is session_results
  KEYS.WHATS_NEW_SEEN,
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
//
// Each deck is its own row (id = client-generated uuid, reused as-is for the
// `decks.id` primary key), so — unlike settings — there is no single-pointer
// reconciliation to do: pushing a deck is always an upsert keyed by its own
// id, and pulling merges the remote list into the local list by id.

/**
 * Create or update one deck's row in Supabase. Called by decks.svelte.js
 * after a fresh import and (via syncDecks below) for any local-only deck
 * discovered on login.
 *
 * @param {{ id: string, name: string, jlptLevel: string, qa: any[] }} deck
 * @returns {Promise<boolean|null>} true = pushed, false = failed, null = logged out
 */
export async function pushDeck(deck) {
  const user = getCurrentUser();
  if (!user) return null;

  const row = {
    id: deck.id,
    user_id: user.id,
    name: deck.name || 'My Deck',
    jlpt_level: deck.jlptLevel,
    qa: deck.qa,
    updated_at: deck.updatedAt || new Date().toISOString(),
  };

  try {
    const { error } = await supabaseClient.from('decks').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('deck push failed:', e.message || e);
    return false;
  }
}

/**
 * Delete one deck's row in Supabase. Called by decks.svelte.js's deleteDeck
 * so a locally-deleted deck doesn't get resurrected by syncDecks' pull-merge
 * on next login.
 *
 * @param {string} id
 * @returns {Promise<boolean|null>} true = deleted, false = failed, null = logged out
 */
export async function deleteDeckRemote(id) {
  const user = getCurrentUser();
  if (!user) return null;

  try {
    const { error } = await supabaseClient
      .from('decks')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('deck delete failed:', e.message || e);
    return false;
  }
}

/**
 * On login: pull every remote deck, merge with the local list by id (remote
 * wins unless the local copy is newer), push up any local-only decks, then
 * hand the merged list to the app via a 'deck-list-synced' event —
 * decoupled the same way settings-synced always has been, so this module
 * never imports decks.svelte.js.
 *
 * @param {Array<{id, name, jlptLevel, qa, updatedAt}>} localList
 */
async function syncDecks(localList = []) {
  const user = getCurrentUser();
  if (!user) return;

  const { data, error } = await supabaseClient
    .from('decks')
    .select('id, name, jlpt_level, qa, updated_at')
    .eq('user_id', user.id);

  if (error) {
    console.error('deck pull failed:', error.message);
    return;
  }

  const remoteById = new Map((data || []).map((r) => [r.id, {
    id: r.id, name: r.name, jlptLevel: r.jlpt_level, qa: r.qa, updatedAt: r.updated_at,
  }]));

  const merged = [];
  const toPush = [];

  for (const [id, remote] of remoteById) {
    const local = localList.find((d) => d.id === id);
    // A local edit made while offline (or whose upload was interrupted)
    // must not be reverted by an older remote copy.
    if (local?.updatedAt && Date.parse(local.updatedAt) > Date.parse(remote.updatedAt)) {
      merged.push(local);
      toPush.push(local);
    } else {
      merged.push(remote);
    }
  }

  for (const local of localList) {
    if (!remoteById.has(local.id)) {
      merged.push(local);
      toPush.push(local);
    }
  }

  await Promise.all(toPush.map((d) => pushDeck(d)));

  window.dispatchEvent(new CustomEvent('deck-list-synced', { detail: { list: merged } }));
}

// ─────────────────────────────────────────────
// Session results
// ─────────────────────────────────────────────

/**
 * Fire-and-forget insert of a completed practice run. Never throws.
 * @param {{ jlpt_level?: string, score: number, total: number, results: any[], deckId?: string|null }} payload
 */
export async function saveSessionResult(payload) {
  const user = getCurrentUser();
  if (!user) return;

  try {
    const { error } = await supabaseClient.from('session_results').insert({
      user_id: user.id,
      deck_id: payload.deckId ?? null,
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
 * Delete all session_results rows for the signed-in user (progress reset).
 * No-op when logged out. Returns true on success, false on error.
 */
export async function deleteAllSessionResults() {
  const user = getCurrentUser();
  if (!user) return false;

  try {
    const { error } = await supabaseClient
      .from('session_results')
      .delete()
      .eq('user_id', user.id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('session results delete failed:', e.message || e);
    return false;
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
    .select('created_at, score, total, jlpt_level, deck_id')
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
    deckId: r.deck_id,
  }));
}

// ─────────────────────────────────────────────
// Orchestration
// ─────────────────────────────────────────────

/**
 * Run the full pull/merge on login. Safe to call more than once.
 * @param {Array<{id, name, jlptLevel, qa, updatedAt}>} localDecksList
 */
export async function onLogin(localDecksList) {
  if (!isLoggedIn()) return;
  await pullMergeSettings();
  await syncDecks(localDecksList);
}

/** No device-local sync pointers to clear anymore — decks keep their own ids. */
export function onLogout() {}
