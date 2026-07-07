import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';

import Progress from '../src/lib/components/Progress.svelte';
import { history, recordSession } from '../src/lib/history.svelte.js';
import { BADGES } from '../src/lib/gamification.svelte.js';

describe('Progress screen', () => {
  beforeEach(() => {
    localStorage.clear();
    history.entries = [];
  });

  it('renders the empty state: locked shelf, zero weekly XP, level 1', () => {
    const { container } = render(Progress);

    expect(container.textContent).toContain('進捗');
    expect(container.textContent).toContain(`Badges · 0 of ${BADGES.length}`);
    expect(container.textContent).toContain('+0 XP');
    expect(container.textContent).toContain('Lv 1');
    expect(container.querySelectorAll('.badge-tile.locked')).toHaveLength(BADGES.length);
    // 7 streak circles, one of which is today.
    expect(container.querySelectorAll('.week-circle')).toHaveLength(7);
    expect(container.querySelectorAll('.week-circle.today')).toHaveLength(1);
  });

  it('reflects a recorded session in the shelf, chart total, and streak row', () => {
    recordSession({ score: 10, total: 10, jlpt: 'N5' }); // perfect → 2 badges
    const { container } = render(Progress);

    expect(container.textContent).toContain(`Badges · 2 of ${BADGES.length}`);
    expect(container.textContent).toContain('+200 XP'); // 10 correct × 20
    // Today's bar is the vermillion one.
    expect(container.querySelectorAll('.chart-bar.today')).toHaveLength(1);
    expect(container.querySelectorAll('.badge-tile.locked')).toHaveLength(BADGES.length - 2);
  });
});
