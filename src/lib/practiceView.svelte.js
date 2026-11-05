// View state for the Practice tab's three screens: which one is showing, the
// in-session status line, control-button visibility, mic warning, transcript
// and result card (changed through the ui.js helpers — showStartScreen /
// setStatus / showBtn / showTranscript / showResult …), and the question card
// (changed by session.svelte.js). Dashboard, Practice and Results render
// from it.

/** @typedef {'start' | 'practice' | 'results'} PracticeScreen */
/** @typedef {'' | 'speaking' | 'listening' | 'checking'} StatusState */

/** Control buttons by the id ui.js callers use. */
export const BUTTON_IDS = {
  'btn-submit': 'submit',
  'btn-check': 'check',
  'btn-edit-transcript': 'editTranscript',
  'btn-rerecord': 'rerecord',
  'btn-save-edit': 'saveEdit',
  'btn-cancel-edit': 'cancelEdit',
  'btn-next': 'next',
  'btn-skip': 'skip',
  'btn-hint-prompt': 'hintPrompt',
};

export const practiceView = $state({
  /** @type {PracticeScreen} */
  screen: 'start',
  /** @type {{ state: StatusState, text: string }} */
  status: { state: '', text: 'Initializing...' },
  /** Which control buttons are shown. Skip is the only one visible up front. */
  buttons: {
    submit: false,
    check: false,
    editTranscript: false,
    rerecord: false,
    saveEdit: false,
    cancelEdit: false,
    next: false,
    skip: true,
    hintPrompt: false,
  },
  /** "Microphone access is required…" box. */
  micWarning: false,
  question: newQuestionCard(),
  answer: newAnswerCard(),
});

/**
 * @typedef {{ open: boolean, loading: boolean, ok: boolean, text: string }} AidResult
 *   One of the question's Translate / Romaji results. `ok` is false for an
 *   error or "unavailable" message (its link stays "Translate"/"Romaji").
 */

/**
 * @typedef {object} TargetBox  The 🎯 expected-answer box under the status line.
 * @property {boolean} visible
 * @property {'tutorial' | 'answerKey' | 'hint'} kind
 *   tutorial: first questions of the sample deck; answerKey: no AI access, so
 *   the answer is shown up front; hint: "Tap to Reveal Answer".
 * @property {number} tutorialStep  1–3 for the tutorial
 * @property {string} answer
 * @property {string} romaji
 * @property {string} translation
 */

function newQuestionCard() {
  return {
    /** Question text shown (it's spoken first, hidden by default). */
    textVisible: false,
    /** First-time nudge on the Show Text button. */
    pulse: false,
    /** @type {AidResult & { fallbackUrl: string }} Google Translate link when AI isn't available. */
    translate: { open: false, loading: false, ok: false, text: '', fallbackUrl: '' },
    /** @type {AidResult} */
    romaji: { open: false, loading: false, ok: false, text: '' },
    /** @type {TargetBox} */
    target: { visible: false, kind: 'hint', tutorialStep: 0, answer: '', romaji: '', translation: '' },
  };
}

/** Clear the question card for a new question. */
export function resetQuestionCard() {
  practiceView.question = newQuestionCard();
}

/**
 * @typedef {{ text: string, linkUrl: string, linkText: string }} TransLine
 *   A translation line: text, optionally followed by a Google Translate link
 *   (when AI isn't available or the AI translation failed).
 */

/** @returns {TransLine} */
export function transLine(text = '', linkUrl = '', linkText = '') {
  return { text, linkUrl, linkText };
}

/**
 * @typedef {'empty' | 'text' | 'recording' | 'transcribing' | 'editing' | 'checked'} TranscriptMode
 *   empty: placeholder; text: live/heard transcript; recording / transcribing:
 *   AI-mode indicators; editing: the fix-a-mistake textarea; checked: after
 *   Check Answer (heard text, the reading that was graded, "You said …").
 */

function newAnswerCard() {
  return {
    transcript: {
      /** @type {TranscriptMode} */
      mode: 'empty',
      text: '',
      /** Highlighted border while listening / reviewing. */
      active: false,
      /** Textarea contents while editing. */
      editText: '',
      checked: { heard: '', reading: '', userTrans: transLine() },
    },
    result: {
      /** showResult() filled it in for this question. */
      shown: false,
      /** showResultPanel() — hidden while it's being refilled. */
      panel: true,
      correct: false,
      answer: '',
      romaji: '',
      expTrans: transLine(),
      /** @type {any} The grade result (AI or local) the feedback is rendered from. */
      grade: null,
    },
  };
}

/** Clear the transcript and result card for a new question. */
export function resetAnswerCard() {
  practiceView.answer = newAnswerCard();
}
