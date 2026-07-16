<script>
  // Decks tab (Phase 5d step 5) — pick which deck to practice, or import a
  // new one. Reads/writes the reactive multi-deck list in decks.svelte.js;
  // #file-input stays wired imperatively (app.js binds its 'change' handler
  // by id, same as before).
  import { allDecks, decks, setActiveDeck, bestScoreForDeck } from '$lib/decks.svelte.js';
  import DeckFormModal from './DeckFormModal.svelte';

  const list = $derived(allDecks());
  let showCreate = $state(false);

  function triggerImport() {
    document.getElementById('file-input')?.click();
  }
</script>

<div class="decks-screen">
  <h2 class="decks-title">デッキ <span class="decks-title-en">· Decks</span></h2>
  <p class="decks-subtitle">Pick a deck to practice, or add your own.</p>

  <div class="decks-add-row">
    <button type="button" class="decks-import-card" onclick={triggerImport}>
      ＋ Import a deck
    </button>
    <button type="button" class="decks-import-card" onclick={() => (showCreate = true)}>
      ＋ Create a deck
    </button>
  </div>
  <input type="file" id="file-input" accept=".json,.csv,.txt,.xlsx,.xls" class="hidden" />
  <div class="import-status" id="import-status"></div>

  {#if showCreate}
    <DeckFormModal onclose={() => (showCreate = false)} />
  {/if}

  {#each list as d (d.id ?? 'default')}
    {@const best = bestScoreForDeck(d.id ?? null)}
    <button
      type="button"
      class="deck-card"
      class:active={(d.id ?? null) === decks.activeId}
      onclick={() => setActiveDeck(d.id ?? null)}
    >
      {#if (d.id ?? null) === decks.activeId}
        <span class="deck-inuse-pill">◉ In use</span>
      {/if}
      <div class="deck-name">{d.name}</div>
      {#if d.subtitle}
        <div class="deck-subtitle">{d.subtitle}</div>
      {/if}
      <div class="deck-chips">
        <span class="deck-chip">{d.qa.length} question{d.qa.length === 1 ? '' : 's'}</span>
        <span class="deck-chip">JLPT {d.jlptLevel}</span>
        {#if best === null}
          <span class="deck-chip deck-chip-neutral">Not started</span>
        {:else if best >= 75}
          <span class="deck-chip deck-chip-good">Best {best}%</span>
        {:else}
          <span class="deck-chip deck-chip-low">Best {best}%</span>
        {/if}
      </div>
    </button>
  {/each}

  <div class="decks-shuffle-row">
    <label class="decks-shuffle-label">
      <input type="checkbox" id="shuffle-questions-checkbox" checked />
      🔀 Shuffle question order each session
    </label>
    <p class="decks-shuffle-hint">Turn off to practice questions in the same order as the deck file.</p>
  </div>
</div>

<style>
  .decks-screen {
    width: 100%;
  }

  .decks-title {
    font-family: var(--font-jp);
    font-weight: 800;
    font-size: 1.2rem;
    color: var(--text);
    margin-bottom: 2px;
  }

  .decks-title-en {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--muted);
  }

  .decks-subtitle {
    font-size: 0.82rem;
    color: var(--muted);
    font-weight: 500;
    margin-bottom: 16px;
  }

  .decks-add-row {
    display: flex;
    gap: 10px;
    margin-bottom: 12px;
  }

  .decks-import-card {
    display: block;
    flex: 1;
    width: 100%;
    background: var(--surface);
    border: 2px dashed #e7c7a0;
    border-radius: 20px;
    padding: 15px 10px;
    text-align: center;
    color: var(--primary);
    font-weight: 800;
    font-size: 0.88rem;
    cursor: pointer;
  }

  .decks-import-card:hover {
    background: var(--surface-hover);
  }

  .deck-card {
    display: block;
    width: 100%;
    text-align: left;
    background: var(--surface);
    border: 2px solid var(--card-border);
    border-radius: 20px;
    padding: 15px 16px;
    margin-bottom: 12px;
    position: relative;
    cursor: pointer;
  }

  .deck-card.active {
    border-color: var(--primary);
  }

  .deck-inuse-pill {
    position: absolute;
    top: 12px;
    right: 14px;
    background: var(--primary-tint);
    color: var(--primary);
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 0.66rem;
    font-weight: 800;
  }

  .deck-name {
    font-weight: 800;
    font-size: 1rem;
    color: var(--text);
    padding-right: 70px;
  }

  .deck-subtitle {
    font-size: 0.75rem;
    color: var(--muted);
    font-weight: 500;
    margin-top: 1px;
  }

  .deck-chips {
    display: flex;
    gap: 6px;
    margin-top: 10px;
    flex-wrap: wrap;
  }

  .deck-chip {
    background: var(--faint);
    border-radius: 999px;
    padding: 4px 11px;
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--muted-2);
  }

  .deck-chip-good {
    background: var(--success-tint);
    color: var(--success);
  }

  .deck-chip-low {
    background: var(--amber-bg);
    color: var(--amber-text);
  }

  .deck-chip-neutral {
    color: var(--muted);
  }

  .decks-shuffle-row {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }

  .decks-shuffle-label {
    font-size: 0.85rem;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .decks-shuffle-hint {
    font-size: 0.72rem;
    color: var(--muted);
    margin-top: 4px;
  }
</style>
