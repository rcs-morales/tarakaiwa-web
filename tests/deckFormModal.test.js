import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent, waitFor } from '@testing-library/dom';

vi.mock('../src/lib/decks.svelte.js', () => ({
  createDeck: vi.fn(async () => true),
  updateDeck: vi.fn(async () => true),
  deleteDeck: vi.fn(async () => true),
  MAX_DECK_QUESTIONS: 23,
}));

vi.mock('../src/lib/ui.js', () => ({
  showImportStatus: vi.fn(),
}));

import DeckFormModal from '../src/lib/components/DeckFormModal.svelte';
import { createDeck, updateDeck, deleteDeck } from '../src/lib/decks.svelte.js';
import { showImportStatus } from '../src/lib/ui.js';
import { set, KEYS } from '../src/lib/settings.js';

const sampleDeck = {
  id: 'deck-1',
  name: 'My Deck',
  jlptLevel: 'N4',
  qa: [{ q: 'q1', a: 'a1' }, { q: 'q2', a: 'a2' }],
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('DeckFormModal', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function fillRow(container, i, q, a) {
    const rows = container.querySelectorAll('.cdm-row');
    const inputs = rows[i].querySelectorAll('input');
    return Promise.all([
      fireEvent.input(inputs[0], { target: { value: q } }),
      fireEvent.input(inputs[1], { target: { value: a } }),
    ]);
  }

  describe('create mode', () => {
    it('shows the currently inherited JLPT level', () => {
      set(KEYS.JLPT_LEVEL, 'N3');
      render(DeckFormModal, { onclose: vi.fn() });
      expect(screen.getByText(/JLPT N3/)).toBeTruthy();
    });

    it('starts with two empty rows and adds rows up to the 23 cap', async () => {
      const { container } = render(DeckFormModal, { onclose: vi.fn() });
      expect(container.querySelectorAll('.cdm-row')).toHaveLength(2);

      const addBtn = screen.getByRole('button', { name: /Add question/ });
      for (let i = 0; i < 21; i++) {
        await fireEvent.click(addBtn);
      }

      expect(container.querySelectorAll('.cdm-row')).toHaveLength(23);
      expect(addBtn.disabled).toBe(true);
    });

    it('disables Save until at least one row has both a question and an answer', async () => {
      const { container } = render(DeckFormModal, { onclose: vi.fn() });
      const saveBtn = screen.getByRole('button', { name: /Save deck/ });
      expect(saveBtn.disabled).toBe(true);

      await fillRow(container, 0, 'こんにちは', 'Hello');
      expect(saveBtn.disabled).toBe(false);
    });

    it('saves only the filled, trimmed rows and closes the modal', async () => {
      const onclose = vi.fn();
      const { container } = render(DeckFormModal, { onclose });

      await fillRow(container, 0, '  こんにちは  ', '  Hello  ');
      // second row left blank — should be dropped, not sent to createDeck

      const saveBtn = screen.getByRole('button', { name: /Save deck/ });
      await fireEvent.click(saveBtn);

      expect(createDeck).toHaveBeenCalledWith(undefined, [{ q: 'こんにちは', a: 'Hello' }]);
      await waitFor(() => expect(onclose).toHaveBeenCalled());
      expect(showImportStatus).toHaveBeenCalledWith(expect.stringContaining('Created'), 'success');
    });

    it('does not show a Delete button', () => {
      render(DeckFormModal, { onclose: vi.fn() });
      expect(screen.queryByRole('button', { name: /Delete deck/ })).toBeNull();
    });
  });

  describe('edit mode', () => {
    it('pre-fills name and rows from the deck prop, and shows edit-mode chrome', () => {
      const { container } = render(DeckFormModal, { deck: sampleDeck, onclose: vi.fn() });
      expect(container.querySelector('#cdm-name').value).toBe('My Deck');

      const rows = container.querySelectorAll('.cdm-row');
      expect(rows).toHaveLength(2);
      const firstInputs = rows[0].querySelectorAll('input');
      expect(firstInputs[0].value).toBe('q1');
      expect(firstInputs[1].value).toBe('a1');

      expect(screen.getByText('✏️ Edit deck')).toBeTruthy();
      expect(screen.getByRole('button', { name: /Save changes/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Delete deck/ })).toBeTruthy();
    });

    it("shows the deck's creation-time level, not the create-mode reminder", () => {
      render(DeckFormModal, { deck: sampleDeck, onclose: vi.fn() });
      expect(screen.getByText(/JLPT N4/)).toBeTruthy();
      expect(screen.queryByText(/New decks use your current level/)).toBeNull();
    });

    it('save calls updateDeck with the deck id and the edited rows', async () => {
      const onclose = vi.fn();
      const { container } = render(DeckFormModal, { deck: sampleDeck, onclose });
      const rows = container.querySelectorAll('.cdm-row');
      const firstInputs = rows[0].querySelectorAll('input');
      await fireEvent.input(firstInputs[1], { target: { value: 'edited answer' } });

      const saveBtn = screen.getByRole('button', { name: /Save changes/ });
      await fireEvent.click(saveBtn);

      expect(updateDeck).toHaveBeenCalledWith('deck-1', {
        name: 'My Deck',
        qa: [{ q: 'q1', a: 'edited answer' }, { q: 'q2', a: 'a2' }],
      });
      await waitFor(() => expect(onclose).toHaveBeenCalled());
      expect(showImportStatus).toHaveBeenCalledWith(expect.stringContaining('updated'), 'success');
    });

    it('Delete deck asks for confirmation and calls deleteDeck when confirmed', async () => {
      vi.stubGlobal('confirm', vi.fn(() => true));
      const onclose = vi.fn();
      render(DeckFormModal, { deck: sampleDeck, onclose });

      await fireEvent.click(screen.getByRole('button', { name: /Delete deck/ }));

      expect(deleteDeck).toHaveBeenCalledWith('deck-1');
      await waitFor(() => expect(onclose).toHaveBeenCalled());
    });

    it('Delete deck warns about cloud sync failure but still closes when deleteDeck resolves false', async () => {
      vi.stubGlobal('confirm', vi.fn(() => true));
      deleteDeck.mockResolvedValueOnce(false);
      const onclose = vi.fn();
      render(DeckFormModal, { deck: sampleDeck, onclose });

      await fireEvent.click(screen.getByRole('button', { name: /Delete deck/ }));

      expect(deleteDeck).toHaveBeenCalledWith('deck-1');
      await waitFor(() => expect(onclose).toHaveBeenCalled());
      expect(showImportStatus).toHaveBeenCalledWith(
        expect.stringContaining('cloud sync failed'),
        'info'
      );
    });

    it('Delete deck does nothing when the confirmation is dismissed', async () => {
      vi.stubGlobal('confirm', vi.fn(() => false));
      const onclose = vi.fn();
      render(DeckFormModal, { deck: sampleDeck, onclose });

      await fireEvent.click(screen.getByRole('button', { name: /Delete deck/ }));

      expect(deleteDeck).not.toHaveBeenCalled();
      expect(onclose).not.toHaveBeenCalled();
    });
  });
});
