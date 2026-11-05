// View state for the Practice tab's three screens: which one is showing, the
// in-session status line, control-button visibility and mic warning (changed
// through the ui.js helpers — showStartScreen / setStatus / showBtn …), and
// the question card (changed by session.svelte.js). Dashboard, Practice and
// Results render from it.

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
