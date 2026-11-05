<script>
  // Full-screen "Loading Cloud Voice…" card while a slow VOICEVOX fetch runs
  // (tts.js shows it after 2.5s). Styles are in public/assets/style.css.
  import { voicevoxLoading } from '#lib/voicevoxLoading.svelte.js';
</script>

{#if voicevoxLoading.pending > 0}
  <div class="vv-loading-overlay" id="vv-loading-overlay" role="status" aria-live="polite">
    <div class="vv-loading-card">
      <div class="vv-spinner"></div>
      <h3>☁️ Loading Cloud Voice…</h3>
      <p>Preparing audio from Voicevox. This may take a few seconds.</p>
    </div>
  </div>
{/if}
