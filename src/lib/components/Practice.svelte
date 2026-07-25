<script>
  // In-session practice screen (Phase 5c, restyled 5d). This component owns the
  // LAYOUT only — every element keeps its id because session.svelte.js, ui.js,
  // stt.js and avatar.js drive the content imperatively. The Live2D canvas
  // mounts into #avatar-container and must never be unmounted.
  import { XP_PER_CORRECT } from '$lib/gamification.svelte.js';
</script>

<div id="screen-practice" class="hidden">
  <div class="session-header">
    <button class="session-end-btn" id="btn-end-session" title="End session" aria-label="End session">✕</button>
    <div class="progress-bar-wrap session-progress">
      <div class="progress-bar-fill" id="progress-bar"></div>
    </div>
    <div class="progress-label session-count" id="progress-label">1 / 16</div>
  </div>

  <div class="practice-stage">
    <div class="avatar-frame">
      <div id="avatar-container"></div>
    </div>
  </div>

  <div class="question-label practice-question-row">
    <span>Question</span>
    <button class="btn btn-secondary practice-toggle-btn" id="btn-toggle-question">👁 Show Text</button>
  </div>
  <div class="question-text" id="question-text" style="display: none;">—</div>
  <div class="translate-row" id="translate-row" style="display: none;">
    <div class="translate-actions">
      <span class="translate-link" id="btn-translate">🌐 Translate</span>
      <span class="translate-link" id="btn-romaji">🔤 Romaji</span>
    </div>
    <div class="translate-result" id="translate-result"></div>
    <div class="translate-result" id="romaji-result"></div>
  </div>

  <div class="warning-box" id="warning-box">
    ⚠️ Microphone access is required. Please allow microphone permission when prompted,
    then click <strong>Retry</strong>.
  </div>

  <div class="status-area">
    <div class="pulse-dot" id="pulse"></div>
    <div class="status-text" id="status-text">Initializing...</div>
  </div>

  <button class="hint-prompt-btn hidden" id="btn-hint-prompt">💡 Taking a While? Tap to Reveal Answer</button>

  <div class="target-answer-box" id="target-answer-box">
    <div class="target-label" id="target-label">🎯 Expected Answer</div>
    <div id="target-answer-text">—</div>
    <div id="target-romaji-text" class="target-romaji">—</div>
    <div id="target-answer-trans" class="trans-small"></div>
  </div>

  <div class="transcript-box" id="transcript-box">
    <span class="transcript-placeholder" id="transcript-placeholder">Your spoken answer will appear here (as
      recognized)…</span>
    <div id="transcript-content" class="hidden"></div>
  </div>

  <div class="result-badge" id="result-badge">
    <span class="icon" id="result-icon"></span>
    <div class="result-badge-content">
      <span class="result-xp-pill">+{XP_PER_CORRECT} XP</span>
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
      <button class="btn btn-secondary hidden" id="btn-edit-transcript" title="Fix a transcription mistake without re-recording">✏️ Edit</button>
      <button class="btn btn-secondary hidden" id="btn-rerecord">🎤 Try again</button>
      <button class="btn btn-primary hidden" id="btn-save-edit">💾 Save</button>
      <button class="btn btn-secondary hidden" id="btn-cancel-edit">✕ Cancel</button>
    </div>
    <button class="btn btn-success hidden" id="btn-next">Next →</button>
    <button class="btn btn-secondary" id="btn-skip">Skip ▷</button>
  </div>

  <p class="practice-ai-disclaimer">AI can make mistakes. Double-check the responses.</p>
</div>

<style>
  /* ── Session header: round ✕ · progress bar · mono count ── */
  .session-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  .session-end-btn {
    flex: 0 0 auto;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 1.5px solid var(--border);
    background: var(--surface);
    color: var(--muted);
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
  }

  .session-end-btn:hover {
    background: var(--err-bg);
    color: var(--wrong);
    border-color: var(--wrong);
  }

  .session-progress {
    flex: 1;
    margin: 0;
  }

  .session-count {
    flex: 0 0 auto;
    margin: 0;
  }

  /* ── Avatar frame: rounded, masked stage for the Live2D canvas ── */
  .avatar-frame {
    border-radius: 22px;
    overflow: hidden;
    background: var(--primary-tint);
    border: 2px solid var(--card-border);
  }

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

  /* ── Hint prompt: opt-in nudge, not an unrequested answer reveal ── */
  .hint-prompt-btn {
    display: block;
    width: 100%;
    min-height: 44px;
    margin-bottom: 16px;
    padding: 10px 16px;
    border-radius: 12px;
    border: 1.5px dashed var(--primary);
    background: var(--primary-tint);
    color: var(--primary);
    font-family: var(--font-ui);
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    animation: hint-prompt-pulse 2s ease-in-out infinite;
  }

  @keyframes hint-prompt-pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.7; }
  }

  .practice-answer-translation {
    font-style: normal;
    opacity: 0.8;
    margin-bottom: 4px;
  }

  .practice-ai-disclaimer {
    margin: 16px 0 4px;
    font-size: 0.72rem;
    color: var(--muted-2, var(--muted));
    text-align: center;
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

    .practice-controls #btn-skip {
      flex: 1;
    }
  }
</style>
