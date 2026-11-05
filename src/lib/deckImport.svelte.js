// Deck import UI state: the status line under the Decks tab's Import / Create
// buttons, and the hidden file input Decks.svelte renders (the onboarding
// sheet opens the same picker through pickDeckFile()).

/** @typedef {'' | 'info' | 'success' | 'error'} StatusType */

export const deckImport = $state({
  /** @type {{ message: string, type: StatusType }} */
  status: { message: '', type: '' },
});

const STATUS_HIDE_MS = 5000;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let statusTimer;

/**
 * Show the import status line. Success and error messages hide after 5s;
 * info messages stay until replaced.
 * @param {string} message
 * @param {StatusType} type
 */
export function showImportStatus(message, type) {
  // Only the latest message's timer may hide it.
  clearTimeout(statusTimer);
  deckImport.status = { message, type };
  if (type !== 'info') {
    statusTimer = setTimeout(() => { deckImport.status = { message: '', type: '' }; }, STATUS_HIDE_MS);
  }
}

/** @type {HTMLInputElement | null} */
let fileInput = null;

/**
 * Svelte action for the deck file input, so pickDeckFile() can open it.
 * @param {HTMLInputElement} node
 */
export function deckFileInput(node) {
  fileInput = node;
  return {
    destroy() {
      if (fileInput === node) fileInput = null;
    },
  };
}

/** Open the file picker for a deck to import. */
export function pickDeckFile() {
  fileInput?.click();
}
