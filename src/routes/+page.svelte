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
  import FinalScoreOverlay from '$lib/components/FinalScoreOverlay.svelte';
  import BugReportModal from '$lib/components/BugReportModal.svelte';
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

<FinalScoreOverlay />
<BugReportModal />

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
