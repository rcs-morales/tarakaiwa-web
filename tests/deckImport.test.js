import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { flushSync } from 'svelte';
// avatar.js loads the Live2D runtime at import (not available in jsdom).
vi.mock('$lib/avatar.js', () => ({ initAvatar: vi.fn() }));
vi.mock('$lib/import.js', () => ({ handleFileImport: vi.fn() }));

import Decks from '../src/lib/components/Decks.svelte';
import { deckImport, showImportStatus, pickDeckFile } from '../src/lib/deckImport.svelte.js';
import { showImportStatus as fromUi } from '../src/lib/ui.js';
import { handleFileImport } from '$lib/import.js';

describe('deck import status', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    deckImport.status = { message: '', type: '' };
  });
  afterEach(() => vi.useRealTimers());

  it('is still reachable through ui.js', () => {
    expect(fromUi).toBe(showImportStatus);
  });

  it('hides success and error messages after 5s', () => {
    showImportStatus('✅ Imported', 'success');
    expect(deckImport.status).toEqual({ message: '✅ Imported', type: 'success' });
    vi.advanceTimersByTime(5000);
    expect(deckImport.status).toEqual({ message: '', type: '' });
  });

  it('keeps info messages', () => {
    showImportStatus('Syncing…', 'info');
    vi.advanceTimersByTime(10000);
    expect(deckImport.status.type).toBe('info');
  });

  it("doesn't let an earlier message's timer hide a newer one", () => {
    showImportStatus('❌ Bad file', 'error');
    vi.advanceTimersByTime(4000);
    showImportStatus('✅ Imported', 'success');
    vi.advanceTimersByTime(1500); // the error's 5s are up
    expect(deckImport.status.message).toBe('✅ Imported');
    vi.advanceTimersByTime(3500);
    expect(deckImport.status.message).toBe('');
  });

  it('a newer info message also cancels the old hide timer', () => {
    showImportStatus('✅ Imported', 'success');
    showImportStatus('✅ Imported (⚠️ cloud sync failed)', 'info');
    vi.advanceTimersByTime(6000);
    expect(deckImport.status.type).toBe('info');
  });
});

describe('Decks import controls', () => {
  beforeEach(() => {
    localStorage.clear();
    deckImport.status = { message: '', type: '' };
    vi.mocked(handleFileImport).mockClear();
  });

  it('renders the status line from state', () => {
    const { container } = render(Decks);
    const status = container.querySelector('#import-status');
    expect([...status.classList].filter((c) => !c.startsWith('svelte-'))).toEqual(['import-status']);
    showImportStatus('✅ Successfully imported 3 questions', 'success');
    flushSync();
    expect(status.classList.contains('success')).toBe(true);
    expect(status.textContent).toBe('✅ Successfully imported 3 questions');
  });

  it('"Import a deck" and pickDeckFile() open the file input', async () => {
    const { container, getByText, unmount } = render(Decks);
    const input = /** @type {HTMLInputElement} */ (container.querySelector('#file-input'));
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    await fireEvent.click(getByText(/Import a deck/));
    expect(click).toHaveBeenCalledTimes(1);
    pickDeckFile(); // the onboarding sheet's route
    expect(click).toHaveBeenCalledTimes(2);

    unmount();
    pickDeckFile(); // no input mounted — nothing to open
    expect(click).toHaveBeenCalledTimes(2);
  });

  it('hands a picked file to the importer', async () => {
    const { container } = render(Decks);
    const input = container.querySelector('#file-input');
    await fireEvent.change(input);
    expect(handleFileImport).toHaveBeenCalledTimes(1);
  });
});
