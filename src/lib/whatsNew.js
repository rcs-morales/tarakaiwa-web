// "What's new" announcement shown once to returning users (WhatsNewModal.svelte).
// Bump WHATS_NEW_VERSION and replace WHATS_NEW_ITEMS whenever there's a new
// user-facing change worth announcing — everyone whose WHATS_NEW_SEEN setting
// doesn't match sees it once, then it's dismissed for that device.
export const WHATS_NEW_VERSION = '2026-07-25-edit-transcript';

export const WHATS_NEW_ITEMS = [
  {
    icon: '✏️',
    title: 'Edit your answer before checking',
    text: "Speech recognition sometimes mishears you. On the review step — after recording, before Check Answer — tap Edit to fix the transcribed text yourself. No need to re-record.",
  },
];
