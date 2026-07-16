<script>
  // Deck form modal — shared by "Create a deck" and per-card "Edit deck" on
  // the Decks tab. No `deck` prop = create mode (funnels through
  // decks.svelte.js's createDeck/importDeck). A `deck` prop = edit mode,
  // pre-filled from that deck and funneling through updateDeck/deleteDeck
  // instead. Reuses the global .modal / .modal-card chrome (see the
  // bug-report modal in +page.svelte).
  import { get, KEYS } from '$lib/settings.js';
  import { createDeck, updateDeck, deleteDeck, MAX_DECK_QUESTIONS } from '$lib/decks.svelte.js';
  import { showImportStatus } from '$lib/ui.js';

  let { deck, onclose } = $props();
  const isEdit = !!deck;

  const LEVELS = ['N5', 'N4', 'N3'];

  let name = $state(deck?.name ?? '');
  let rows = $state(
    deck ? deck.qa.map((r) => ({ q: r.q, a: r.a })) : [{ q: '', a: '' }, { q: '', a: '' }]
  );
  let level = $state(deck?.jlptLevel ?? get(KEYS.JLPT_LEVEL));
  let saving = $state(false);
  let deleting = $state(false);

  // Rows with both fields filled in — what actually gets saved. Blank rows
  // (e.g. a spare row the user never filled) are dropped silently rather
  // than blocking save.
  const validPairs = $derived(
    rows
      .map((r) => ({ q: r.q.trim(), a: r.a.trim() }))
      .filter((r) => r.q && r.a)
  );
  const canAddRow = $derived(rows.length < MAX_DECK_QUESTIONS);
  const canSave = $derived(validPairs.length > 0 && !saving && !deleting);

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
      if (isEdit) {
        const pushed = await updateDeck(deck.id, { name: name.trim(), qa: validPairs, jlptLevel: level });
        showImportStatus(
          pushed === false
            ? '✅ Saved changes (⚠️ cloud sync failed — the deck is saved on this device and will sync on your next sign-in)'
            : '✅ Deck updated',
          pushed === false ? 'info' : 'success'
        );
      } else {
        const pushed = await createDeck(name.trim() || undefined, validPairs, level);
        const count = validPairs.length;
        showImportStatus(
          pushed === false
            ? '✅ Created ' + count + ' question' + (count === 1 ? '' : 's') + ' (⚠️ cloud sync failed — the deck is saved on this device and will sync on your next sign-in)'
            : '✅ Created a deck with ' + count + ' question' + (count === 1 ? '' : 's'),
          pushed === false ? 'info' : 'success'
        );
      }
      onclose();
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!isEdit || deleting) return;
    if (!confirm('Delete "' + deck.name + '"? This cannot be undone.')) return;
    deleting = true;
    try {
      const pushed = await deleteDeck(deck.id);
      showImportStatus(
        pushed === false
          ? '🗑️ Deleted on this device (⚠️ cloud sync failed — it may reappear on your next sign-in)'
          : '🗑️ Deck deleted',
        'info'
      );
      onclose();
    } finally {
      deleting = false;
    }
  }
</script>

<div class="modal" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="modal-card cdm-card" role="dialog" aria-modal="true" aria-label={isEdit ? 'Edit deck' : 'Create a deck'}>
    <h3 class="cdm-title">{isEdit ? '✏️ Edit deck' : '✏️ Create a deck'}</h3>

    <div class="cdm-level-row">
      <span class="cdm-level-label">Deck level</span>
      <div class="cdm-level-picker">
        {#each LEVELS as lvl (lvl)}
          <button
            type="button"
            class="cdm-level-pill"
            class:selected={level === lvl}
            onclick={() => (level = lvl)}
          >{lvl}</button>
        {/each}
      </div>
    </div>

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

    <div class="modal-btn-row cdm-footer" class:cdm-footer-split={isEdit}>
      {#if isEdit}
        <button type="button" class="btn btn-danger btn-sm" onclick={remove} disabled={deleting || saving}>
          {deleting ? 'Deleting…' : 'Delete deck'}
        </button>
      {/if}
      <div class="cdm-footer-actions">
        <button type="button" class="btn btn-secondary" onclick={onclose}>Cancel</button>
        <button type="button" class="btn btn-primary" onclick={save} disabled={!canSave}>
          {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Save deck')}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .cdm-card {
    max-width: 520px;
  }

  .cdm-title {
    font-family: 'Noto Serif JP', serif;
    margin-bottom: 16px;
  }

  .cdm-level-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 18px;
  }

  .cdm-level-label {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--ink-mid);
  }

  .cdm-level-picker {
    display: flex;
    gap: 6px;
  }

  .cdm-level-pill {
    padding: 6px 14px;
    border-radius: 999px;
    border: 1.5px solid var(--border);
    background: var(--surface);
    color: var(--muted);
    font-size: 0.8rem;
    font-weight: 700;
    font-family: var(--font-mono);
    cursor: pointer;
  }

  .cdm-level-pill:hover {
    border-color: var(--primary);
  }

  .cdm-level-pill.selected {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--on-accent);
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

  .cdm-footer-split {
    justify-content: space-between;
  }

  .cdm-footer-actions {
    display: flex;
    gap: 12px;
  }
</style>
