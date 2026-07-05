import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';

const { mockSession, startPractice } = vi.hoisted(() => ({
  mockSession: { qa: [], current: 0, score: 0, results: [], isDefaultDeck: false },
  startPractice: vi.fn(),
}));

vi.mock('$lib/session.svelte.js', () => ({
  session: mockSession,
  startPractice,
}));

import Dashboard from '../src/lib/components/Dashboard.svelte';
import { history, recordSession } from '../src/lib/history.svelte.js';

describe('Practice dashboard', () => {
  beforeEach(() => {
    localStorage.clear();
    history.entries = [];
    mockSession.qa = [];
    mockSession.isDefaultDeck = false;
    startPractice.mockClear();
  });

  it('disables the start button when no deck is loaded', () => {
    const { container } = render(Dashboard);
    const btn = container.querySelector('#btn-start-practice');
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('Import a deck');
  });

  it('starts practice from the CTA when a deck is ready', async () => {
    mockSession.qa = [{ q: 'q', a: 'a' }];
    mockSession.isDefaultDeck = true;
    const { container } = render(Dashboard);

    const btn = container.querySelector('#btn-start-practice');
    expect(btn.disabled).toBe(false);
    expect(container.textContent).toContain('Sample deck · 1 questions');

    btn.click();
    expect(startPractice).toHaveBeenCalledOnce();
  });

  it('shows zeroed stats and the empty hint before any session', () => {
    const { container } = render(Dashboard);
    expect(container.textContent).toContain('sessions');
    expect(container.textContent).toContain('after your first session');
  });

  it('renders stats and the recent list from history', () => {
    recordSession({ score: 8, total: 10, jlpt: 'N5' });
    recordSession({ score: 6, total: 10, jlpt: 'N4' });

    const { container } = render(Dashboard);
    // avg of 80% and 60% = 70%; both today → 1-day streak; 2 sessions
    expect(container.textContent).toContain('70%');
    expect(container.textContent).toContain('Recent sessions');
    expect(container.textContent).toContain('6/10 · 60%');
    expect(screen.getAllByText('Today')).toHaveLength(2);
  });

  it('keeps the imperative AI-status chip nodes in the DOM', () => {
    const { container } = render(Dashboard);
    expect(container.querySelector('#ai-status-chip')).not.toBeNull();
    expect(container.querySelector('#ai-status-text')).not.toBeNull();
  });
});
