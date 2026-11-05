import { practiceView, BUTTON_IDS } from './practiceView.svelte.js';

export function showAnswerTranslation(text) {
  const el = document.getElementById('answer-translation');
  if (el) el.innerHTML = text;
}

/**
 * In-session status line: the pulse dot's state and the text beside it.
 * @param {import('./practiceView.svelte.js').StatusState} state
 * @param {string} text
 */
export function setStatus(state, text) {
  practiceView.status = { state: state || '', text };
}

export function showTranscript(text, active) {
  const box = document.getElementById('transcript-box');
  const ph  = document.getElementById('transcript-placeholder');
  const ct  = document.getElementById('transcript-content');
  if (!box || !ph || !ct) return;
  if (text) {
    ph.classList.add('hidden');
    ct.classList.remove('hidden');
    ct.textContent = text;
  } else {
    ph.classList.remove('hidden');
    ct.classList.add('hidden');
    ct.replaceChildren();
  }
  box.classList.toggle('active', !!active);
}

export function showCheckedTranscript(raw, furiganaReading, formatLiveTranscript) {
  const ph  = document.getElementById('transcript-placeholder');
  const ct  = document.getElementById('transcript-content');
  const box = document.getElementById('transcript-box');
  if (!ph || !ct || !box) return;
  ph.classList.add('hidden');
  ct.classList.remove('hidden');
  box.classList.remove('active');

  const heard = document.createElement('div');
  heard.textContent = formatLiveTranscript(raw);

  const userTrans = document.createElement('div');
  userTrans.id = 'user-ans-trans';
  userTrans.className = 'trans-small';

  const checked = document.createElement('div');
  checked.className = 'transcript-furigana';

  const readingLine = document.createElement('div');
  readingLine.textContent = 'Checked (reading): ' + furiganaReading;

  const expTrans = document.createElement('div');
  expTrans.id = 'exp-ans-trans';
  expTrans.className = 'trans-small';

  checked.append(readingLine, expTrans);
  ct.replaceChildren(heard, userTrans, checked);
}

export function updateCheckedTranslation(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = text;
}

export function showResultPanel(visible) {
  const badge = document.getElementById('result-badge');
  if (badge) badge.classList.toggle('hidden', !visible);
}

