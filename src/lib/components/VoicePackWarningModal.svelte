<script>
  // Shown by startPractice() (session.svelte.js) when TTS_MODE is Voicevox
  // and the cache for this deck's questions isn't fully warmed yet — gives
  // the learner a heads-up about possible mid-session loading pauses instead
  // of letting them run into "Loading Cloud Voice…" delays as a surprise.
  // Reuses the app's global .modal/.modal-card chrome (see AvatarModal.svelte).
  import { voicePackPrompt, answerVoicePackPrompt } from '$lib/voicePackPrompt.svelte.js';

  const remaining = $derived(voicePackPrompt.total - voicePackPrompt.cached);
</script>

{#if voicePackPrompt.open}
  <div class="modal" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) answerVoicePackPrompt(false); }}>
    <div class="modal-card vpw-card" role="dialog" aria-modal="true" aria-label="Voice pack still downloading">
      <div class="vpw-icon">☁️</div>
      <h3 class="vpw-title">Voice pack still downloading</h3>
      <p class="vpw-text">
        {remaining} of {voicePackPrompt.total} voice clip{remaining === 1 ? '' : 's'} for this deck
        {remaining === 1 ? "isn't" : "aren't"} cached yet — it's still downloading in the background.
        You can start now and expect a few brief loading pauses, or wait a bit for it to finish first.
      </p>
      <div class="vpw-actions">
        <button type="button" class="btn btn-primary" onclick={() => answerVoicePackPrompt(true)}>Start anyway</button>
        <button type="button" class="btn btn-secondary" onclick={() => answerVoicePackPrompt(false)}>Wait / not now</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .vpw-card {
    max-width: 380px;
    text-align: center;
  }

  .vpw-icon {
    font-size: 2rem;
    margin-bottom: 8px;
  }

  .vpw-title {
    font-family: 'Noto Serif JP', serif;
    font-size: 1.1rem;
    margin-bottom: 10px;
  }

  .vpw-text {
    font-size: 0.85rem;
    color: var(--muted);
    line-height: 1.5;
    margin-bottom: 18px;
  }

  .vpw-actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
</style>
