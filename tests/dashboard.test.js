import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';

const { mockSession, startPractice } = vi.hoisted(() => ({
  mockSession: { qa: [], current: 0, score: 0, results: [], isDefaultDeck: false, jlptLevel: 'N5', scenario: null },
  startPractice: vi.fn(),
}));

vi.mock('$lib/session.svelte.js', () => ({
  session: mockSession,
  startPractice,
}));

import Dashboard from '../src/lib/components/Dashboard.svelte';
import { history, recordSession } from '../src/lib/history.svelte.js';
import { SCENARIOS, scenarioToQA } from '../src/lib/scenarios.js';

describe('Practice dashboard', () => {
  beforeEach(() => {
    localStorage.clear();
    history.entries = [];
    mockSession.qa = [];
    mockSession.isDefaultDeck = false;
    mockSession.scenario = null;
    startPractice.mockClear();
  });

  it('shows the scenario briefing and a scenario summary chip when a scenario is active', () => {
    const cafe = SCENARIOS.find((s) => s.id === 'cafe');
    mockSession.qa = scenarioToQA(cafe);
    mockSession.scenario = cafe;
    const { container } = render(Dashboard);

    const brief = container.querySelector('.scenario-brief');
    expect(brief).not.toBeNull();
    expect(brief.textContent).toContain(cafe.titleJp);
    expect(brief.textContent).toContain(cafe.setting);
    expect(brief.textContent).toContain(cafe.role.jp);
    expect([...brief.querySelectorAll('.scenario-brief-goals li')].map((li) => li.textContent))
      .toEqual(cafe.beats.map((b) => b.goal));
    expect(brief.textContent).toContain(cafe.keyPhrases[0].jp);
    expect(container.textContent).toContain(`${cafe.title} · ${cafe.beats.length} turns`);
    expect(container.querySelector('#btn-start-practice').disabled).toBe(false);
  });

  it('shows no scenario briefing for a normal deck', () => {
    mockSession.qa = [{ q: 'q', a: 'a' }];
    const { container } = render(Dashboard);
    expect(container.querySelector('.scenario-brief')).toBeNull();
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

  it('shows the active deck level in the summary chip, not the global default', () => {
    mockSession.qa = [{ q: 'q', a: 'a' }];
    mockSession.jlptLevel = 'N4';
    const { container } = render(Dashboard);

    expect(container.textContent).toContain('📈 N4');
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
