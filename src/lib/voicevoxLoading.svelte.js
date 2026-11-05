// "Loading Cloud Voice…" overlay, shown by tts.js while a slow VOICEVOX fetch
// is in flight. Rendered by components/VoicevoxLoadingOverlay.svelte.

export const voicevoxLoading = $state({
  /** How many slow fetches are showing the overlay (practice and the
   *  translate tool can both be waiting at once). */
  pending: 0,
});

export function showVoicevoxLoading() {
  voicevoxLoading.pending += 1;
}

export function hideVoicevoxLoading() {
  voicevoxLoading.pending = Math.max(0, voicevoxLoading.pending - 1);
}
