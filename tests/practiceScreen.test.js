import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';

const { mockSession, handlers } = vi.hoisted(() => {
  const names = [
    'endSession', 'finishRecording', 'checkAnswer', 'editTranscript', 'saveEditedTranscript',
    'cancelEditTranscript', 'rerecordAnswer', 'nextQuestion', 'skipQuestion', 'revealAnswerHint',
    'restartApp', 'startPractice',
  ];
  return {
    mockSession: { qa: [], current: 0, score: 0, results: [], isDefaultDeck: false, jlptLevel: 'N5' },
    handlers: Object.fromEntries(names.map((n) => [n, vi.fn()])),
  };
});
vi.mock('$lib/session.svelte.js', () => ({ session: mockSession, ...handlers }));

import Practice from '../src/lib/components/Practice.svelte';
import Results from '../src/lib/components/Results.svelte';
import Dashboard from '../src/lib/components/Dashboard.svelte';
import { practiceView } from '../src/lib/practiceView.svelte.js';
import {
  setStatus, showBtn, showMicWarning, showStartScreen, showPracticeScreen, showResultsScreen,
} from '../src/lib/ui.js';

function resetView() {
  practiceView.screen = 'start';
  practiceView.status = { state: '', text: 'Initializing...' };
  for (const k of Object.keys(practiceView.buttons)) practiceView.buttons[k] = false;
  practiceView.buttons.skip = true;
  practiceView.micWarning = false;
}

describe('Practice tab screens', () => {
  beforeEach(() => {
    resetView();
    Object.values(handlers).forEach((fn) => fn.mockClear());
    mockSession.qa = [{ q: 'Q1', a: 'A1' }, { q: 'Q2', a: 'A2' }, { q: 'Q3', a: 'A3' }];
    mockSession.current = 0;
    localStorage.clear();
  });

  it('shows exactly one of Dashboard / Practice / Results', async () => {
    const dash = render(Dashboard).container.querySelector('#screen-start');
    const prac = render(Practice).container.querySelector('#screen-practice');
    const res = render(Results).container.querySelector('#screen-results');
    const visible = () => [dash, prac, res].map((el) => !el.classList.contains('hidden'));

    expect(visible()).toEqual([true, false, false]);
    showPracticeScreen(); await tick();
    expect(visible()).toEqual([false, true, false]);
    showResultsScreen(); await tick();
    expect(visible()).toEqual([false, false, true]);
    showStartScreen(); await tick();
    expect(visible()).toEqual([true, false, false]);
  });

  it('renders the status line and pulse state', async () => {
    const { container } = render(Practice);
    setStatus('listening', '🎤 Recording…');
    await tick();
    expect(container.querySelector('#status-text').textContent).toBe('🎤 Recording…');
    const dot = container.querySelector('#pulse');
    expect(dot.classList.contains('listening')).toBe(true);

    setStatus('', 'Done');
    await tick();
    expect(['speaking', 'listening', 'checking'].some((c) => dot.classList.contains(c))).toBe(false);
    expect(dot.classList.contains('pulse-dot')).toBe(true);
  });

  it('renders progress from the session (first question)', () => {
    const { container } = render(Practice);
    expect(container.querySelector('#progress-label').textContent).toBe('Question 1 / 3');
    expect(container.querySelector('#progress-bar').style.width).toBe('0%');
  });

  it('renders progress from the session (later question)', () => {
    mockSession.current = 1;
    const { container } = render(Practice);
    expect(container.querySelector('#progress-label').textContent).toBe('Question 2 / 3');
    expect(parseFloat(container.querySelector('#progress-bar').style.width)).toBeCloseTo(33.33, 1);
  });

  it('shows only Skip until the flow reveals other buttons', async () => {
    const { container } = render(Practice);
    const visibleIds = () => [...container.querySelectorAll('.practice-controls button')]
      .filter((b) => !b.classList.contains('hidden')).map((b) => b.id);
    expect(visibleIds()).toEqual(['btn-skip']);

    showBtn('btn-check', true);
    showBtn('btn-edit-transcript', true);
    showBtn('btn-skip', false);
    await tick();
    expect(visibleIds()).toEqual(['btn-check', 'btn-edit-transcript']);
  });

  it('labels Next as Finish Practice on the last question', async () => {
    mockSession.current = 2;
    showBtn('btn-next', true);
    const { container } = render(Practice);
    expect(container.querySelector('#btn-next').textContent).toBe('Finish Practice');
  });

  it('wires each control to the session flow', async () => {
    const { container } = render(Practice);
    for (const k of Object.keys(practiceView.buttons)) practiceView.buttons[k] = true;
    await tick();
    const pairs = {
      'btn-end-session': 'endSession', 'btn-submit': 'finishRecording', 'btn-check': 'checkAnswer',
      'btn-edit-transcript': 'editTranscript', 'btn-save-edit': 'saveEditedTranscript',
      'btn-cancel-edit': 'cancelEditTranscript', 'btn-rerecord': 'rerecordAnswer',
      'btn-next': 'nextQuestion', 'btn-skip': 'skipQuestion', 'btn-hint-prompt': 'revealAnswerHint',
    };
    for (const [id, fn] of Object.entries(pairs)) {
      await fireEvent.click(container.querySelector('#' + id));
      expect(handlers[fn], id).toHaveBeenCalledTimes(1);
    }
  });

  it('shows the mic warning, pointing at the Try again button', async () => {
    const { container } = render(Practice);
    const box = container.querySelector('#warning-box');
    expect(box.style.display).toBe('');
    showMicWarning(true);
    await tick();
    expect(box.style.display).toBe('block');
    expect(box.textContent).toContain('🎤 Try again');
  });

  it('Results: ✕ and Again both leave via restartApp', async () => {
    const { container } = render(Results);
    await fireEvent.click(container.querySelector('.session-end-btn'));
    await fireEvent.click(container.querySelector('#btn-restart-app'));
    expect(handlers.restartApp).toHaveBeenCalledTimes(2);
  });

  it('warns about an unknown button id instead of failing silently', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    showBtn('btn-nope', true);
    expect(warn).toHaveBeenCalledWith('showBtn: unknown button', 'btn-nope');
    warn.mockRestore();
  });
});
