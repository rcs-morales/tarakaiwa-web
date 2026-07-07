<script>
  // Progress tab (Phase 5e) — longitudinal motivation: level card, this
  // week's streak circles, an XP-per-day bar chart, and the badge shelf.
  // Everything derives reactively from session history; no new stores.
  import LevelCard from './LevelCard.svelte';
  import { history } from '$lib/history.svelte.js';
  import { computeWeek, computeBadges } from '$lib/gamification.svelte.js';

  const week = $derived(computeWeek(history.entries));
  const shelf = $derived(computeBadges(history.entries));
  // Peak-day bar is highlighted amber; today's bar vermillion (today wins).
  const maxXP = $derived(Math.max(...week.days.map((d) => d.xp), 1));
</script>

<div class="progress-screen">
  <h2 class="progress-title">進捗 <span class="progress-title-en">· Progress</span></h2>
  <p class="progress-subtitle">Your level, streak and badges at a glance.</p>

  <LevelCard />

  <!-- ── This week's streak ── -->
  <div class="progress-card">
    <div class="progress-card-label">This week's streak</div>
    <div class="week-row">
      {#each week.days as d (d.key)}
        <div class="week-day">
          <div
            class="week-circle"
            class:done={d.practiced && !d.isToday}
            class:today={d.isToday}
            class:future={d.isFuture}
          >
            {#if d.isToday}◆{:else if d.practiced}🔥{:else}·{/if}
          </div>
          <div class="week-label" class:today={d.isToday}>{d.label}</div>
        </div>
      {/each}
    </div>
  </div>

  <!-- ── XP this week ── -->
  <div class="progress-card">
    <div class="chart-head">
      <div class="progress-card-label">XP this week</div>
      <div class="chart-total">+{week.weekXP} XP</div>
    </div>
    <div class="chart-row">
      {#each week.days as d (d.key)}
        <div class="chart-col">
          <div
            class="chart-bar"
            class:today={d.isToday}
            class:peak={!d.isToday && d.xp > 0 && d.xp === maxXP}
            style="height: {Math.max(Math.round((d.xp / maxXP) * 100), 6)}%"
          ></div>
          <span class="chart-label" class:today={d.isToday}>{d.label}</span>
        </div>
      {/each}
    </div>
  </div>

  <!-- ── Badge shelf ── -->
  <div class="progress-card">
    <div class="progress-card-label">Badges · {shelf.earnedCount} of {shelf.total}</div>
    <div class="badge-grid">
      {#each shelf.badges as b (b.id)}
        <div class="badge-cell" title="{b.label}">
          <div class="badge-tile" class:locked={!b.earned} class:amber={b.earned && b.tint === 'amber'}
            class:green={b.earned && b.tint === 'green'} class:primary={b.earned && b.tint === 'primary'}>
            {b.earned ? b.emoji : '🔒'}
          </div>
          <div class="badge-caption" class:locked={!b.earned}>{b.caption}</div>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .progress-title {
    font-size: 1.35rem;
    font-weight: 800;
    margin: 2px 0 2px;
  }

  .progress-title-en {
    color: var(--muted);
    font-weight: 700;
    font-size: 1rem;
  }

  .progress-subtitle {
    color: var(--muted);
    font-size: 0.85rem;
    margin: 0 0 14px;
  }

  .progress-card {
    background: var(--surface);
    border: 2px solid var(--card-border);
    border-radius: 20px;
    padding: 14px 16px;
    margin-bottom: 14px;
  }

  .progress-card-label {
    font-size: 0.69rem;
    letter-spacing: 0.14em;
    font-weight: 800;
    color: var(--primary);
    text-transform: uppercase;
  }

  /* ── Weekly streak circles ── */
  .week-row {
    display: flex;
    justify-content: space-between;
    margin-top: 12px;
  }

  .week-day {
    text-align: center;
  }

  .week-circle {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    background: var(--faint);
    color: var(--muted);
    font-weight: 700;
  }

  .week-circle.done {
    background: var(--primary-tint);
    color: var(--primary);
    font-size: 16px;
  }

  .week-circle.today {
    background: var(--primary);
    color: var(--on-accent);
    box-shadow: 0 0 0 3px var(--primary-tint);
  }

  .week-circle.future {
    background: transparent;
    border: 2px dashed var(--dashed-ring);
    color: var(--muted);
    font-size: 12px;
  }

  .week-label {
    font-size: 0.63rem;
    color: var(--muted);
    font-weight: 700;
    margin-top: 4px;
  }

  .week-label.today {
    color: var(--primary);
    font-weight: 800;
  }

  /* ── XP chart ── */
  .chart-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    justify-content: space-between;
  }

  .chart-total {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--muted-2);
  }

  .chart-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 6px;
    height: 76px;
    margin-top: 14px;
  }

  .chart-col {
    flex: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
  }

  .chart-bar {
    width: 100%;
    background: var(--chart-bar);
    border-radius: 6px 6px 0 0;
    transition: height 0.5s ease;
  }

  .chart-bar.peak {
    background: var(--xp-grad-1);
  }

  .chart-bar.today {
    background: var(--primary);
  }

  .chart-label {
    font-size: 0.56rem;
    color: var(--muted);
    font-weight: 700;
  }

  .chart-label.today {
    color: var(--primary);
    font-weight: 800;
  }

  /* ── Badge shelf ── */
  .badge-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px 8px;
    margin-top: 14px;
  }

  .badge-cell {
    text-align: center;
  }

  .badge-tile {
    width: 52px;
    height: 52px;
    margin: 0 auto;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 26px;
    background: var(--faint);
    border: 2px solid var(--card-border);
  }

  .badge-tile.amber   { background: var(--amber-bg);     border-color: var(--amber-border); }
  .badge-tile.green   { background: var(--success-tint); border-color: var(--success-border); }
  .badge-tile.primary { background: var(--primary-tint); border-color: var(--primary); }

  .badge-tile.locked {
    border-style: dashed;
    border-color: var(--dashed-ring);
    font-size: 24px;
    opacity: 0.5;
  }

  .badge-caption {
    font-size: 0.6rem;
    color: var(--muted-2);
    font-weight: 700;
    margin-top: 5px;
  }

  .badge-caption.locked {
    color: var(--muted);
    opacity: 0.7;
  }
</style>
