import { practiceView, BUTTON_IDS, transLine } from './practiceView.svelte.js';

/**
 * In-session status line: the pulse dot's state and the text beside it.
 * @param {import('./practiceView.svelte.js').StatusState} state
 * @param {string} text
 */
export function setStatus(state, text) {
  practiceView.status = { state: state || '', text };
}

/**
 * Show the live / heard transcript (or the placeholder when empty).
 * @param {string} text
 * @param {boolean} [active] highlight the box (listening / reviewing)
 */
export function showTranscript(text, active) {
  const t = practiceView.answer.transcript;
  t.mode = text ? 'text' : 'empty';
  t.text = text || '';
  t.active = !!active;
}

/**
 * AI mode has no live transcript: show "Recording audio…" while recording and
 * "Transcribing…" while Whisper runs.
 * @param {'recording' | 'transcribing'} kind
 */
export function showTranscriptIndicator(kind) {
  const t = practiceView.answer.transcript;
  t.mode = kind;
  t.active = true;
}

/**
 * After Check Answer: what was heard, and the reading that was graded.
 * @param {string} raw
 * @param {string} furiganaReading
 * @param {(s: string) => string} formatLiveTranscript
 */
export function showCheckedTranscript(raw, furiganaReading, formatLiveTranscript) {
  const t = practiceView.answer.transcript;
  t.mode = 'checked';
  t.active = false;
  t.checked = { heard: formatLiveTranscript(raw), reading: furiganaReading, userTrans: transLine() };
}

/** @param {boolean} visible */
export function showResultPanel(visible) {
  practiceView.answer.result.panel = !!visible;
}

/**
 * Fill the result card: correct / wrong, the expected answer and the grading
 * feedback (AI breakdown or local hints). Romaji and translation lines are
 * filled in afterwards by checkAnswer.
 * @param {any} gradeResult
 * @param {string} answer
 */
export function showResult(gradeResult, answer) {
  Object.assign(practiceView.answer.result, {
    shown: true,
    correct: !!gradeResult.correct,
    answer,
    romaji: '',
    expTrans: transLine(),
    grade: gradeResult,
  });
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
