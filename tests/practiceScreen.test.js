import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';

const { mockSession, handlers } = vi.hoisted(() => {
  const names = [
    'endSession', 'finishRecording', 'checkAnswer', 'editTranscript', 'saveEditedTranscript',
    'cancelEditTranscript', 'rerecordAnswer', 'nextQuestion', 'skipQuestion', 'revealAnswerHint',
    'restartApp', 'startPractice', 'toggleQuestionText', 'translateQuestion', 'getQuestionRomaji',
  ];
  return {
    mockSession: { qa: [], current: 0, score: 0, results: [], isDefaultDeck: false, jlptLevel: 'N5' },
    handlers: Object.fromEntries(names.map((n) => [n, vi.fn()])),
  };
});
vi.mock('#lib/session.svelte.js', () => ({ session: mockSession, ...handlers }));

import Practice from '../src/lib/components/Practice.svelte';
import Results from '../src/lib/components/Results.svelte';
import Dashboard from '../src/lib/components/Dashboard.svelte';
import { practiceView, resetQuestionCard, resetAnswerCard, transLine } from '../src/lib/practiceView.svelte.js';
import {
  setStatus, showBtn, showMicWarning, showStartScreen, showPracticeScreen, showResultsScreen,
  showTranscript, showTranscriptIndicator, showCheckedTranscript, showResult, showResultPanel,
} from '../src/lib/ui.js';

