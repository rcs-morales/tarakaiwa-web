import { describe, it, expect, beforeEach } from 'vitest';
import { showResult } from '../src/lib/ui.js';

describe('showResult (in-session feedback card)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="result-badge"><span id="result-icon"></span><span id="result-msg"></span></div>
      <div id="answer-reveal"></div>
      <div id="ai-feedback"></div>
    `;
  });

  it('shows local grading hints under the local-matching line', () => {
    showResult({
      correct: false,
      source: 'local',
      feedback: 'Answer did not match closely enough (local check).',
      hints: [
        { category: 'Tense', explanation: 'Verb tense error: used present tense (ます) instead of required past tense (ました).' },
      ],
    }, 'きのうえいがをみました');

    const fb = document.getElementById('ai-feedback');
    expect(fb.textContent).toContain('AI unavailable — used local matching');
    const cards = fb.querySelectorAll('.rich-breakdown-card');
    expect(cards).toHaveLength(1);
    const tag = cards[0].querySelector('.rich-breakdown-tag');
    expect(tag.textContent).toBe('Tense');
    expect(tag.classList.contains('rich-tag-conjugation')).toBe(true);
    expect(cards[0].querySelector('.rich-breakdown-desc').textContent).toContain('required past tense');
  });

  it('shows only the summary line when there are no hints', () => {
    showResult({ correct: true, source: 'local', feedback: 'Answer matched (local check).', hints: [] }, 'A');

    const fb = document.getElementById('ai-feedback');
    expect(fb.textContent).toContain('Answer matched (local check).');
    expect(fb.querySelector('.rich-breakdown-card')).toBeNull();
  });
});
