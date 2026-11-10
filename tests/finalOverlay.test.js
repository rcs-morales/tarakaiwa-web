import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import {
  finalOverlay, openFinalOverlay, scheduleFinalOverlayFade, closeFinalOverlay,
} from '../src/lib/finalOverlay.svelte.js';
import FinalScoreOverlay from '../src/lib/components/FinalScoreOverlay.svelte';
import { q } from './helpers.js';

describe('Session Complete overlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    closeFinalOverlay();
  });
  afterEach(() => {
    closeFinalOverlay();
    vi.useRealTimers();
  });

  it('is hidden until a session ends', () => {
    const { container } = render(FinalScoreOverlay);
    expect(container.querySelector('#final-score-overlay').classList.contains('hidden')).toBe(true);
  });

  it('shows the score, icon and message', async () => {
    const { container } = render(FinalScoreOverlay);
    openFinalOverlay({ score: 8, total: 10, passed: true, message: 'Great job!' });
    await tick();

    const overlay = q(container, '#final-score-overlay');
    expect(overlay.classList.contains('hidden')).toBe(false);
    expect(overlay.style.opacity).toBe('1');
    expect(container.querySelector('#final-score-icon').textContent).toBe('🎉');
    expect(container.querySelector('#final-score-text').textContent).toContain('8 / 10');
    expect(container.querySelector('#final-score-text').textContent).toContain('Great job!');
  });

  it('uses the keep-practicing icon when not passed', async () => {
    const { container } = render(FinalScoreOverlay);
    openFinalOverlay({ score: 3, total: 10, passed: false, message: 'Keep practicing!' });
    await tick();
    expect(container.querySelector('#final-score-icon').textContent).toBe('💪');
  });

  it('fades out after the delay, then hides', async () => {
    const { container } = render(FinalScoreOverlay);
    const overlay = q(container, '#final-score-overlay');
    openFinalOverlay({ score: 1, total: 1, passed: true, message: 'ok' });
    scheduleFinalOverlayFade(3000);

    vi.advanceTimersByTime(2999);
    await tick();
    expect(overlay.style.opacity).toBe('1');

    vi.advanceTimersByTime(1);
    await tick();
    expect(overlay.style.opacity).toBe('0');
    expect(overlay.classList.contains('hidden')).toBe(false);

    vi.advanceTimersByTime(1000);
    await tick();
    expect(overlay.classList.contains('hidden')).toBe(true);
  });

  it('Close hides it at once and cancels the pending fade', async () => {
    const { container } = render(FinalScoreOverlay);
    openFinalOverlay({ score: 1, total: 1, passed: true, message: 'ok' });
    scheduleFinalOverlayFade(3000);

    await fireEvent.click(container.querySelector('#btn-close-final-overlay'));
    expect(finalOverlay.visible).toBe(false);

    // A new session's overlay must not be hidden by the old timers.
    openFinalOverlay({ score: 2, total: 2, passed: true, message: 'again' });
    vi.advanceTimersByTime(10000);
    expect(finalOverlay.visible).toBe(true);
    expect(finalOverlay.fading).toBe(false);
  });
});
