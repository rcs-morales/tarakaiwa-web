<script>
  // Practice tab dashboard (Phase 5c) — the landing screen inside the
  // Practice panel. Renders from reactive state (session deck, history
  // stats); the #ai-status-chip text is still written imperatively by
  // ai/groqClient.js, so its ids must stay.
  import { onMount } from 'svelte';
  import StatCard from './StatCard.svelte';
  import { session, startPractice } from '$lib/session.svelte.js';
  import { history, computeStats } from '$lib/history.svelte.js';
  import { get, KEYS } from '$lib/settings.js';
  import { shell } from '$lib/shell.svelte.js';

  const stats = $derived(computeStats(history.entries));
  const recent = $derived(history.entries.slice(0, 5));
  const deckReady = $derived(session.qa.length > 0);

  // JLPT level lives in localStorage (not reactive) — re-read it when the
  // user returns to this tab and after a settings sync from another device.
  let jlptLevel = $state('N5');
  $effect(() => {
    if (shell.tab === 'practice') jlptLevel = get(KEYS.JLPT_LEVEL) || 'N5';
  });

  onMount(() => {
    const refresh = () => { jlptLevel = get(KEYS.JLPT_LEVEL) || 'N5'; };
    refresh();
    window.addEventListener('settings-synced', refresh);
    window.addEventListener('app-ready', refresh);
    return () => {
      window.removeEventListener('settings-synced', refresh);
      window.removeEventListener('app-ready', refresh);
    };
  });

  function greeting() {
    const h = new Date().getHours();
    if (h < 11) return { jp: 'おはよう！', en: 'Good morning' };
    if (h < 18) return { jp: 'こんにちは！', en: 'Good afternoon' };
    return { jp: 'こんばんは！', en: 'Good evening' };
  }
  const hello = greeting();

  function fmtDay(at) {
    const d = new Date(at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const same = (a, b) => a.toDateString() === b.toDateString();
    if (same(d, today)) return 'Today';
    if (same(d, yesterday)) return 'Yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  const pctOf = (e) => (e.total ? Math.round((e.score / e.total) * 100) : 0);
</script>

<div id="screen-start">
  <div class="dash-greeting">
    <div class="dash-greeting-jp">{hello.jp}</div>
    <div class="dash-greeting-en">{hello.en} — ready to practice?</div>
  </div>

  <div class="dash-stats">
    <StatCard icon="🔥" value={stats.streakDays} label={stats.streakDays === 1 ? 'day streak' : 'days streak'} accent={stats.streakDays > 0} />
    <StatCard icon="🎯" value={stats.sessions ? stats.avgPct + '%' : '—'} label="avg score" />
    <StatCard icon="📚" value={stats.sessions} label="sessions" />
  </div>

  <div class="dash-cta">
    <button
      class="btn btn-primary dash-start-btn"
      class:btn-disabled={!deckReady}
      id="btn-start-practice"
      disabled={!deckReady}
      onclick={startPractice}
    >
      {deckReady ? '▶ Start Practice' : '⏳ Import a deck to begin'}
    </button>
    <div class="dash-deck-summary">
      <span class="chip">
        {#if !deckReady}
          🗂 No questions loaded
        {:else if session.isDefaultDeck}
          🎓 Sample deck · {session.qa.length} questions
        {:else}
          🗂 Your deck · {session.qa.length} question{session.qa.length === 1 ? '' : 's'}
        {/if}
      </span>
      <span class="chip">📈 {jlptLevel}</span>
      <span class="chip chip-ai" id="ai-status-chip">🧠 AI: <span id="ai-status-text">Not configured</span></span>
    </div>
  </div>

  {#if recent.length > 0}
    <div class="dash-recent">
      <div class="dash-recent-title">Recent sessions</div>
      {#each recent as e (e.at)}
        <div class="dash-recent-row">
          <span class="dash-recent-day">{fmtDay(e.at)}</span>
          <span class="dash-recent-level">{e.jlpt || ''}</span>
          <span class="dash-recent-score" class:good={pctOf(e) >= 75}>{e.score}/{e.total} · {pctOf(e)}%</span>
        </div>
      {/each}
    </div>
  {:else}
    <p class="dash-empty">
      Your scores and streak will show up here after your first session.
    </p>
  {/if}

  <div class="dash-footer">
    <button class="btn btn-secondary btn-sm btn-report-bug">🐞 Report Bug</button>
  </div>
</div>

<style>
  .dash-greeting {
    text-align: center;
    margin-bottom: 18px;
  }

  .dash-greeting-jp {
    font-family: 'Noto Serif JP', serif;
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--text);
  }

  .dash-greeting-en {
    font-size: 0.82rem;
    color: var(--muted);
    margin-top: 2px;
  }

  .dash-stats {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
  }

  .dash-cta {
    text-align: center;
    margin-bottom: 20px;
  }

  .dash-start-btn {
    width: 100%;
    max-width: 420px;
    min-height: 52px;
    font-size: 1rem;
  }

  .dash-deck-summary {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    margin-top: 10px;
  }

  .dash-recent {
    border-top: 1px solid var(--border-light);
    padding-top: 14px;
  }

  .dash-recent-title {
    font-family: 'DM Mono', monospace;
    font-size: 0.68rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--teal);
    margin-bottom: 8px;
  }

  .dash-recent-row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 7px 2px;
    font-size: 0.85rem;
    border-bottom: 1px dashed var(--border-light);
  }

  .dash-recent-row:last-child {
    border-bottom: none;
  }

  .dash-recent-day {
    color: var(--text);
    min-width: 82px;
  }

  .dash-recent-level {
    color: var(--muted);
    font-size: 0.72rem;
    flex: 1;
  }

  .dash-recent-score {
    font-family: 'DM Mono', monospace;
    color: var(--muted);
  }

  .dash-recent-score.good {
    color: var(--correct);
  }

  .dash-empty {
    text-align: center;
    font-size: 0.8rem;
    color: var(--muted);
    border-top: 1px solid var(--border-light);
    padding-top: 16px;
  }

  .dash-footer {
    text-align: center;
    margin-top: 20px;
  }
</style>
