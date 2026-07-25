<script>
  import { onMount } from 'svelte';
  import { initApp } from '$lib/app.js';
  import Shell from '$lib/components/Shell.svelte';
  import Onboarding from '$lib/components/Onboarding.svelte';
  import WhatsNewModal from '$lib/components/WhatsNewModal.svelte';
  import Dashboard from '$lib/components/Dashboard.svelte';
  import Practice from '$lib/components/Practice.svelte';
  import Results from '$lib/components/Results.svelte';
  import Decks from '$lib/components/Decks.svelte';
  import Progress from '$lib/components/Progress.svelte';
  import Settings from '$lib/components/Settings.svelte';
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

<!-- ── AI Study Assistant ── -->
<button id="btn-translate-tool" class="btn-translate-float" title="Speak in Japanese">🔊</button>
<div id="translate-tool-panel" class="ai-panel translate-panel hidden">
  <div class="ai-panel-header translate-panel-header">
    <span>🔊 Speak in Japanese</span>
    <button id="btn-close-translate" class="btn-close-ai">✕</button>
  </div>
  <div class="translate-tool-body">
    <p class="translate-tool-hint">Type or speak any phrase to hear it in Japanese.</p>
    <div class="translate-source-lang-row" style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
      <label for="translate-source-lang" style="font-size: 0.85rem; font-weight: bold;">Source:</label>
      <select id="translate-source-lang" style="padding: 2px; border-radius: 4px; background: var(--paper-2); color: var(--text); border: 1px solid var(--border);">
        <option value="English">English</option>
        <option value="Filipino">Filipino</option>
        <option value="Spanish">Spanish</option>
        <option value="French">French</option>
        <option value="Chinese">Chinese</option>
        <option value="Korean">Korean</option>
      </select>
    </div>
    <textarea id="translate-input" class="translate-input" rows="3" placeholder="e.g. Hello, how are you?"></textarea>
    <div id="translate-status" class="translate-status"></div>
    <div class="translate-tool-actions ai-panel-input">
      <button id="btn-translate-mic" class="btn-ai-mic" title="Speak your phrase">🎤</button>
      <button id="btn-translate-speak" class="btn-ai-send">Translate &amp; Speak</button>
    </div>
    <div id="translate-result-area" class="translate-result-area hidden">
      <div class="translate-result-label">Japanese</div>
      <div id="translate-result-text" class="translate-result-text"></div>
      <button id="btn-translate-replay" class="btn btn-secondary btn-sm">🔊 Replay</button>
    </div>
  </div>
  <div class="ai-panel-resizer"></div>
</div>

<button id="btn-ai-assistant" class="btn-ai-float" title="AI Study Assistant">📚</button>
<div id="ai-assistant-panel" class="ai-panel hidden">
  <div class="ai-panel-header">
    <span>🤖 AI Study Assistant</span>
    <button id="btn-close-ai" class="btn-close-ai">✕</button>
  </div>
  <div id="ai-chat-history" class="ai-chat-history"></div>
  <div class="ai-panel-input">
    <input type="text" id="ai-chat-input" placeholder="Ask about grammar, vocab..." autocomplete="off" />
    <button id="btn-ai-send" class="btn-ai-send">Send</button>
  </div>
  <div class="ai-panel-resizer"></div>
</div>

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
