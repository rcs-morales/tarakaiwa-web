// View state for the Practice tab's three screens: which one is showing, and
// the in-session status line, control-button visibility and mic warning.
// session.svelte.js, stt.js and tts.js change it through the ui.js helpers
// (showStartScreen / setStatus / showBtn …); Dashboard, Practice and Results
// render from it.

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
});
