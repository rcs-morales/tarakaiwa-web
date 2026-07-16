// ─────────────────────────────────────────────
// DECKS — multi-deck list + active-deck pointer (Phase 5d step 5)
// ─────────────────────────────────────────────
//
// Local-first: everything here works fully offline. When signed in, sync.js
// dual-writes/pulls each deck as its own row in the `decks` table (see
// pushDeck/syncDecks there) — this module owns the local list + active
// pointer and hands the practice session its `qa` via setQA().
//
// The built-in "Sample deck" (today's tutorial DEFAULT_QA slice) is
// synthesized in memory with id: null — never persisted, never deletable —
// and null is used consistently as its id everywhere a deck id is stored
// (session.activeDeckId, history entries' deckId, the cloud deck_id column)
// so there's no separate sentinel to reconcile.

import { DEFAULT_QA } from './data.js';
import { get, set, KEYS } from './settings.js';
import { setQA } from './session.svelte.js';
import { bestScoreForDeck as bestScoreFromHistory } from './history.svelte.js';
import { history } from './history.svelte.js';
import { pushDeck } from './sync.js';

/** Shared cap on questions per deck — applies to manual entry and file import alike. */
export const MAX_DECK_QUESTIONS = 23;

const SAMPLE_DECK = Object.freeze({
  id: null,
  name: 'Sample deck',
  subtitle: 'はじめての会話 · Starter questions',
  jlptLevel: 'N5',
  qa: DEFAULT_QA.slice(0, 10),
  builtin: true,
});

function loadList() {
  const raw = get(KEYS.DECKS);
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    } catch { /* fall through to migration */ }
  }
  return migrateLegacyDeck();
}

/** One-time migration from the pre-multi-deck single QA_DATA key. */
function migrateLegacyDeck() {
  const raw = get(KEYS.QA_DATA);
  if (!raw) return [];
  try {
    const qa = JSON.parse(raw);
    if (!Array.isArray(qa) || qa.length === 0) return [];
    const deck = {
      id: get(KEYS.DECK_ID) || crypto.randomUUID(),
      name: 'My Deck',
      jlptLevel: get(KEYS.JLPT_LEVEL),
      qa,
      updatedAt: new Date().toISOString(),
    };
    persistList([deck]);
    set(KEYS.ACTIVE_DECK_ID, deck.id);
    return [deck];
  } catch (e) {
    console.error('legacy deck migration failed:', e.message || e);
    return [];
  }
}

function persistList(list) {
  set(KEYS.DECKS, JSON.stringify(list));
}

/** Reactive deck list + active pointer. list excludes the built-in Sample deck. */
export const decks = $state({
  list: loadList(),
  activeId: get(KEYS.ACTIVE_DECK_ID) || null,
});

/** All decks including the built-in Sample deck, for rendering. */
export function allDecks() {
  return [SAMPLE_DECK, ...decks.list];
}

function findDeck(id) {
  if (id === null) return SAMPLE_DECK;
  return decks.list.find((d) => d.id === id) || null;
}

/** Load whichever deck is active into the practice session. Call once on boot. */
export function loadActiveDeckIntoSession() {
  const deck = findDeck(decks.activeId) || SAMPLE_DECK;
  if (deck.builtin) decks.activeId = null;
  setQA(deck.qa, { isDefault: !!deck.builtin, deckId: deck.builtin ? null : deck.id });
}

/** Import a freshly parsed Q&A file as a new deck, make it active, and sync it up. */
export function importDeck(qa, name) {
  const deck = {
    id: crypto.randomUUID(),
    name: name || 'My Deck',
    jlptLevel: get(KEYS.JLPT_LEVEL),
    qa,
    updatedAt: new Date().toISOString(),
  };
  decks.list = [...decks.list, deck];
  persistList(decks.list);
  setActiveDeck(deck.id);
  return pushDeck(deck);
}

/** Create a deck from hand-typed questions. Same path as file import — see importDeck. */
export function createDeck(name, qa) {
  return importDeck(qa, name);
}

/** Switch the active deck and load its qa into the practice session. */
export function setActiveDeck(id) {
  const deck = findDeck(id);
  if (!deck) return;
  decks.activeId = deck.builtin ? null : deck.id;
  set(KEYS.ACTIVE_DECK_ID, decks.activeId || '');
  setQA(deck.qa, { isDefault: !!deck.builtin, deckId: deck.builtin ? null : deck.id });
}

/** Best score percentage recorded for this deck, or null if never played. */
export function bestScoreForDeck(id) {
  return bestScoreFromHistory(history.entries, id);
}

/**
 * Adopt the already-merged deck list sync.js computed from local + remote
 * (see sync.js's syncDecks) as the new local list. Called from app.js's
 * 'deck-list-synced' listener, decoupled the same way settings-synced /
 * deck-synced always have been.
 */
export function adoptSyncedDecks(mergedList) {
  decks.list = mergedList;
  persistList(mergedList);
}
