<script>
  // First-run onboarding — restyled to the Kaiwa Quest sheet (Phase 5f):
  // step dots, hero avatar, level picker, press-down CTA. Now a 3-step flow:
  // welcome + JLPT level (new, wires the grading-strictness setting), then the
  // Phase 5b functional steps — deck pick and optional sign-in. Everything is
  // optional — the app works with the sample deck, signed out, at N5.
  import { onMount } from 'svelte';
  import { get, set, KEYS } from '$lib/settings.js';
  import { session } from '$lib/session.svelte.js';
  import { signInWithEmail, signInWithGoogle, onAuthChange, getCurrentUser } from '$lib/auth.js';
  import { setTab } from '$lib/shell.svelte.js';

  let open = $state(false);
  let step = $state(1);
  let user = $state(null);
  let email = $state('');
  let authMsg = $state('');
  let authMsgType = $state('info');
  let level = $state('N5');

  const STEPS = 3;

  // Deck info comes straight from the reactive session state — no event
  // plumbing needed since Phase 5c.
  const deckCount = $derived(session.qa.length);
  const deckIsSample = $derived(session.isDefaultDeck);

  const LEVELS = [
    { id: 'N5', en: 'Beginner — start here' },
    { id: 'N4', en: 'Upper beginner' },
    { id: 'N3', en: 'Intermediate' },
  ];

  onMount(() => {
    open = get(KEYS.SETUP_COMPLETE) !== '1';
    level = get(KEYS.JLPT_LEVEL) || 'N5';
    user = getCurrentUser();
    onAuthChange((u) => { user = u; });
  });

  // The level doubles as grading strictness — persist it and mirror the
  // Advanced select so the imperative wiring stays in agreement.
  function applyLevelAndContinue() {
    set(KEYS.JLPT_LEVEL, level);
    const sel = document.getElementById('jlpt-level-select');
    if (sel) sel.value = level;
    step = 2;
  }

  function importDeck() {
    // Reuse the Decks tab's file input — import.js already listens to it.
    document.getElementById('file-input')?.click();
  }

  async function sendMagicLink() {
    const addr = email.trim();
    if (!addr) {
      authMsg = 'Please enter your email address.';
      authMsgType = 'error';
      return;
    }
    authMsg = 'Sending magic link…';
    authMsgType = 'info';
    const { error } = await signInWithEmail(addr);
    if (error) {
      authMsg = '❌ ' + error.message;
      authMsgType = 'error';
    } else {
      authMsg = '✅ Check your inbox for the sign-in link.';
      authMsgType = 'success';
    }
  }

  async function googleSignIn() {
    const { error } = await signInWithGoogle();
    if (error) {
      authMsg = '❌ ' + error.message;
      authMsgType = 'error';
    }
  }

  function finish() {
    set(KEYS.SETUP_COMPLETE, '1');
    open = false;
    setTab('practice');
  }
</script>

