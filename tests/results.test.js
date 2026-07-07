import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';

const { mockSession } = vi.hoisted(() => ({
  mockSession: { qa: [], current: 0, score: 0, results: [], isDefaultDeck: false },
}));
vi.mock('$lib/session.svelte.js', () => ({ session: mockSession }));

import Results from '../src/lib/components/Results.svelte';

describe('Results screen', () => {
  beforeEach(() => {
    mockSession.score = 0;
    mockSession.results = [];
  });

  it('renders the score hero and per-question rows from session state', () => {
    mockSession.score = 1;
    mockSession.results = [
      { q: 'お名前は？', a: '田中です。', transcript: '田中です', correct: true },
      { q: 'お元気ですか？', a: '元気です。', transcript: '(skipped)', correct: false },
    ];

    const { container } = render(Results);
    // Phase 5d score card shows the percentage as the hero, with "N / total correct" beneath.
    expect(container.querySelector('#score-display').textContent).toBe('50%');
    expect(container.querySelector('#score-bar').style.width).toBe('50%');
    expect(container.textContent).toContain('1 / 2 correct');
    expect(container.textContent).toContain('Good effort');

    const rows = container.querySelectorAll('.result-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].classList.contains('c')).toBe(true);
    expect(rows[1].classList.contains('w')).toBe(true);
    expect(rows[1].textContent).toContain('(skipped)');
  });

  it('renders AI feedback breakdown cards with category tags', () => {
    mockSession.score = 0;
    mockSession.results = [{
      q: 'Q', a: 'A', transcript: 'B', correct: false,
      gradeResult: {
        source: 'groq',
        general_feedback: 'Close, but the particle is wrong.',
        breakdown: [{ original: 'は', corrected: 'が', category: 'Particle', explanation: 'Subject marker needed.' }],
      },
    }];

    const { container } = render(Results);
    expect(container.textContent).toContain('Close, but the particle is wrong.');
    const tag = container.querySelector('.rich-breakdown-tag');
    expect(tag.classList.contains('rich-tag-particle')).toBe(true);
    expect(container.textContent).toContain('Subject marker needed.');
  });

  it('keeps the restart button for the app.js binding', () => {
    const { container } = render(Results);
    expect(container.querySelector('#btn-restart-app')).not.toBeNull();
  });
});
