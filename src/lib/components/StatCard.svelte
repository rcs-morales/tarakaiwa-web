<script>
  let { icon, value, label, accent = false } = $props();
</script>

<div class="stat-card" class:accent>
  <span class="stat-icon" aria-hidden="true">{icon}</span>
  <span class="stat-value">{value}</span>
  <span class="stat-label">{label}</span>
</div>

<style>
  .stat-card {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 14px 8px 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface-alt);
  }

  .stat-card.accent {
    border-color: var(--teal);
    background: var(--tint-teal);
  }

  .stat-icon {
    font-size: 1.15rem;
    line-height: 1;
  }

  .stat-value {
    font-family: 'DM Mono', monospace;
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--text);
    line-height: 1.2;
  }

  .stat-label {
    font-size: 0.62rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    text-align: center;
  }
</style>
