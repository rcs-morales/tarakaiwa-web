import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
// avatar.js loads the Live2D runtime at import (not available in jsdom).
vi.mock('$lib/avatar.js', () => ({ initAvatar: vi.fn() }));

import Decks from '../src/lib/components/Decks.svelte';
import { initPrefs } from '../src/lib/prefs.svelte.js';
import { get, KEYS } from '../src/lib/settings.js';

describe('Decks shuffle toggle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is on by default and saves when turned off', async () => {
    initPrefs();
    const { container } = render(Decks);
    const box = container.querySelector('#shuffle-questions-checkbox');
    expect(box.checked).toBe(true);

    await fireEvent.click(box);

    expect(get(KEYS.SHUFFLE_QUESTIONS)).toBe('0');
  });

  it('shows a stored "off" choice', () => {
    localStorage.setItem('shuffle_questions', '0');
    initPrefs();
    const { container } = render(Decks);
    expect(container.querySelector('#shuffle-questions-checkbox').checked).toBe(false);
  });
});
