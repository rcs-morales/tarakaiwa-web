<script>
  // App shell (Phase 5b): slim top bar with the brand, desktop tab nav,
  // theme toggle and the account/quota menu; bottom tab bar on mobile.
  // The account menu's status nodes (#account-bar-status, #quota-chip) are
  // always rendered (toggled with CSS) because app.js and quota.js write to
  // them imperatively by id.
  import { shell, setTab, TABS } from '$lib/shell.svelte.js';
  import { history, computeStats } from '$lib/history.svelte.js';
  import { computeXP } from '$lib/gamification.svelte.js';

  let { children } = $props();

  // Gamification status pills — derived from the reactive session history.
  let streak = $derived(computeStats(history.entries).streakDays);
  let totalXP = $derived(computeXP(history.entries).totalXP);

  let menuOpen = $state(false);
  let menuWrap;

  function onWindowClick(e) {
    if (menuOpen && menuWrap && !menuWrap.contains(e.target)) menuOpen = false;
  }

  function onWindowKeydown(e) {
    if (e.key === 'Escape') menuOpen = false;
  }

  function goToAccountSettings() {
    menuOpen = false;
    setTab('settings');
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown} />

<div class="shell">
  <header class="topbar">
    <div class="brand">
      <span class="brand-jp">TaraKaiwa</span>
      <span class="brand-sub">Japanese Speaking Practice</span>
    </div>

    <nav class="topnav" aria-label="Sections">
      {#each TABS as t (t.id)}
        <button
          class="nav-btn"
          class:active={shell.tab === t.id}
          aria-current={shell.tab === t.id ? 'page' : undefined}
          onclick={() => setTab(t.id)}
        ><span class="nav-icon" aria-hidden="true">{t.icon}</span>{t.label}</button>
      {/each}
    </nav>

    <div class="status-pills" aria-label="Your progress">
      <span class="pill pill-streak" title="Day streak">
        <span aria-hidden="true">🔥</span><span class="pill-num">{streak}</span>
      </span>
      <span class="pill pill-xp" title="Total XP">
        <span aria-hidden="true">◆</span><span class="pill-num">{totalXP}</span>
      </span>
    </div>

    <div class="topbar-actions">
      <button id="btn-theme-toggle" class="icon-btn" title="Switch theme">🌙</button>
      <div class="account-menu-wrap" bind:this={menuWrap}>
        <button
          class="icon-btn"
          id="btn-account-menu"
          title="Account"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          onclick={() => (menuOpen = !menuOpen)}
        >👤</button>
        <div class="account-menu" class:open={menuOpen}>
          <div class="account-menu-status" id="account-bar-status">🔓 Not signed in — practice saves to this device only</div>
          <div class="account-menu-quota hidden" id="quota-chip"><span id="quota-text"></span></div>
          <button class="account-menu-action" id="btn-account-open" onclick={goToAccountSettings}>👤 Account &amp; sync settings</button>
        </div>
      </div>
    </div>
  </header>

  <main class="shell-main">
    {@render children?.()}
  </main>

  <nav class="bottomnav" aria-label="Sections">
    {#each TABS as t (t.id)}
      <button
        class="bottomnav-btn"
        class:active={shell.tab === t.id}
        aria-current={shell.tab === t.id ? 'page' : undefined}
        onclick={() => setTab(t.id)}
      >
        <span class="bottomnav-icon" aria-hidden="true">{t.icon}</span>
        <span class="bottomnav-label">{t.label}</span>
      </button>
    {/each}
  </nav>
</div>

<style>
  .shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* ── Top bar ── */
  .topbar {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 16px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  .brand {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
    min-width: 0;
  }

  .brand-jp {
    font-family: var(--font-jp);
    font-weight: 800;
    font-size: 1.2rem;
    color: var(--text);
    letter-spacing: 0.01em;
  }

  .brand-sub {
    font-size: 0.62rem;
    color: var(--muted);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  /* ── Desktop nav (top-right) ── */
  .topnav {
    display: flex;
    gap: 4px;
    margin-left: auto;
  }

  .nav-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: none;
    color: var(--ink-mid);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }

  .nav-btn:hover {
    background: var(--surface-hover);
  }

  .nav-btn.active {
    background: var(--tint-teal);
    border-color: var(--teal);
    color: var(--teal);
  }

  .nav-icon {
    font-size: 0.95rem;
  }

  /* ── Status pills (streak + XP) ── */
  .status-pills {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 11px;
    border-radius: 999px;
    border: 1.5px solid transparent;
    font-size: 0.82rem;
    line-height: 1;
    white-space: nowrap;
  }

  .pill-num {
    font-family: var(--font-mono);
    font-weight: 500;
  }

  .pill-streak {
    background: var(--amber-bg);
    border-color: var(--amber-border);
    color: var(--amber-text);
  }

  .pill-xp {
    background: var(--primary-tint);
    border-color: var(--primary-tint);
    color: var(--primary);
  }

  /* ── Top bar actions (theme + account) ── */
  .topbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .icon-btn {
    width: 36px;
    height: 36px;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: var(--surface-alt);
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .icon-btn:hover {
    background: var(--surface-hover);
  }

  .account-menu-wrap {
    position: relative;
  }

  .account-menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 260px;
    padding: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 24px var(--border-faint), 0 2px 8px var(--border-faint);
    display: none;
  }

  .account-menu.open {
    display: block;
  }

  .account-menu-status {
    font-size: 0.8rem;
    color: var(--muted);
    line-height: 1.4;
  }

  .account-menu-quota {
    font-size: 0.78rem;
    color: var(--muted);
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border-light);
  }

  .account-menu-quota.hidden {
    display: none;
  }

  .account-menu-action {
    display: block;
    width: 100%;
    margin-top: 10px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-alt);
    color: var(--text);
    font-size: 0.82rem;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }

  .account-menu-action:hover {
    background: var(--surface-hover);
  }

  /* ── Main content ── */
  .shell-main {
    flex: 1;
    width: 100%;
  }

  /* ── Mobile bottom tab bar ── */
  .bottomnav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 50;
    display: none;
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding: 4px 4px calc(4px + env(safe-area-inset-bottom));
  }

  .bottomnav-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 2px;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }

  .bottomnav-btn.active {
    color: var(--teal);
    background: var(--tint-teal);
  }

  .bottomnav-icon {
    font-size: 1.2rem;
    line-height: 1;
  }

  .bottomnav-label {
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.03em;
  }

  @media (max-width: 719px) {
    .topnav {
      display: none;
    }

    /* Wordmark only on phones — the pills and actions ride to the right. */
    .brand-sub {
      display: none;
    }

    .status-pills {
      margin-left: auto;
    }

    .topbar {
      gap: 10px;
    }

    .bottomnav {
      display: flex;
    }

    /* keep content clear of the fixed bottom bar */
    .shell-main {
      padding-bottom: 72px;
    }
  }
</style>
