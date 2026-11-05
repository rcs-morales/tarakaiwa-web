<script>
  // In-session practice screen (Phase 5c, restyled 5d). The screen switch,
  // status line, progress, control buttons and question card render from
  // practiceView / session state. The transcript and result card are still
  // filled in imperatively by id (session.svelte.js, ui.js, stt.js), and the
  // Live2D canvas mounts into #avatar-container, which must never unmount
  // (the screen hides with a class, never an {#if}).
  import { XP_PER_CORRECT } from '$lib/gamification.svelte.js';
  import { practiceView } from '$lib/practiceView.svelte.js';
  import {
    session, endSession, finishRecording, checkAnswer, editTranscript, saveEditedTranscript,
    cancelEditTranscript, rerecordAnswer, nextQuestion, skipQuestion, revealAnswerHint,
    toggleQuestionText, translateQuestion, getQuestionRomaji,
  } from '$lib/session.svelte.js';

  const total = $derived(session.qa.length);
  const progressPct = $derived(total ? (session.current / total) * 100 : 0);
  const isLastQuestion = $derived(total > 0 && session.current === total - 1);
  const show = $derived(practiceView.buttons);
  const card = $derived(practiceView.question);
  const questionText = $derived(session.qa[session.current]?.q ?? '—');

  const translateLabel = $derived(
    card.translate.loading ? '⏳ Translating…' : card.translate.open && card.translate.ok ? '🌐 Hide Translation' : '🌐 Translate'
  );
  const romajiLabel = $derived(
    card.romaji.loading ? '⏳ Loading…' : card.romaji.open && card.romaji.ok ? '🔤 Hide Romaji' : '🔤 Romaji'
  );

  /** Keyboard access for the span "links" (Enter / Space). */
  function activate(/** @type {KeyboardEvent} */ e, /** @type {() => void} */ fn) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
  }
</script>

<div id="screen-practice" class:hidden={practiceView.screen !== 'practice'}>
  <div class="session-header">
    <button class="session-end-btn" id="btn-end-session" title="End session" aria-label="End session" onclick={endSession}>✕</button>
    <div class="progress-bar-wrap session-progress">
      <div class="progress-bar-fill" id="progress-bar" style:width="{progressPct}%"></div>
    </div>
    <div class="progress-label session-count" id="progress-label">Question {session.current + 1} / {total}</div>
  </div>

  <div class="practice-stage">
    <div class="avatar-frame">
      <div id="avatar-container"></div>
    </div>
  </div>

  <div class="question-label practice-question-row">
    <span>Question</span>
    <button class="btn btn-secondary practice-toggle-btn" id="btn-toggle-question"
      class:highlight-pulse={card.pulse} onclick={toggleQuestionText}>{card.textVisible ? '👁 Hide Text' : '👁 Show Text'}</button>
  </div>
  <div class="question-text" id="question-text" style:display={card.textVisible ? 'block' : 'none'}>{questionText}</div>
  <div class="translate-row" id="translate-row" style:display={card.textVisible ? 'block' : 'none'}>
    <div class="translate-actions">
      <span class="translate-link" id="btn-translate" role="button" tabindex="0" class:loading={card.translate.loading}
        onclick={translateQuestion} onkeydown={(e) => activate(e, translateQuestion)}>{translateLabel}</span>
      <span class="translate-link" id="btn-romaji" role="button" tabindex="0" class:loading={card.romaji.loading}
        onclick={getQuestionRomaji} onkeydown={(e) => activate(e, getQuestionRomaji)}>{romajiLabel}</span>
    </div>
    <div class="translate-result" id="translate-result" class:visible={card.translate.open}>
      {card.translate.text}
      {#if card.translate.fallbackUrl}
        <a href={card.translate.fallbackUrl} target="_blank" rel="noopener" style="color: var(--teal); text-decoration: underline;">Translate on Google Translate ↗</a>
      {/if}
    </div>
    <div class="translate-result" id="romaji-result" class:visible={card.romaji.open}>{card.romaji.text}</div>
  </div>

  <div class="warning-box" id="warning-box" style:display={practiceView.micWarning ? 'block' : null}>
    ⚠️ Microphone access is required. Please allow microphone permission when prompted,
    then click <strong>🎤 Try again</strong>.
  </div>

  <div class="status-area">
    <div class="pulse-dot {practiceView.status.state}" id="pulse"></div>
    <div class="status-text" id="status-text">{practiceView.status.text}</div>
  </div>

  <button class="hint-prompt-btn" id="btn-hint-prompt" class:hidden={!show.hintPrompt} onclick={revealAnswerHint}>💡 Taking a While? Tap to Reveal Answer</button>

  <div class="target-answer-box" id="target-answer-box" style:display={card.target.visible ? 'block' : null}>
    <div class="target-label" id="target-label">
      {#if card.target.kind === 'tutorial'}
        🎯 Tutorial Mode ({card.target.tutorialStep}/3) Please say the sample answer clearly:
      {:else if card.target.kind === 'answerKey'}
        ⚠️ AI Grading Not Configured<br /><span style="font-size:0.75rem; font-weight:normal; color:var(--teal);">Showing answer key. Sign in or add a Groq key in settings for flexible answers and feedback!</span>
      {:else}
        💡 Full Answer
      {/if}
    </div>
    <div id="target-answer-text">{card.target.answer}</div>
    <div id="target-romaji-text" class="target-romaji">{card.target.romaji}</div>
    <div id="target-answer-trans" class="trans-small">{card.target.translation}</div>
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
      <button class="btn btn-submit" id="btn-submit" class:hidden={!show.submit} onclick={finishRecording}>■ Finish Recording</button>
      <button class="btn btn-primary" id="btn-check" class:hidden={!show.check} onclick={checkAnswer}>✔ Check Answer</button>
      <button class="btn btn-secondary" id="btn-edit-transcript" class:hidden={!show.editTranscript} onclick={editTranscript} title="Fix a transcription mistake without re-recording">✏️ Edit</button>
      <button class="btn btn-secondary" id="btn-rerecord" class:hidden={!show.rerecord} onclick={rerecordAnswer}>🎤 Try again</button>
      <button class="btn btn-primary" id="btn-save-edit" class:hidden={!show.saveEdit} onclick={saveEditedTranscript}>💾 Save</button>
      <button class="btn btn-secondary" id="btn-cancel-edit" class:hidden={!show.cancelEdit} onclick={cancelEditTranscript}>✕ Cancel</button>
    </div>
    <button class="btn btn-success" id="btn-next" class:hidden={!show.next} onclick={nextQuestion}>{isLastQuestion ? 'Finish Practice' : 'Next →'}</button>
    <button class="btn btn-secondary" id="btn-skip" class:hidden={!show.skip} onclick={skipQuestion}>Skip ▷</button>
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
