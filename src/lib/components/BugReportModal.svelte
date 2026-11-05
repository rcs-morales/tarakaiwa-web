<script>
  // Bug report modal. The description and screenshot are cleared when it
  // closes, so it starts empty each time. IDs match the old markup so the
  // global #bug-message / .modal styles still apply.
  import { bugReport, closeBugReport, submitBugReport } from '#lib/bugReport.svelte.js';

  let message = $state('');
  /** @type {FileList | null} */
  let files = $state(null);

  // Start fresh every time: clear what was typed/attached once it closes.
  $effect(() => {
    if (!bugReport.open) {
      message = '';
      files = null;
    }
  });

  function submit() {
    submitBugReport({ message, file: files?.[0] ?? null });
  }
</script>

{#if bugReport.open}
  <div id="bug-report-modal" class="modal">
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="bug-report-title">
      <h3 id="bug-report-title" style="font-family: 'Noto Serif JP', serif; margin-bottom: 8px;">🐞 Report a Bug</h3>
      <p style="font-size: 0.85rem; color: var(--muted); margin-bottom: 16px;">Help us improve TaraKaiwa! Please describe the issue you've encountered.</p>
      <textarea id="bug-message" placeholder="What happened? (e.g., 'The AI gave a wrong answer')" bind:value={message}></textarea>
      <div class="file-input-row">
        <label for="bug-screenshot" style="font-size: 0.8rem; font-weight: 500; color: var(--ink-mid);">📸 Attach Screenshot (Optional)</label>
        <input type="file" id="bug-screenshot" accept="image/*" bind:files />
      </div>
      <div class="modal-btn-row" style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
        <button class="btn btn-secondary" id="bug-close-btn" onclick={closeBugReport}>Close</button>
        <button class="btn btn-primary btn-submit" id="bug-submit-btn" disabled={bugReport.submitting} onclick={submit}>
          {bugReport.submitting ? 'Uploading...' : 'Submit Report'}
        </button>
      </div>
    </div>
  </div>
{/if}
