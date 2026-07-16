import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KEYS } from '../src/lib/settings.js';

vi.mock('../src/lib/session.svelte.js', () => ({ setQA: vi.fn() }));
vi.mock('../src/lib/sync.js', () => ({ pushDeck: vi.fn(async () => true) }));

// decks.svelte.js computes its reactive `decks` state once at module load
// time (from localStorage), so each test needs a fresh module instance —
// reset the registry and re-import everything together after seeding
// localStorage for that scenario.
async function load() {
  vi.resetModules();
  const session = await import('../src/lib/session.svelte.js');
  const sync = await import('../src/lib/sync.js');
  const historyModule = await import('../src/lib/history.svelte.js');
  const decksModule = await import('../src/lib/decks.svelte.js');
  return { session, sync, historyModule, decksModule };
}

describe('decks.svelte.js', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('synthesizes only the built-in Sample deck when nothing is stored', async () => {
    const { decksModule } = await load();
    const all = decksModule.allDecks();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBeNull();
    expect(all[0].name).toBe('Sample deck');
    expect(decksModule.decks.activeId).toBeNull();
  });

  it('migrates a legacy single-deck QA_DATA into the new list on first load', async () => {
    localStorage.setItem(KEYS.QA_DATA, JSON.stringify([{ q: 'q', a: 'a' }]));
    localStorage.setItem(KEYS.JLPT_LEVEL, 'N4');

    const { decksModule } = await load();

    expect(decksModule.decks.list).toHaveLength(1);
    expect(decksModule.decks.list[0].name).toBe('My Deck');
    expect(decksModule.decks.list[0].jlptLevel).toBe('N4');
    expect(decksModule.decks.activeId).toBe(decksModule.decks.list[0].id);
  });

  it('importDeck adds a deck, makes it active, loads it into the session, and pushes to the cloud', async () => {
    const { decksModule, session, sync } = await load();
    const qa = [{ q: 'hi', a: 'hello' }];

    await decksModule.importDeck(qa, 'my-file.json');

    expect(decksModule.decks.list).toHaveLength(1);
    const deck = decksModule.decks.list[0];
    expect(deck.qa).toEqual(qa);
    expect(deck.name).toBe('my-file.json');
    expect(decksModule.decks.activeId).toBe(deck.id);
    expect(session.setQA).toHaveBeenCalledWith(qa, { isDefault: false, deckId: deck.id });
    expect(sync.pushDeck).toHaveBeenCalledWith(expect.objectContaining({ id: deck.id, qa, name: 'my-file.json' }));
  });

  it('createDeck is a thin wrapper over importDeck (manual entry uses the same path)', async () => {
    const { decksModule, session, sync } = await load();
    const qa = [{ q: 'hand-typed q', a: 'hand-typed a' }];

    await decksModule.createDeck('Hand Typed', qa);

    expect(decksModule.decks.list).toHaveLength(1);
    const deck = decksModule.decks.list[0];
    expect(deck.qa).toEqual(qa);
    expect(deck.name).toBe('Hand Typed');
    expect(decksModule.decks.activeId).toBe(deck.id);
    expect(session.setQA).toHaveBeenCalledWith(qa, { isDefault: false, deckId: deck.id });
    expect(sync.pushDeck).toHaveBeenCalledWith(expect.objectContaining({ id: deck.id, qa, name: 'Hand Typed' }));
  });

  it('setActiveDeck switches back to the built-in Sample deck', async () => {
    const { decksModule, session } = await load();
    await decksModule.importDeck([{ q: 'q', a: 'a' }], 'deck1.json');
    session.setQA.mockClear();

    decksModule.setActiveDeck(null);

    expect(decksModule.decks.activeId).toBeNull();
    expect(session.setQA).toHaveBeenCalledWith(expect.any(Array), { isDefault: true, deckId: null });
  });

  it('bestScoreForDeck reflects recorded history scoped to that deck', async () => {
    const { decksModule, historyModule } = await load();
    await decksModule.importDeck([{ q: 'q', a: 'a' }], 'deck1.json');
    const id = decksModule.decks.list[0].id;

    historyModule.history.entries = [
      { at: new Date().toISOString(), score: 8, total: 10, deckId: id },
      { at: new Date().toISOString(), score: 5, total: 10, deckId: id },
      { at: new Date().toISOString(), score: 9, total: 10, deckId: null },
    ];

    expect(decksModule.bestScoreForDeck(id)).toBe(80);
    expect(decksModule.bestScoreForDeck(null)).toBe(90);
    expect(decksModule.bestScoreForDeck('never-played')).toBeNull();
  });

  it('adoptSyncedDecks replaces the local list and persists it', async () => {
    const { decksModule } = await load();
    const merged = [{ id: 'remote-1', name: 'Remote deck', jlptLevel: 'N3', qa: [{ q: 'q', a: 'a' }], updatedAt: new Date().toISOString() }];

    decksModule.adoptSyncedDecks(merged);

    expect(decksModule.decks.list).toEqual(merged);
    expect(JSON.parse(localStorage.getItem(KEYS.DECKS))).toEqual(merged);
  });
});
