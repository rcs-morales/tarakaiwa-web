<script>
  // Create-a-deck modal — the manual-entry sibling to file import (Decks tab).
  // Reuses the global .modal / .modal-card chrome (see the bug-report modal in
  // +page.svelte) and funnels the save straight through decks.svelte.js's
  // createDeck(), which is just importDeck() under a clearer name: it already
  // handles add/persist/activate/cloud-sync, so this component only builds
  // the { q, a } array and hands it off.
  import { get, KEYS } from '$lib/settings.js';
  import { createDeck, MAX_DECK_QUESTIONS } from '$lib/decks.svelte.js';
  import { showImportStatus } from '$lib/ui.js';

  let { onclose } = $props();

  let name = $state('');
  let rows = $state([{ q: '', a: '' }, { q: '', a: '' }]);
  let saving = $state(false);

  const level = get(KEYS.JLPT_LEVEL);

  // Rows with both fields filled in — what actually gets saved. Blank rows
  // (e.g. a spare row the user never filled) are dropped silently rather
  // than blocking save.
  const validPairs = $derived(
    rows
      .map((r) => ({ q: r.q.trim(), a: r.a.trim() }))
      .filter((r) => r.q && r.a)
  );
  const canAddRow = $derived(rows.length < MAX_DECK_QUESTIONS);
  const canSave = $derived(validPairs.length > 0 && !saving);

  function addRow() {
    if (canAddRow) rows.push({ q: '', a: '' });
  }

  function removeRow(i) {
    if (rows.length > 1) rows.splice(i, 1);
  }

  async function save() {
    if (!canSave) return;
    saving = true;
    try {
      const pushed = await createDeck(name.trim() || undefined, validPairs);
      if (pushed === false) {
        showImportStatus('✅ Created ' + validPairs.length + ' question' + (validPairs.length === 1 ? '' : 's') + ' (⚠️ cloud sync failed — the deck is saved on this device and will sync on your next sign-in)', 'info');
      } else {
        showImportStatus('✅ Created a deck with ' + validPairs.length + ' question' + (validPairs.length === 1 ? '' : 's'), 'success');
      }
      onclose();
    } finally {
      saving = false;
    }
  }
</script>

<div class="modal" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="modal-card cdm-card" role="dialog" aria-modal="true" aria-label="Create a deck">
    <h3 class="cdm-title">✏️ Create a deck</h3>
    <p class="cdm-level-hint">
      New decks use your current level: <strong>JLPT {level}</strong> — change it in Settings.
    </p>

    <label class="cdm-name-label" for="cdm-name">Deck name (optional)</label>
    <input id="cdm-name" class="api-key-input cdm-name-input" type="text" placeholder="My Deck" bind:value={name} />

    <div class="cdm-rows">
      {#each rows as row, i (i)}
        <div class="cdm-row">
          <div class="cdm-row-head">
            <span class="cdm-row-num">{i + 1}</span>
            <button
              type="button"
              class="cdm-remove-btn"
              onclick={() => removeRow(i)}
              disabled={rows.length <= 1}
              aria-label="Remove question {i + 1}"
            >✖</button>
          </div>
          <input class="api-key-input" type="text" placeholder="Question (日本語)" bind:value={row.q} />
          <input class="api-key-input" type="text" placeholder="Answer" bind:value={row.a} />
        </div>
      {/each}
    </div>

    <div class="cdm-add-row">
      <button type="button" class="btn btn-secondary btn-sm" onclick={addRow} disabled={!canAddRow}>
        ＋ Add question
      </button>
      <span class="cdm-counter">{rows.length}/{MAX_DECK_QUESTIONS}</span>
    </div>

    <div class="modal-btn-row cdm-footer">
      <button type="button" class="btn btn-secondary" onclick={onclose}>Cancel</button>
      <button type="button" class="btn btn-primary" onclick={save} disabled={!canSave}>
        {saving ? 'Saving…' : 'Save deck'}
      </button>
    </div>
  </div>
</div>

<style>
  .cdm-card {
    max-width: 520px;
  }

  .cdm-title {
    font-family: 'Noto Serif JP', serif;
    margin-bottom: 6px;
  }

  .cdm-level-hint {
    font-size: 0.8rem;
    color: var(--muted);
    margin-bottom: 18px;
    line-height: 1.5;
  }

  .cdm-name-label {
    display: block;
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--ink-mid);
    margin-bottom: 6px;
  }

  .cdm-name-input {
    width: 100%;
    margin-bottom: 18px;
  }

  .cdm-rows {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 320px;
    overflow-y: auto;
    padding-right: 2px;
    margin-bottom: 4px;
  }

  .cdm-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    border: 1.5px solid var(--border);
    border-radius: 10px;
    background: var(--surface-alt);
  }

  .cdm-row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .cdm-row-num {
    font-size: 0.72rem;
    font-weight: 800;
    color: var(--muted);
  }

  .cdm-remove-btn {
    background: none;
    border: none;
    color: var(--muted);
    font-size: 0.78rem;
    cursor: pointer;
    padding: 2px 6px;
  }

  .cdm-remove-btn:hover:not(:disabled) {
    color: var(--wrong);
  }

  .cdm-remove-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .cdm-add-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 14px 0 4px;
  }

  .cdm-counter {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--muted);
  }

  .cdm-footer {
    margin-top: 20px;
  }
</style>
