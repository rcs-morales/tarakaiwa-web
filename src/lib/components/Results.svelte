<script>
  // Results screen (Phase 5c) — renders reactively from session state,
  // replacing the old createElement builder in session.js. Visibility is
  // still toggled imperatively (ui.js showResultsScreen → #screen-results),
  // and #btn-restart-app is bound in app.js.
  import { session } from '$lib/session.svelte.js';
  import { history } from '$lib/history.svelte.js';
  import { computeDailyGoal, XP_PER_CORRECT } from '$lib/gamification.svelte.js';

  const total = $derived(session.results.length);
  const pct = $derived(total ? Math.round((session.score / total) * 100) : 0);
  const xpEarned = $derived(session.score * XP_PER_CORRECT);
  const daily = $derived(computeDailyGoal(history.entries));

  // Re-use the wired restart handler (bound to #btn-restart-app in app.js) for
  // the header ✕ so there's a single source of truth for "leave results".
  const leave = () => document.getElementById('btn-restart-app')?.click();
  const message = $derived(
    pct === 100 ? '🏆 Perfect score! Excellent work!' :
    pct >= 75   ? '✨ Great job! Almost there.' :
    pct >= 50   ? '👍 Good effort. Keep practicing!' :
                  '📚 Keep studying, you\'ll improve!'
  );

  // Same category → tag mapping the in-session badge uses (ui.js showResult).
  function tagClassFor(category) {
    const c = (category || '').toLowerCase();
    if (c.includes('sentence') || c.includes('completeness')) return 'rich-tag-sentence-structure';
    if (c.includes('word') || c.includes('vocab')) return 'rich-tag-word-choice';
    if (c.includes('particle')) return 'rich-tag-particle';
    if (c.includes('conjugation') || c.includes('tense')) return 'rich-tag-conjugation';
    return 'rich-tag-default';
  }
</script>

<div id="screen-results" class="hidden">
  <div class="results-header">
    <button class="session-end-btn" title="Close" aria-label="Close results" onclick={leave}>✕</button>
    <div class="results-title">セッション完了 · Complete!</div>
    <span class="results-header-spacer" aria-hidden="true"></span>
  </div>

  <div class="score-card">
    <div class="score-card-label">Your score</div>
    <div class="score-big" id="score-display" class:low={pct < 75}>{pct}%</div>
    <div class="score-sub">{session.score} / {total} correct {pct >= 75 ? '🎉' : ''}</div>
    <div class="score-bar-wrap">
      <div class="score-bar" id="score-bar" style="width:{pct}%"></div>
    </div>
    <div id="score-message" class="results-message">{message}</div>
  </div>

  <div class="reward-pair">
    <div class="reward-card reward-xp">
      <div class="reward-value">+{xpEarned} XP</div>
      <div class="reward-label">earned this session</div>
    </div>
    <div class="reward-card reward-goal" class:met={daily.met}>
      <div class="reward-value">{'⭐'.repeat(daily.done)}{'☆'.repeat(Math.max(0, daily.target - daily.done))}</div>
      <div class="reward-label">{daily.met ? 'Daily goal met!' : `Daily goal ${daily.done}/${daily.target}`}</div>
    </div>
  </div>

  <hr class="divider">

  <div class="results-list" id="results-list">
    {#each session.results as r, i}
      <div class="result-row {r.correct ? 'c' : 'w'}">
        <span class="tag {r.correct ? 'tag-ok' : 'tag-ng'}">{i + 1}. {r.correct ? '✓ Correct' : '✗ Incorrect'}</span>
        <div class="rq">{r.q}</div>
        <div class={r.correct ? 'rc' : 'rw'}>Heard: {r.transcript}</div>
        <div class="ra">{r.correct ? '📝 Expected: ' : '✔ Expected: '}{r.a}</div>
        {#if r.gradeResult}
          <div class="ai-result-feedback">
            <div class="ai-feedback-main">
              {r.gradeResult.source === 'groq' ? '🤖' : '⚙️'} {r.gradeResult.general_feedback || r.gradeResult.feedback || ''}
            </div>
            {#if (r.gradeResult.breakdown || []).length > 0}
              <div class="ai-breakdown-container">
                {#each r.gradeResult.breakdown as item}
                  <div class="rich-breakdown-card">
                    <div class="rich-breakdown-top">
                      <div class="rich-breakdown-changes">
                        <span class="rich-breakdown-old">{item.original}</span>
                        <span class="rich-breakdown-arrow">→</span>
                        <span class="rich-breakdown-new">{item.corrected}</span>
                      </div>
                      <div class="rich-breakdown-tag {tagClassFor(item.category)}">{item.category || 'Feedback'}</div>
                    </div>
                    <div class="rich-breakdown-desc">{item.explanation}</div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <hr class="divider">

  <div class="btn-row results-actions">
    <button class="btn btn-primary" id="btn-restart-app">もう一度 · Again</button>
  </div>
  <div class="results-footer">
    <button class="btn btn-secondary btn-sm btn-report-bug">🐞 Report Bug</button>
  </div>
</div>

<style>
  /* ── Header ── */
  .results-header {
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

  .results-title {
    flex: 1;
    text-align: center;
    font-weight: 800;
    font-size: 1rem;
    color: var(--text);
  }

  .results-header-spacer {
    flex: 0 0 40px;
  }

  /* ── Score card ── */
  .score-card {
    background: var(--surface);
    border: 2px solid var(--card-border);
    border-radius: 20px;
    padding: 22px 18px;
    text-align: center;
    margin-bottom: 14px;
  }

  .score-card-label {
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted-2);
    margin-bottom: 6px;
  }

  .score-sub {
    font-family: var(--font-mono);
    font-size: 0.9rem;
    color: var(--ink-mid);
    margin-top: 6px;
  }

  /* ── Reward pair ── */
  .reward-pair {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
  }

  .reward-card {
    flex: 1;
    text-align: center;
    padding: 14px 10px;
    border-radius: 16px;
    border: 2px solid var(--card-border);
    background: var(--surface);
  }

  .reward-xp {
    background: var(--primary-tint);
    border-color: var(--primary-tint);
  }

  .reward-xp .reward-value {
    color: var(--primary);
  }

  .reward-goal {
    background: var(--amber-bg);
    border-color: var(--amber-border);
  }

  .reward-value {
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 1.15rem;
    line-height: 1.1;
  }

  .reward-label {
    font-size: 0.66rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted-2);
    margin-top: 4px;
  }

  .results-message {
    color: var(--muted);
    font-size: 0.9rem;
  }

  .results-actions {
    justify-content: center;
  }

  .results-footer {
    text-align: center;
    margin-top: 20px;
  }

  @media (max-width: 719px) {
    .results-actions .btn {
      flex: 1;
      min-height: 48px;
    }
  }
</style>
