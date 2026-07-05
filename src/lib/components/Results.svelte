<script>
  // Results screen (Phase 5c) — renders reactively from session state,
  // replacing the old createElement builder in session.js. Visibility is
  // still toggled imperatively (ui.js showResultsScreen → #screen-results),
  // and #btn-restart-app is bound in app.js.
  import { session } from '$lib/session.svelte.js';

  const total = $derived(session.results.length);
  const pct = $derived(total ? Math.round((session.score / total) * 100) : 0);
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
  <div class="score-hero">
    <div class="score-big" id="score-display">{session.score} / {total}</div>
    <div class="score-label">Final Score</div>
    <div class="score-bar-wrap">
      <div class="score-bar" id="score-bar" style="width:{pct}%"></div>
    </div>
    <div id="score-message" class="results-message">{message}</div>
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
    <button class="btn btn-primary" id="btn-restart-app">↺ Restart</button>
  </div>
  <div class="results-footer">
    <button class="btn btn-secondary btn-sm btn-report-bug">🐞 Report Bug</button>
  </div>
</div>

<style>
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