export function showResult(gradeResult, answer) {
  const badge = document.getElementById('result-badge');
  const icon  = document.getElementById('result-icon');
  const msg   = document.getElementById('result-msg');
  const rev   = document.getElementById('answer-reveal');
  const aiFb  = document.getElementById('ai-feedback');
  if (!badge || !icon || !msg || !rev || !aiFb) return;
  const correct = gradeResult.correct;

  badge.className = 'result-badge ' + (correct ? 'correct' : 'wrong');
  icon.textContent = correct ? '✅' : '❌';
  msg.textContent  = correct ? '正解！ Correct!' : '不正解。 Incorrect.';

  rev.replaceChildren();
  const strong = document.createElement('strong');
  strong.textContent = correct ? 'Expected answer: ' : 'Expected: ';
  const text = document.createTextNode(answer);

  const romajiContainer = document.createElement('div');
  romajiContainer.id = 'expected-ans-romaji';
  romajiContainer.className = 'target-romaji';

  const transContainer = document.createElement('div');
  transContainer.id = 'expected-ans-trans';
  transContainer.className = 'trans-small';

  rev.append(strong, text, romajiContainer, transContainer);

  aiFb.replaceChildren();
  if (gradeResult.source === 'groq') {
    const mainFbText = gradeResult.general_feedback || gradeResult.feedback || '';
    if (mainFbText) {
      const fbText = document.createElement('div');
      fbText.className = 'ai-feedback-text';
      fbText.textContent = '🤖 ' + mainFbText;
      aiFb.appendChild(fbText);
    }

    const breakdown = gradeResult.breakdown || [];

    if (breakdown.length > 0) {
      const richSection = document.createElement('div');
      richSection.className = 'rich-feedback-section';
      
      const sub2 = document.createElement('div');
      sub2.className = 'rich-feedback-header';
      sub2.textContent = 'Explanation';
      richSection.appendChild(sub2);

        breakdown.forEach(item => {
          const card = document.createElement('div');
          card.className = 'rich-breakdown-card';
          
          const top = document.createElement('div');
          top.className = 'rich-breakdown-top';
          
          const changes = document.createElement('div');
          changes.className = 'rich-breakdown-changes';
          changes.innerHTML = `<span class="rich-breakdown-old">${item.original}</span> <span class="rich-breakdown-arrow">→</span> <span class="rich-breakdown-new">${item.corrected}</span>`;
          
          const tag = document.createElement('div');
          const catLower = (item.category || '').toLowerCase().replace(/\\s+/g, '-');
          let tagClass = 'rich-tag-default';
          if (catLower.includes('sentence')) tagClass = 'rich-tag-sentence-structure';
          else if (catLower.includes('word') || catLower.includes('vocab')) tagClass = 'rich-tag-word-choice';
          else if (catLower.includes('particle')) tagClass = 'rich-tag-particle';
          else if (catLower.includes('conjugation') || catLower.includes('tense')) tagClass = 'rich-tag-conjugation';
          else if (catLower.includes('completeness')) tagClass = 'rich-tag-sentence-structure';
          
          tag.className = `rich-breakdown-tag ${tagClass}`;
          tag.textContent = item.category || 'Feedback';
          
          top.append(changes, tag);
          
          const desc = document.createElement('div');
          desc.className = 'rich-breakdown-desc';
          desc.textContent = item.explanation;
          
          card.append(top, desc);
          richSection.appendChild(card);
        });
        aiFb.appendChild(richSection);
      }
  } else if (gradeResult.source === 'local') {
    const fbText = document.createElement('div');
    fbText.className = 'ai-feedback-text';
    fbText.textContent = '⚙️ ' + gradeResult.feedback + ' (AI unavailable — used local matching)';
    aiFb.appendChild(fbText);

    // The specific grammar/particle reasons the local checker found. Same
    // card styling as the AI breakdown, minus the original → corrected line.
    const hints = gradeResult.hints || [];
    if (hints.length > 0) {
      const richSection = document.createElement('div');
      richSection.className = 'rich-feedback-section';
      hints.forEach(hint => {
        const card = document.createElement('div');
        card.className = 'rich-breakdown-card';
        const top = document.createElement('div');
        top.className = 'rich-breakdown-top';
        const tag = document.createElement('div');
        tag.className = 'rich-breakdown-tag ' + hintTagClass(hint.category);
        tag.textContent = hint.category || 'Feedback';
        top.append(tag);
        const desc = document.createElement('div');
        desc.className = 'rich-breakdown-desc';
        desc.textContent = hint.explanation;
        card.append(top, desc);
        richSection.appendChild(card);
      });
      aiFb.appendChild(richSection);
    }
  }
}

/** Category → tag colour for local grading hints (same buckets as the AI breakdown). */
function hintTagClass(category) {
  const c = (category || '').toLowerCase();
  if (c.includes('completeness')) return 'rich-tag-sentence-structure';
  if (c.includes('particle')) return 'rich-tag-particle';
  if (c.includes('conjugation') || c.includes('tense')) return 'rich-tag-conjugation';
  return 'rich-tag-default';
}

/**
 * Show or hide one of the practice control buttons, by its element id.
 * @param {string} id
 * @param {boolean} visible
 */
export function showBtn(id, visible) {
  const key = BUTTON_IDS[id];
  if (key) practiceView.buttons[key] = !!visible;
  else console.warn('showBtn: unknown button', id);
}

/** @param {boolean} visible */
export function showMicWarning(visible) {
  practiceView.micWarning = !!visible;
}

export function showImportStatus(message, type) {
  const statusDiv = document.getElementById('import-status');
  if (!statusDiv) return;
  statusDiv.textContent = message;
  statusDiv.className = 'import-status ' + type;
  if (type !== 'info') {
    setTimeout(() => {
      statusDiv.className = 'import-status';
    }, 5000);
  }
}


// The Practice tab shows one of three screens (Dashboard / Practice /
// Results), switched through practiceView.screen.
export function showStartScreen() {
  practiceView.screen = 'start';
}

export function showPracticeScreen() {
  practiceView.screen = 'practice';
}

export function showResultsScreen() {
  practiceView.screen = 'results';
}

// The Voicevox batch-preload modal used to live here — replaced by the
// non-blocking background warmup in tts.js (startVoicevoxWarmup) plus the
// voice-pack download button in Voice settings.
