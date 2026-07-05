<script>
  // In-session practice screen (Phase 5c). This component owns the LAYOUT
  // only — every element keeps its id because session.svelte.js, ui.js,
  // stt.js and avatar.js drive the content imperatively. The Live2D canvas
  // mounts into #avatar-container and must never be unmounted.
</script>

<div id="screen-practice" class="hidden">
  <div class="practice-stage">
    <div id="avatar-container"></div>
  </div>

  <div class="progress-label" id="progress-label">Question 1 / 16</div>
  <div class="progress-bar-wrap">
    <div class="progress-bar-fill" id="progress-bar"></div>
  </div>

  <div class="question-label practice-question-row">
    <span>Question</span>
    <button class="btn btn-secondary practice-toggle-btn" id="btn-toggle-question">👁 Show Text</button>
  </div>
  <div class="question-text" id="question-text" style="display: none;">—</div>
  <div class="translate-row" id="translate-row" style="display: none;">
    <span class="translate-link" id="btn-translate">🌐 Translate</span>
    <div class="translate-result" id="translate-result"></div>
  </div>

  <div class="warning-box" id="warning-box">
    ⚠️ Microphone access is required. Please allow microphone permission when prompted,
    then click <strong>Retry</strong>.
  </div>

  <div class="status-area">
    <div class="pulse-dot" id="pulse"></div>
    <div class="status-text" id="status-text">Initializing...</div>
  </div>

  <div class="target-answer-box" id="target-answer-box">
    <div class="target-label" id="target-label">🎯 Target Answer</div>
    <div id="target-answer-text">—</div>
    <div id="target-romaji-text" class="target-romaji">—</div>
  </div>

  <div class="transcript-box" id="transcript-box">
    <span class="transcript-placeholder" id="transcript-placeholder">Your spoken answer will appear here (as
      recognized)…</span>
    <div id="transcript-content" class="hidden"></div>
  </div>

  <div class="result-badge" id="result-badge">
    <span class="icon" id="result-icon"></span>
    <div class="result-badge-content">
      <div id="result-msg"></div>
      <div class="answer-reveal" id="answer-reveal"></div>
      <div id="answer-translation" class="ai-feedback-text practice-answer-translation"></div>
      <div class="ai-feedback" id="ai-feedback"></div>
    </div>
  </div>

  <div class="btn-row practice-controls">
    <div class="btn-group-record">
      <button class="btn btn-submit hidden" id="btn-submit">■ Finish Recording</button>
      <button class="btn btn-primary hidden" id="btn-check">✔ Check Answer</button>
      <button class="btn btn-secondary hidden" id="btn-rerecord">🎤 Re-record</button>
    </div>
    <button class="btn btn-primary hidden" id="btn-next">Next →</button>
    <button class="btn btn-secondary" id="btn-skip">Skip ▷</button>
    <button class="btn btn-danger" id="btn-end-session">✕ End</button>
  </div>
</div>

<style>
  .practice-question-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .practice-toggle-btn {
    padding: 8px 12px;
    font-size: 0.8rem;
    min-height: 44px; /* thumb target even though it looks compact */
  }

  .practice-answer-translation {
    font-style: normal;
    opacity: 0.8;
    margin-bottom: 4px;
  }

  /* Primary actions grow to fill the row on mobile so the thumb can't miss;
     desktop keeps the inline row from the legacy stylesheet. */
  @media (max-width: 719px) {
    /* The 400×400 Live2D canvas scales down (never crops — the head lives in
       the top half). pointer-events stays off via the global rule. */
    #avatar-container,
    #avatar-container.voicevox-mode {
      height: min(32vh, 300px);
    }

    #avatar-container :global(canvas) {
      height: 100%;
      width: auto;
    }

    .practice-controls {
      gap: 8px;
      /* keep the buttons out from under the floating assistant/translate
         bubbles pinned to the right edge (48px wide + margins) */
      padding-right: 60px;
    }

    .practice-controls .btn-group-record {
      flex: 1 1 100%;
    }

    .practice-controls .btn-group-record .btn {
      flex: 1;
    }

    .practice-controls #btn-next {
      flex: 1 1 60%;
    }

    .practice-controls #btn-skip,
    .practice-controls #btn-end-session {
      flex: 1;
    }
  }
</style>
