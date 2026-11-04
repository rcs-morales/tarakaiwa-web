<script>
  import { onMount } from 'svelte';
  import { initApp } from '$lib/app.js';
  import Shell from '$lib/components/Shell.svelte';
  import Onboarding from '$lib/components/Onboarding.svelte';
  import WhatsNewModal from '$lib/components/WhatsNewModal.svelte';
  import VoicePackWarningModal from '$lib/components/VoicePackWarningModal.svelte';
  import Dashboard from '$lib/components/Dashboard.svelte';
  import Practice from '$lib/components/Practice.svelte';
  import Results from '$lib/components/Results.svelte';
  import Decks from '$lib/components/Decks.svelte';
  import Progress from '$lib/components/Progress.svelte';
  import Settings from '$lib/components/Settings.svelte';
  import StudyAssistant from '$lib/components/StudyAssistant.svelte';
  import TranslateTool from '$lib/components/TranslateTool.svelte';
  import { shell } from '$lib/shell.svelte.js';

  onMount(initApp);
</script>

<Shell>

  <!-- ══ PRACTICE TAB ══ -->
  <!-- Panels are toggled with the hidden class only — never unmounted, so the
       Live2D canvas in #avatar-container survives tab switches. The three
       screens inside are hidden-class toggled by ui.js exactly as before. -->
  <section class="tab-panel" class:hidden={shell.tab !== 'practice'}>
    <div class="card">
      <Dashboard />
      <Practice />
      <Results />
    </div>
  </section>

  <!-- ══ DECKS TAB ══ -->
  <section class="tab-panel" class:hidden={shell.tab !== 'decks'}>
    <div class="card">
      <Decks />
    </div>
  </section>

  <!-- ══ PROGRESS TAB ══ -->
  <section class="tab-panel" class:hidden={shell.tab !== 'progress'}>
    <div class="card">
      <Progress />
    </div>
  </section>

  <!-- ══ SETTINGS TAB ══ -->
  <section class="tab-panel" class:hidden={shell.tab !== 'settings'}>
    <div class="card">
      <Settings />
    </div>
  </section>

</Shell>

<Onboarding />
<WhatsNewModal />
<VoicePackWarningModal />

<div id="final-score-overlay" class="hidden">
  <div class="final-score-card">
    <div id="final-score-icon">🏆</div>
    <h2 style="font-family: Noto Serif JP, serif; margin-bottom: 8px;">Session Complete!</h2>
    <div id="final-score-text">0 / 0</div>
    <button class="btn btn-secondary" id="btn-close-final-overlay" style="margin-top: 20px;">Close</button>
  </div>
</div>

<!-- ── BUG REPORT MODAL ── -->
<div id="bug-report-modal" class="modal hidden">
  <div class="modal-card">
    <h3 style="font-family: 'Noto Serif JP', serif; margin-bottom: 8px;">🐞 Report a Bug</h3>
    <p style="font-size: 0.85rem; color: var(--muted); margin-bottom: 16px;">Help us improve TaraKaiwa! Please describe the issue you've encountered.</p>
    <textarea id="bug-message" placeholder="What happened? (e.g., 'The AI gave a wrong answer')"></textarea>
    <div class="file-input-row">
      <label for="bug-screenshot" style="font-size: 0.8rem; font-weight: 500; color: var(--ink-mid);">📸 Attach Screenshot (Optional)</label>
      <input type="file" id="bug-screenshot" accept="image/*" />
    </div>
    <div class="modal-btn-row" style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
      <button class="btn btn-secondary" id="bug-close-btn">Close</button>
      <button class="btn btn-primary btn-submit" id="bug-submit-btn">Submit Report</button>
    </div>
  </div>
</div>

<!-- ── Floating study tools ── -->
<TranslateTool />
<StudyAssistant />

<style>
  /* Panel wrapper replaces the old body-level centering: each tab centers its
     card with the same spacing the body used to provide. */
  .tab-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32px 16px 64px;
  }

  @media (max-width: 719px) {
    /* The shell already pads for the bottom nav — anything more forces the
       practice screen past 100vh (the "no mid-recording scroll" criterion). */
    .tab-panel {
      padding: 10px 10px 8px;
    }
  }

</style>
