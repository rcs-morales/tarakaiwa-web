<script>
  // First-run onboarding (Phase 5b): a 2-step sheet that replaces the old
  // multi-step settings wizard. Step 1 picks a deck (sample or import),
  // step 2 offers optional sign-in. Everything here is optional — the app
  // works with the sample deck, signed out.
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

  // Deck info comes straight from the reactive session state — no event
  // plumbing needed since Phase 5c.
  const deckCount = $derived(session.qa.length);
  const deckIsSample = $derived(session.isDefaultDeck);

  onMount(() => {
    open = get(KEYS.SETUP_COMPLETE) !== '1';
    user = getCurrentUser();
    onAuthChange((u) => { user = u; });
  });

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
      <div class="sheet-step-indicator">Step {step} of 2</div>

      {#if step === 1}
        <div class="sheet-icon">🗂️</div>
        <h2>Pick your deck</h2>
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
        <button class="btn btn-primary sheet-wide-btn" onclick={() => (step = 2)} disabled={deckCount === 0}>Continue →</button>
      {:else}
        <div class="sheet-icon">👤</div>
        <h2>Sync across devices?</h2>
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
        <button class="sheet-back-link" onclick={() => (step = 1)}>⬅ Back</button>
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
    background: var(--surface);
    border-radius: 16px;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.25);
    padding: 28px 26px 24px;
    width: 100%;
    max-width: 420px;
    text-align: center;
  }

  .sheet-step-indicator {
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 12px;
  }

  .sheet-icon {
    font-size: 2.2rem;
    margin-bottom: 6px;
  }

  .onboarding-sheet h2 {
    font-family: 'Noto Serif JP', serif;
    font-size: 1.25rem;
    color: var(--text);
    margin-bottom: 8px;
  }

  .sheet-text {
    font-size: 0.85rem;
    color: var(--muted);
    line-height: 1.55;
    margin-bottom: 16px;
  }

  .deck-status {
    font-size: 0.85rem;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface-alt);
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
