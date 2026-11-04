// End-of-session "Session Complete!" overlay: state + its fade timing.
// Rendered by components/FinalScoreOverlay.svelte; shown by session.svelte.js.

const FADE_MS = 1000; // matches the opacity transition on #final-score-overlay

export const finalOverlay = $state({
  visible: false,
  /** True while fading out (opacity 0), just before it hides. */
  fading: false,
  passed: false,
  score: 0,
  total: 0,
  message: '',
});

/** @type {ReturnType<typeof setTimeout>[]} */
let timers = [];

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

/**
 * Show the overlay. It stays up until scheduleFinalOverlayFade() or
 * closeFinalOverlay() is called.
 * @param {{ score: number, total: number, passed: boolean, message: string }} result
 */
export function openFinalOverlay({ score, total, passed, message }) {
  clearTimers();
  Object.assign(finalOverlay, { score, total, passed, message, fading: false, visible: true });
}

/**
 * Fade the overlay out after `delayMs`, then hide it.
 * @param {number} delayMs
 */
export function scheduleFinalOverlayFade(delayMs) {
  if (!finalOverlay.visible) return;
  clearTimers();
  timers.push(setTimeout(() => {
    finalOverlay.fading = true;
    timers.push(setTimeout(() => {
      finalOverlay.visible = false;
      finalOverlay.fading = false;
    }, FADE_MS));
  }, delayMs));
}

/** Hide the overlay now (Close button), cancelling any pending fade. */
export function closeFinalOverlay() {
  clearTimers();
  finalOverlay.visible = false;
  finalOverlay.fading = false;
}
