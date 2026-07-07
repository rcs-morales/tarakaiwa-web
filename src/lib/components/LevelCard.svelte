<script>
  // Level / XP card (Phase 5d) — the gamification headline shown on the Home
  // dashboard and (identically) on the Progress screen. Derives everything
  // from the reactive session history via the gamification module; no props.
  import { history } from '$lib/history.svelte.js';
  import { computeXP } from '$lib/gamification.svelte.js';

  const xp = $derived(computeXP(history.entries));
  const pct = $derived(Math.round((xp.xpInLevel / xp.xpForLevel) * 100));
  // "about one session" ≈ a handful of correct answers away.
  const nearly = $derived(xp.xpToNext <= 200);
</script>

<div class="level-card">
  <div class="level-head">
    <span class="level-label">Lv {xp.level} · {xp.title}</span>
    <span class="level-xp">{xp.xpInLevel} / {xp.xpForLevel} XP</span>
  </div>
  <div class="xp-track">
    <div class="xp-fill" style="width: {pct}%"></div>
  </div>
  <div class="level-hint">
    {xp.xpToNext} XP to Level {xp.level + 1}{nearly ? ' — about one session!' : ''}
  </div>
</div>

<style>
  .level-card {
    background: var(--surface);
    border: 2px solid var(--card-border);
    border-radius: 18px;
    padding: 14px 16px;
    margin-bottom: 16px;
  }

  .level-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }

  .level-label {
    font-weight: 800;
    font-size: 0.95rem;
    color: var(--text);
  }

  .level-xp {
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 0.82rem;
    color: var(--muted-2);
  }

  .xp-track {
    height: 14px;
    background: var(--faint);
    border-radius: 999px;
    overflow: hidden;
  }

  .xp-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--xp-grad-1), var(--xp-grad-2));
    transition: width 0.5s ease;
  }

  .level-hint {
    margin-top: 8px;
    font-size: 0.76rem;
    color: var(--muted);
  }
</style>
