import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent, waitFor } from '@testing-library/dom';

vi.mock('../src/lib/decks.svelte.js', () => ({
  createDeck: vi.fn(async () => true),
  MAX_DECK_QUESTIONS: 23,
}));

vi.mock('../src/lib/ui.js', () => ({
  showImportStatus: vi.fn(),
}));

import CreateDeckModal from '../src/lib/components/CreateDeckModal.svelte';
import { createDeck } from '../src/lib/decks.svelte.js';
import { showImportStatus } from '../src/lib/ui.js';
import { set, KEYS } from '../src/lib/settings.js';

describe('CreateDeckModal', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  function fillRow(container, i, q, a) {
    const rows = container.querySelectorAll('.cdm-row');
    const inputs = rows[i].querySelectorAll('input');
    return Promise.all([
      fireEvent.input(inputs[0], { target: { value: q } }),
      fireEvent.input(inputs[1], { target: { value: a } }),
    ]);
  }

  it('shows the currently inherited JLPT level', () => {
    set(KEYS.JLPT_LEVEL, 'N3');
    render(CreateDeckModal, { onclose: vi.fn() });
    expect(screen.getByText(/JLPT N3/)).toBeTruthy();
  });

  it('starts with two empty rows and adds rows up to the 23 cap', async () => {
    const { container } = render(CreateDeckModal, { onclose: vi.fn() });
    expect(container.querySelectorAll('.cdm-row')).toHaveLength(2);

    const addBtn = screen.getByRole('button', { name: /Add question/ });
    for (let i = 0; i < 21; i++) {
      await fireEvent.click(addBtn);
    }

    expect(container.querySelectorAll('.cdm-row')).toHaveLength(23);
    expect(addBtn.disabled).toBe(true);
  });

  it('disables Save until at least one row has both a question and an answer', async () => {
    const { container } = render(CreateDeckModal, { onclose: vi.fn() });
    const saveBtn = screen.getByRole('button', { name: /Save deck/ });
    expect(saveBtn.disabled).toBe(true);

    await fillRow(container, 0, 'こんにちは', 'Hello');
    expect(saveBtn.disabled).toBe(false);
  });

  it('saves only the filled, trimmed rows and closes the modal', async () => {
    const onclose = vi.fn();
    const { container } = render(CreateDeckModal, { onclose });

    await fillRow(container, 0, '  こんにちは  ', '  Hello  ');
    // second row left blank — should be dropped, not sent to createDeck

    const saveBtn = screen.getByRole('button', { name: /Save deck/ });
    await fireEvent.click(saveBtn);

    expect(createDeck).toHaveBeenCalledWith(undefined, [{ q: 'こんにちは', a: 'Hello' }]);
    await waitFor(() => expect(onclose).toHaveBeenCalled());
    expect(showImportStatus).toHaveBeenCalledWith(expect.stringContaining('Created'), 'success');
  });
});