{#if open}
  <div class="onboarding-veil">
    <div class="onboarding-sheet" role="dialog" aria-modal="true" aria-label="Welcome to TaraKaiwa">
      <div class="sheet-dots" aria-label="Step {step} of {STEPS}">
        {#each { length: STEPS } as _, i}
          <span class="sheet-dot" class:active={step === i + 1}></span>
        {/each}
      </div>

      {#if step === 1}
        <div class="sheet-hero">
          <img class="sheet-hero-img" src="/assets/zundamon.png" alt="" />
        </div>
        <h2 class="sheet-heading">ようこそ！</h2>
        <div class="sheet-subheading">Welcome to TaraKaiwa</div>
        <p class="sheet-text">
          Practice speaking Japanese out loud — a friendly avatar asks, you
          answer, and AI checks how you did.
        </p>

        <div class="sheet-picker-label">Choose your level</div>
        <div class="level-picker">
          {#each LEVELS as l (l.id)}
            <button
              class="level-card"
              class:selected={level === l.id}
              onclick={() => (level = l.id)}
            >
              <span class="level-card-id">{l.id}</span>
              <span class="level-card-en">{l.en}</span>
            </button>
          {/each}
        </div>

        <button class="btn btn-primary sheet-wide-btn" onclick={applyLevelAndContinue}>はじめよう · Get started</button>
        <p class="sheet-reassure">Takes 5 min a day · No account needed to try</p>
      {:else if step === 2}
        <div class="sheet-icon">🗂️</div>
        <h2 class="sheet-heading sheet-heading-sm">Pick your deck</h2>
        <p class="sheet-text">
          A deck is the set of questions you'll practice with. Start with the
          built-in sample, or import your own Excel / CSV / JSON file.
        </p>

        <div class="deck-status" class:ready={deckCount > 0}>
          {#if deckCount === 0}
            No questions loaded yet
          {:else if deckIsSample}
            🎓 Sample deck — {deckCount} N5 questions ready
          {:else}
            ✅ Your deck — {deckCount} question{deckCount === 1 ? '' : 's'} loaded
          {/if}
        </div>

        <button class="btn btn-secondary sheet-wide-btn" onclick={importDeck}>📁 Import my own file</button>
        <button class="btn btn-primary sheet-wide-btn" onclick={() => (step = 3)} disabled={deckCount === 0}>Continue →</button>
        <button class="sheet-back-link" onclick={() => (step = 1)}>⬅ Back</button>
      {:else}
        <div class="sheet-icon">👤</div>
        <h2 class="sheet-heading sheet-heading-sm">Sync across devices?</h2>
        <p class="sheet-text">
          Optional — sign in to sync your settings, deck and scores. You can
          also add a Groq API key later under <strong>Settings</strong>
          to bypass daily quota sharing for AI grading.
        </p>

        {#if user}
          <div class="deck-status ready">🔒 Signed in as {user.email || 'your account'}</div>
        {:else}
          <form class="sheet-email-row" onsubmit={(e) => { e.preventDefault(); sendMagicLink(); }}>
            <input type="email" class="api-key-input" placeholder="you@example.com"
              autocomplete="email" bind:value={email} />
          </form>
          <button class="btn btn-import sheet-wide-btn" onclick={sendMagicLink}>📧 Send Magic Link</button>
          <button class="btn btn-secondary sheet-wide-btn" onclick={googleSignIn}>Continue with Google</button>
          {#if authMsg}
            <div class="sheet-auth-msg {authMsgType}">{authMsg}</div>
          {/if}
        {/if}

        <button class="btn btn-primary sheet-wide-btn sheet-finish" onclick={finish}>
          {user ? 'Start practicing ✔' : 'Skip — start practicing ✔'}
        </button>
        <button class="sheet-back-link" onclick={() => (step = 2)}>⬅ Back</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .onboarding-veil {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: var(--overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .onboarding-sheet {
    background: var(--canvas);
    border-radius: 26px;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.25);
    padding: 24px 24px 22px;
    width: 100%;
    max-width: 420px;
    max-height: calc(100vh - 32px);
    overflow-y: auto;
    text-align: center;
  }

  /* ── Step dots ── */
  .sheet-dots {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 6px;
    margin-bottom: 16px;
  }

  .sheet-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--dashed-ring);
    transition: width 0.2s ease, background 0.2s ease;
  }

  .sheet-dot.active {
    width: 22px;
    background: var(--primary);
  }

  /* ── Hero ── */
  .sheet-hero {
    width: 150px;
    height: 150px;
    margin: 0 auto 14px;
    border-radius: 34px;
    background: var(--primary-tint);
    border: 2px solid var(--card-border);
    overflow: hidden;
    display: flex;
    align-items: flex-start;
    justify-content: center;
  }

  .sheet-hero-img {
    width: 100%;
    height: auto;
  }

  .sheet-icon {
    font-size: 2.2rem;
    margin-bottom: 6px;
  }

  .sheet-heading {
    font-weight: 800;
    font-size: 1.75rem;
    color: var(--text);
    margin-bottom: 2px;
  }

  .sheet-heading-sm {
    font-size: 1.25rem;
    margin-bottom: 8px;
  }

  .sheet-subheading {
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--muted-2);
    margin-bottom: 10px;
  }

  .sheet-text {
    font-size: 0.85rem;
    color: var(--muted);
    line-height: 1.55;
    margin-bottom: 16px;
  }

  /* ── Level picker ── */
  .sheet-picker-label {
    font-size: 0.69rem;
    letter-spacing: 0.14em;
    font-weight: 800;
    color: var(--primary);
    text-transform: uppercase;
    text-align: left;
    margin-bottom: 8px;
  }

  .level-picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 18px;
  }

  .level-card {
    display: flex;
    align-items: baseline;
    gap: 10px;
    width: 100%;
    min-height: 48px;
    padding: 12px 14px;
    border: 2px solid var(--card-border);
    border-radius: 18px;
    background: var(--surface);
    color: var(--text);
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .level-card:hover {
    border-color: var(--primary);
  }

  .level-card.selected {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--on-accent);
    box-shadow: 0 4px 0 var(--primary-shadow);
  }

  .level-card-id {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 1.05rem;
  }

  .level-card-en {
    font-size: 0.8rem;
    font-weight: 600;
    opacity: 0.85;
  }

  .sheet-reassure {
    font-size: 0.72rem;
    color: var(--muted);
    margin-top: 12px;
  }

  /* ── Shared step furniture ── */
  .deck-status {
    font-size: 0.85rem;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1.5px solid var(--card-border);
    background: var(--surface);
    color: var(--muted);
    margin-bottom: 14px;
  }

  .deck-status.ready {
    border-color: var(--ok-border);
    background: var(--ok-bg);
    color: var(--correct);
  }

  .sheet-wide-btn {
    display: block;
    width: 100%;
    margin-top: 10px;
  }

  .sheet-email-row {
    margin-bottom: 2px;
  }

  .sheet-email-row .api-key-input {
    width: 100%;
  }

  .sheet-auth-msg {
    font-size: 0.78rem;
    margin-top: 10px;
    line-height: 1.4;
  }

  .sheet-auth-msg.error { color: var(--wrong); }
  .sheet-auth-msg.success { color: var(--correct); }
  .sheet-auth-msg.info { color: var(--muted); }

  .sheet-finish {
    margin-top: 18px;
  }

  .sheet-back-link {
    background: none;
    border: none;
    color: var(--muted);
    font-size: 0.78rem;
    margin-top: 12px;
    cursor: pointer;
  }

  .sheet-back-link:hover {
    color: var(--text);
  }
</style>
