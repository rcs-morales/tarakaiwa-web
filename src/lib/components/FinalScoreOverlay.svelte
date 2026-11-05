<script>
  // "Session Complete!" overlay shown when a practice session ends. State and
  // fade timing live in finalOverlay.svelte.js (opened by session.svelte.js).
  import { finalOverlay, closeFinalOverlay } from '#lib/finalOverlay.svelte.js';
</script>

<div
  id="final-score-overlay"
  class:hidden={!finalOverlay.visible}
  style:opacity={finalOverlay.visible && !finalOverlay.fading ? '1' : '0'}
>
  <div class="final-score-card">
    <div id="final-score-icon">{finalOverlay.passed ? '🎉' : '💪'}</div>
    <h2 style="font-family: Noto Serif JP, serif; margin-bottom: 8px;">Session Complete!</h2>
    <div id="final-score-text">
      <div style="font-size: 1.5rem; font-weight: bold; margin-bottom: 4px;">{finalOverlay.score} / {finalOverlay.total}</div>
      <div style="font-size: 1.1rem; color: var(--muted);">{finalOverlay.message}</div>
    </div>
    <button class="btn btn-secondary" id="btn-close-final-overlay" style="margin-top: 20px;" onclick={closeFinalOverlay}>Close</button>
  </div>
</div>
