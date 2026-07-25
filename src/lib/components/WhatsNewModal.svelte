<script>
  // One-time "what's new" announcement for RETURNING users only — shown once
  // per device the first time it loads after WHATS_NEW_VERSION changes.
  // Brand-new users never see it: Onboarding.svelte's finish() marks the
  // current version seen the moment they complete onboarding, since nothing
  // in the list is "new" to someone who just signed up. Reuses the app's
  // global .modal/.modal-card chrome (see AvatarModal.svelte for the same pattern).
  import { onMount } from 'svelte';
  import { get, set, KEYS } from '$lib/settings.js';
  import { WHATS_NEW_VERSION, WHATS_NEW_ITEMS } from '$lib/whatsNew.js';

  let open = $state(false);

  onMount(() => {
    open = get(KEYS.SETUP_COMPLETE) === '1' && get(KEYS.WHATS_NEW_SEEN) !== WHATS_NEW_VERSION;
  });

  function dismiss() {
    set(KEYS.WHATS_NEW_SEEN, WHATS_NEW_VERSION);
    open = false;
  }
</script>

{#if open}
  <div class="modal" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) dismiss(); }}>
    <div class="modal-card wnm-card" role="dialog" aria-modal="true" aria-label="What's new">
      <div class="wnm-head">
        <span class="wnm-badge">✨ What's new</span>
        <button type="button" class="wnm-close" onclick={dismiss} aria-label="Close">✕</button>
      </div>

      <ul class="wnm-list">
        {#each WHATS_NEW_ITEMS as item}
          <li class="wnm-item">
            <span class="wnm-icon">{item.icon}</span>
            <div>
              <div class="wnm-item-title">{item.title}</div>
              <p class="wnm-item-text">{item.text}</p>
            </div>
          </li>
        {/each}
      </ul>

      <button type="button" class="btn btn-primary wnm-got-it" onclick={dismiss}>Got it</button>
    </div>
  </div>
{/if}

<style>
  .wnm-card {
    max-width: 400px;
  }

  .wnm-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .wnm-badge {
    font-family: 'Noto Serif JP', serif;
    font-size: 1.1rem;
    font-weight: 700;
  }

  .wnm-close {
    background: none;
    border: none;
    color: var(--muted);
    font-size: 0.9rem;
    cursor: pointer;
    padding: 4px;
  }

  .wnm-list {
    list-style: none;
    margin: 0 0 20px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .wnm-item {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .wnm-icon {
    flex: 0 0 auto;
    font-size: 1.4rem;
    line-height: 1.4;
  }

  .wnm-item-title {
    font-weight: 700;
    font-size: 0.92rem;
    margin-bottom: 2px;
  }

  .wnm-item-text {
    font-size: 0.85rem;
    color: var(--muted);
    line-height: 1.5;
    margin: 0;
  }

  .wnm-got-it {
    display: block;
    width: 100%;
  }
</style>
