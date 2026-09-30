import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';

const { mockDecks, setActiveDeck, bestScoreForDeck } = vi.hoisted(() => ({
  mockDecks: { list: [], activeId: null },
  setActiveDeck: vi.fn(),
  bestScoreForDeck: vi.fn(() => null),
}));

vi.mock('../src/lib/decks.svelte.js', () => ({
  decks: mockDecks,
  allDecks: () => [{ id: null, name: 'Sample deck', jlptLevel: 'N5', qa: [{ q: 'q', a: 'a' }], builtin: true }],
  setActiveDeck,
  bestScoreForDeck,
  createDeck: vi.fn(),
  updateDeck: vi.fn(),
  deleteDeck: vi.fn(),
  MAX_DECK_QUESTIONS: 23,
}));

import Decks from '../src/lib/components/Decks.svelte';
import { SCENARIOS } from '../src/lib/scenarios.js';

describe('Decks screen — Scenarios section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDecks.list = [];
    mockDecks.activeId = null;
  });

  it('renders one read-only card per scenario, with turns, level, and best score', () => {
    bestScoreForDeck.mockImplementation((id) => (id === 'scenario:cafe' ? 80 : null));
    const { container } = render(Decks);

    const cards = container.querySelectorAll('.scenario-card');
    expect(cards).toHaveLength(SCENARIOS.length);

    const cafe = SCENARIOS.find((s) => s.id === 'cafe');
    const cafeCard = [...cards].find((c) => c.textContent.includes(cafe.titleJp));
    expect(cafeCard.textContent).toContain(cafe.title);
    expect(cafeCard.textContent).toContain(`${cafe.beats.length} turns`);
    expect(cafeCard.textContent).toContain(`JLPT ${cafe.jlptLevel}`);
    expect(cafeCard.textContent).toContain('Best 80%');

    for (const card of cards) {
      expect(card.closest('.deck-card-wrap').querySelector('.deck-edit-btn')).toBeNull();
    }
  });

  it('selecting a scenario makes it the active item', async () => {
    const { container } = render(Decks);
    const directions = SCENARIOS.find((s) => s.id === 'directions');
    const card = [...container.querySelectorAll('.scenario-card')]
      .find((c) => c.textContent.includes(directions.titleJp));

    await fireEvent.click(card);

    expect(setActiveDeck).toHaveBeenCalledWith('scenario:directions');
  });

  it('marks the active scenario as in use', () => {
    mockDecks.activeId = 'scenario:cafe';
    const { container } = render(Decks);

    const active = container.querySelector('.scenario-card.active');
    expect(active.textContent).toContain(SCENARIOS.find((s) => s.id === 'cafe').titleJp);
    expect(active.closest('.deck-card-wrap').querySelector('.deck-inuse-pill')).not.toBeNull();
    // The Sample deck isn't in use at the same time.
    expect(container.querySelectorAll('.deck-inuse-pill')).toHaveLength(1);
  });
});