function resetView() {
  practiceView.screen = 'start';
  practiceView.status = { state: '', text: 'Initializing...' };
  for (const k of Object.keys(practiceView.buttons)) practiceView.buttons[k] = false;
  practiceView.buttons.skip = true;
  practiceView.micWarning = false;
  resetQuestionCard();
  resetAnswerCard();
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

  describe('question card', () => {
    it('shows the current question text only after Show Text', async () => {
      const { container } = render(Practice);
      const text = container.querySelector('#question-text');
      const btn = container.querySelector('#btn-toggle-question');
      expect(text.textContent).toBe('Q1');
      expect(text.style.display).toBe('none');
      expect(btn.textContent).toBe('👁 Show Text');

      practiceView.question.textVisible = true;
      await tick();
      expect(text.style.display).toBe('block');
      expect(container.querySelector('#translate-row').style.display).toBe('block');
      expect(btn.textContent).toBe('👁 Hide Text');

      await fireEvent.click(btn);
      expect(handlers.toggleQuestionText).toHaveBeenCalled();
    });

    it('pulses Show Text for first-time learners', async () => {
      const { container } = render(Practice);
      practiceView.question.pulse = true;
      await tick();
      expect(container.querySelector('#btn-toggle-question').classList.contains('highlight-pulse')).toBe(true);
    });

    it('labels Translate / Romaji by state and opens their results', async () => {
      const { container } = render(Practice);
      const tLink = container.querySelector('#btn-translate');
      const tResult = container.querySelector('#translate-result');
      expect(tLink.textContent).toBe('🌐 Translate');

      practiceView.question.translate.loading = true;
      await tick();
      expect(tLink.textContent).toBe('⏳ Translating…');
      expect(tLink.classList.contains('loading')).toBe(true);

      Object.assign(practiceView.question.translate, { loading: false, open: true, ok: true, text: 'What is your name?' });
      await tick();
      expect(tLink.textContent).toBe('🌐 Hide Translation');
      expect(tResult.classList.contains('visible')).toBe(true);
      expect(tResult.textContent.trim()).toBe('What is your name?');

      Object.assign(practiceView.question.romaji, { open: true, ok: false, text: '❌ Romaji failed. Try again.' });
      await tick();
      expect(container.querySelector('#btn-romaji').textContent).toBe('🔤 Romaji');
      expect(container.querySelector('#romaji-result').textContent).toBe('❌ Romaji failed. Try again.');
    });

    it('renders the Google Translate fallback as a safe link, and model text as text', async () => {
      const { container } = render(Practice);
      Object.assign(practiceView.question.translate, {
        open: true, ok: false, text: '⚠️ AI Translation unavailable.', fallbackUrl: 'https://translate.google.com/?sl=ja&tl=en&text=x&op=translate',
      });
      await tick();
      const a = container.querySelector('#translate-result a');
      expect(a.getAttribute('href')).toBe('https://translate.google.com/?sl=ja&tl=en&text=x&op=translate');
      expect(a.getAttribute('rel')).toBe('noopener');

      Object.assign(practiceView.question.translate, { ok: true, text: '<img src=x onerror=alert(1)>', fallbackUrl: '' });
      await tick();
      expect(container.querySelector('#translate-result img')).toBeNull();
    });

    it('activates Translate / Romaji from the keyboard', async () => {
      const { container } = render(Practice);
      await fireEvent.keyDown(container.querySelector('#btn-translate'), { key: 'Enter' });
      await fireEvent.keyDown(container.querySelector('#btn-romaji'), { key: ' ' });
      expect(handlers.translateQuestion).toHaveBeenCalledTimes(1);
      expect(handlers.getQuestionRomaji).toHaveBeenCalledTimes(1);
    });

    it('renders the expected-answer box for each kind', async () => {
      const { container } = render(Practice);
      const box = container.querySelector('#target-answer-box');
      const label = container.querySelector('#target-label');
      expect(box.style.display).toBe('');

      Object.assign(practiceView.question.target, { visible: true, kind: 'tutorial', tutorialStep: 2, answer: 'たなかです', romaji: 'tanaka desu' });
      await tick();
      expect(box.style.display).toBe('block');
      expect(label.textContent.trim()).toBe('🎯 Tutorial Mode (2/3) Please say the sample answer clearly:');
      expect(container.querySelector('#target-answer-text').textContent).toBe('たなかです');
      expect(container.querySelector('#target-romaji-text').textContent).toBe('tanaka desu');

      practiceView.question.target.kind = 'answerKey';
      await tick();
      expect(label.textContent).toContain('AI Grading Not Configured');
      expect(label.textContent).toContain('Showing answer key');

      Object.assign(practiceView.question.target, { kind: 'hint', translation: "I'm Tanaka." });
      await tick();
      expect(label.textContent.trim()).toBe('💡 Full Answer');
      expect(container.querySelector('#target-answer-trans').textContent).toBe("I'm Tanaka.");
    });
  });

  describe('transcript', () => {
    it('shows the placeholder, then live text with the box highlighted', async () => {
      const { container } = render(Practice);
      const box = container.querySelector('#transcript-box');
      const ph = container.querySelector('#transcript-placeholder');
      const ct = container.querySelector('#transcript-content');
      expect(ph.classList.contains('hidden')).toBe(false);
      expect(ct.classList.contains('hidden')).toBe(true);

      showTranscript('わたしは', true);
      await tick();
      expect(ph.classList.contains('hidden')).toBe(true);
      expect(ct.textContent.trim()).toBe('わたしは');
      expect(box.classList.contains('active')).toBe(true);

      showTranscript('');
      await tick();
      expect(ph.classList.contains('hidden')).toBe(false);
      expect(box.classList.contains('active')).toBe(false);
    });

    it('shows the AI recording and transcribing indicators', async () => {
      const { container } = render(Practice);
      showTranscriptIndicator('recording');
      await tick();
      expect(container.querySelector('.ai-recording-indicator').textContent).toContain('Recording audio for AI transcription');
      showTranscriptIndicator('transcribing');
      await tick();
      expect(container.querySelector('.ai-recording-indicator')).toBeNull();
      expect(container.querySelector('.ai-transcribing-indicator').textContent).toContain('Transcribing');
    });

    it('edits the transcript in a focused textarea bound to state', async () => {
      const { container } = render(Practice);
      Object.assign(practiceView.answer.transcript, { mode: 'editing', editText: 'たなかです' });
      await tick();
      const ta = container.querySelector('#transcript-edit-input');
      expect(ta.value).toBe('たなかです');
      expect(document.activeElement).toBe(ta);
      expect(ta.selectionStart).toBe(ta.value.length);

      await fireEvent.input(ta, { target: { value: 'たなかです。' } });
      expect(practiceView.answer.transcript.editText).toBe('たなかです。');
    });

    it('shows what was heard, the checked reading and a translation line', async () => {
      const { container } = render(Practice);
      showCheckedTranscript('田中です', 'たなかです', (s) => s + '!');
      practiceView.answer.transcript.checked.userTrans = transLine('You said: <b>I am Tanaka</b>');
      await tick();
      const ct = container.querySelector('#transcript-content');
      expect(ct.textContent).toContain('田中です!');
      expect(ct.textContent).toContain('Checked (reading): たなかです');
      expect(container.querySelector('#user-ans-trans').textContent.trim()).toBe('You said: <b>I am Tanaka</b>');
      expect(container.querySelector('#user-ans-trans b')).toBeNull();
      expect(container.querySelector('#transcript-box').classList.contains('active')).toBe(false);
    });

    it('renders a Google Translate fallback link', async () => {
      const { container } = render(Practice);
      showCheckedTranscript('x', 'x', (s) => s);
      practiceView.answer.transcript.checked.userTrans = transLine('🌐', 'https://translate.google.com/?text=x', 'Translate what you said on Google Translate ↗');
      await tick();
      const a = container.querySelector('#user-ans-trans a');
      expect(a.getAttribute('href')).toBe('https://translate.google.com/?text=x');
      expect(a.getAttribute('rel')).toBe('noopener');
      expect(a.textContent).toBe('Translate what you said on Google Translate ↗');
    });
  });

  describe('result card', () => {
    it('is hidden until a result is shown', async () => {
      const { container } = render(Practice);
      const badge = container.querySelector('#result-badge');
      expect(badge.classList.contains('correct') || badge.classList.contains('wrong')).toBe(false);
    });

    it('shows a correct result with the expected answer, romaji and translation', async () => {
      const { container } = render(Practice);
      showResult({ correct: true, source: 'groq', general_feedback: 'Great job!' }, 'たなかです。');
      practiceView.answer.result.romaji = 'tanaka desu';
      practiceView.answer.result.expTrans = transLine("I'm Tanaka.");
      await tick();
      const badge = container.querySelector('#result-badge');
      expect(badge.classList.contains('correct')).toBe(true);
      expect(container.querySelector('#result-icon').textContent).toBe('✅');
      expect(container.querySelector('#result-msg').textContent).toBe('正解！ Correct!');
      expect(container.querySelector('#answer-reveal strong').textContent).toBe('Expected answer: ');
      expect(container.querySelector('#answer-reveal').textContent).toContain('たなかです。');
      expect(container.querySelector('#expected-ans-romaji').textContent).toBe('tanaka desu');
      expect(container.querySelector('#expected-ans-trans').textContent.trim()).toBe("I'm Tanaka.");
      expect(container.querySelector('#ai-feedback').textContent).toContain('🤖 Great job!');
    });

    it('renders the AI breakdown as text, with category tags', async () => {
      const { container } = render(Practice);
      showResult({
        correct: false, source: 'groq', general_feedback: 'Close.',
        breakdown: [{ original: '<img src=x onerror=alert(1)>は', corrected: 'が', category: 'Particle', explanation: 'Subject marker.' }],
      }, 'A');
      await tick();
      expect(container.querySelector('#result-badge').classList.contains('wrong')).toBe(true);
      expect(container.querySelector('#answer-reveal strong').textContent).toBe('Expected: ');
      expect(container.querySelector('.rich-feedback-header').textContent).toBe('Explanation');
      expect(container.querySelector('#ai-feedback img')).toBeNull();
      expect(container.querySelector('.rich-breakdown-old').textContent).toBe('<img src=x onerror=alert(1)>は');
      const tag = container.querySelector('.rich-breakdown-tag');
      expect(tag.textContent).toBe('Particle');
      expect(tag.classList.contains('rich-tag-particle')).toBe(true);
    });

    it('shows local grading hints under the local-matching line', async () => {
      const { container } = render(Practice);
      showResult({
        correct: false, source: 'local', feedback: 'Answer did not match closely enough (local check).',
        hints: [{ category: 'Tense', explanation: 'Verb tense error: used present tense (ます) instead of required past tense (ました).' }],
      }, 'きのうえいがをみました');
      await tick();
      const fb = container.querySelector('#ai-feedback');
      expect(fb.textContent).toContain('AI unavailable — used local matching');
      const cards = fb.querySelectorAll('.rich-breakdown-card');
      expect(cards).toHaveLength(1);
      const tag = cards[0].querySelector('.rich-breakdown-tag');
      expect(tag.textContent).toBe('Tense');
      expect(tag.classList.contains('rich-tag-conjugation')).toBe(true);
      expect(cards[0].querySelector('.rich-breakdown-desc').textContent).toContain('required past tense');
    });

    it('shows only the summary line when there are no local hints', async () => {
      const { container } = render(Practice);
      showResult({ correct: true, source: 'local', feedback: 'Answer matched (local check).', hints: [] }, 'A');
      await tick();
      const fb = container.querySelector('#ai-feedback');
      expect(fb.textContent).toContain('Answer matched (local check).');
      expect(fb.querySelector('.rich-breakdown-card')).toBeNull();
    });

    it('can be hidden while it is refilled', async () => {
      const { container } = render(Practice);
      showResult({ correct: true, source: 'local', feedback: 'ok' }, 'A');
      showResultPanel(false);
      await tick();
      expect(container.querySelector('#result-badge').classList.contains('hidden')).toBe(true);
      showResultPanel(true);
      await tick();
      expect(container.querySelector('#result-badge').classList.contains('hidden')).toBe(false);
    });
  });
});
