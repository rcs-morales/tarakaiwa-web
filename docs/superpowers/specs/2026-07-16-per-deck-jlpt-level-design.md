# Per-Deck JLPT Level Design

## Context

Today every deck already stores a `jlptLevel` field (set once at creation from the global
`Settings → JLPT Level` picker), but it's write-only — it's shown as a chip on the deck
card and nothing else. Grading strictness, live-transcript furigana formatting, and the
Dashboard's level badge all read the single global `KEYS.JLPT_LEVEL` setting instead,
regardless of which deck is actually loaded.

This means a user who imports/creates an N4 deck but leaves their global setting at N5
gets N5-strictness grading on N4 content, and vice versa — the level chip on the deck card
is decorative, not functional. The user wants deck level to be user-selectable (at both
create and edit time), the Decks tab organized into N5/N4/N3 sections, and — the real
point — grading strictness to automatically follow whichever deck is active, with no
separate step required.

This spec was scoped immediately after merging the edit/delete-deck feature, which had
explicitly made `jlptLevel` fixed-at-creation as a simplifying constraint. This spec
reverses that constraint deliberately: it's now editable, because sorting decks into
level sections only makes sense if a deck can move between sections.

## Scope / decisions (confirmed with user)

- **Editable, not just selectable at creation.** The level picker appears in both create
  and edit mode of `DeckFormModal.svelte`. Changing a deck's level in edit mode moves it
  to a different section and changes its grading strictness the next time it's practiced.
- **Decks tab groups into labeled sections** — `N5`, `N4`, `N3` headers, in that order,
  each containing that level's decks in their existing (creation) order.
- **The Sample deck stays pinned above all sections**, exactly as it renders first today —
  it is not folded into the N5 section with user decks.
- **Grading strictness follows the active deck automatically.** No separate toggle: once a
  deck (of any level) is loaded into a practice session, `gradeWithAI`'s strictness prompt,
  the live-transcript furigana formatting, and the Dashboard's level badge all reflect that
  deck's `jlptLevel` — not the global setting.
- **The global `Settings → JLPT Level` picker is repurposed, not removed.** It becomes
  "default level for new decks" — it still writes `KEYS.JLPT_LEVEL` and that value still
  pre-fills the level picker when creating a new deck, but it no longer has any live effect
  on grading once a deck is active.

## Technical approach: thread the level through session state

Two approaches were considered:

- **A (chosen): thread `jlptLevel` through `session` state.** `session.svelte.js` already
  carries `activeDeckId`/`isDefaultDeck`, set by `setQA()` every time a deck loads
  (`loadActiveDeckIntoSession`, `setActiveDeck`, `importDeck`/`createDeck`'s
  auto-activation, and a future active-deck edit-save). Adding `session.jlptLevel` to that
  same call is a one-line extension of an existing, proven pattern — no new module
  coupling, no import-cycle risk.
- **B (rejected): a live-lookup helper** (e.g. `getActiveDeckLevel()` in
  `decks.svelte.js`) called fresh by each consumer instead of threading state. Avoids one
  new session field, but pulls `decks.svelte.js` — a module with side-effecting top-level
  `$state` initialization from `localStorage` — into `ai/grading.js`, `parser.js`, and
  `Dashboard.svelte`, none of which depend on it today. More coupling for no behavioral
  difference; rejected.

## Design

### 1. Data model

No changes. `deck.jlptLevel` already exists on every deck (including the frozen
`SAMPLE_DECK`, hardcoded `'N5'`). This feature makes it load-bearing, not new.

### 2. `session.svelte.js` — thread the level

```js
export function setQA(newData, { isDefault = false, deckId = null, jlptLevel = 'N5' } = {}) {
  session.qa = newData;
  session.isDefaultDeck = isDefault;
  session.activeDeckId = deckId;
  session.jlptLevel = jlptLevel;
}
```

Add `jlptLevel: 'N5'` to the initial `session` `$state` object (matches the existing
`DEFAULTS[KEYS.JLPT_LEVEL] = 'N5'` fallback used elsewhere).

Every existing call site in `decks.svelte.js` that calls `setQA(deck.qa, {...})` adds
`jlptLevel: deck.jlptLevel` to the options object: `loadActiveDeckIntoSession`,
`setActiveDeck`. `importDeck` doesn't call `setQA` directly — it calls `setActiveDeck`,
which already threads it.

`checkAnswer()` in `session.svelte.js` (around line 404) switches from
`get(KEYS.JLPT_LEVEL) || 'N5'` to `session.jlptLevel`.

### 3. `ai/grading.js` — grading strictness

`gradeWithAI`'s only real caller is `session.svelte.js:412`'s `checkAnswer()` (a second
hit, `src/lib/test_ai.js`, is an unrelated standalone manual debug script, not part of the
app or the test suite). `ai/grading.js` importing `session` from `session.svelte.js`
directly would create a circular import: `session.svelte.js` imports `gradeWithAI` from
`./ai/index.js`, which re-exports `./ai/grading.js` — so `session.svelte.js` →
`ai/index.js` → `ai/grading.js` → `session.svelte.js` would cycle.

Instead, `gradeWithAI` gains an explicit parameter:
`gradeWithAI(question, expectedAnswer, transcript, level = 'N5')` (around line 245),
replacing its internal `get(KEYS.JLPT_LEVEL)` read (line 251) with the parameter. Its sole
caller, `checkAnswer()`, passes `session.jlptLevel`. The default keeps
`test_ai.js`'s 3-arg calls working unchanged.

### 4. `parser.js` — live transcript formatting (no change; out of scope)

`formatLiveTranscript` (`parser.js:486-492`) already reads `get(KEYS.JLPT_LEVEL)` and
branches on `level === 'N5'` — but both branches call the identical
`transcriptToFurigana(s)`. This check has had no behavioral effect either way; it's dead
code, unrelated to this feature. Leave it untouched — rewiring a no-op branch to a new
data source is not this spec's concern, and removing the dead branch entirely is an
unrelated cleanup, not a per-deck-level requirement. (The actual N5-vs-other formatting
choice that matters — `transcriptToFurigana` vs. `transcriptToFuriganaForGrading` — lives
in `session.svelte.js`'s `checkAnswer`, covered in section 2 above.)

### 5. `DeckFormModal.svelte` — level picker

Replace the static level-hint paragraph with a picker reusing the same visual pattern as
`Onboarding.svelte`'s level cards (`LEVELS` array: N5/N4/N3, short id + short English
label) — duplicated as a small scoped component-local list rather than extracted into a
shared component, consistent with this codebase's existing per-component style scoping
(e.g. `Decks.svelte`'s own card styles aren't shared either).

- New `let level = $state(deck?.jlptLevel ?? get(KEYS.JLPT_LEVEL))` (create mode defaults
  to the global "default for new decks" setting; edit mode pre-fills from the deck).
- Create-mode save passes `level` into `createDeck`'s call — but `createDeck`/`importDeck`
  currently hardcode `jlptLevel: get(KEYS.JLPT_LEVEL)` internally. `createDeck(name, qa)`
  gains a third parameter: `createDeck(name, qa, jlptLevel)`, defaulting to
  `get(KEYS.JLPT_LEVEL)` for backward compatibility with the file-import call site (file
  import has no level picker — it keeps using the global default, unchanged).
- Edit-mode save passes `level` into `updateDeck(deck.id, { name, qa, jlptLevel: level })`.
  `updateDeck` in `decks.svelte.js` adds `jlptLevel` to the fields it overwrites (currently
  only overwrites `name`/`qa`/`updatedAt`, spreading the rest — add `jlptLevel` as an
  explicit override alongside `name`/`qa`).
- If the edited deck is the active deck, `updateDeck`'s existing `setQA(...)` reload call
  now also needs to pass the new `jlptLevel` through (see #2), so grading strictness
  updates immediately without needing to reselect the deck.

### 6. `decks.svelte.js` — `importDeck`/`createDeck`/`updateDeck` signatures

```js
export function importDeck(qa, name, jlptLevel) {
  const deck = {
    id: crypto.randomUUID(),
    name: name || 'My Deck',
    jlptLevel: jlptLevel || get(KEYS.JLPT_LEVEL),
    qa,
    updatedAt: new Date().toISOString(),
  };
  // ...unchanged below
}

export function createDeck(name, qa, jlptLevel) {
  return importDeck(qa, name, jlptLevel);
}
```

`import.js`'s `handleFileImport` calls `importDeck(qa, file.name)` — unchanged (no third
arg, so it falls back to the global default, matching today's behavior exactly for the
file-import path, which gets no level picker in this spec).

```js
export function updateDeck(id, { name, qa, jlptLevel }) {
  const idx = decks.list.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  const updated = {
    ...decks.list[idx],
    name: name || decks.list[idx].name,
    qa,
    jlptLevel: jlptLevel || decks.list[idx].jlptLevel,
    updatedAt: new Date().toISOString(),
  };
  decks.list = decks.list.map((d, i) => (i === idx ? updated : d));
  persistList(decks.list);
  if (decks.activeId === id) {
    setQA(updated.qa, { isDefault: false, deckId: id, jlptLevel: updated.jlptLevel });
  }
  return pushDeck(updated);
}
```

### 7. `Decks.svelte` — grouped sections

```js
const LEVEL_ORDER = ['N5', 'N4', 'N3'];
const grouped = $derived(
  LEVEL_ORDER.map((lvl) => ({
    level: lvl,
    decks: decks.list.filter((d) => d.jlptLevel === lvl),
  })).filter((g) => g.decks.length > 0)
);
```

Sample deck renders exactly as it does today (unaffected, still pinned above the new
grouped-sections markup). Below it, `{#each grouped as g (g.level)}` renders a section
heading (`<h3 class="decks-level-heading">{g.level}</h3>`) followed by that level's deck
cards (unchanged card markup/edit-icon wiring from the just-merged branch).

### 8. `Dashboard.svelte` / `LevelCard` — level badge

Replace the `onMount`/`$effect`/event-listener re-read-from-localStorage pattern (lines
21–37) with a direct `$derived(session.jlptLevel)` — `session` is already reactive
`$state`, so this is strictly simpler than what it replaces and updates instantly on deck
switch, no event plumbing needed.

### 9. Settings / Onboarding copy

`Settings.svelte`'s JLPT level select and `Onboarding.svelte`'s level-picker step get
their label/copy updated to communicate "default level for new decks" instead of implying
it drives grading directly. No behavioral change — both still call `set(KEYS.JLPT_LEVEL,
...)`.

## Non-goals

- No change to file-import's level handling — imported decks keep using the global default
  (no per-file level picker added to `import.js`'s flow in this spec).
- No migration needed — every existing deck already has `jlptLevel` populated.
- No N2/N1 support — the app's level set stays N5/N4/N3, matching `Onboarding.svelte`'s
  existing `LEVELS`.
- `Dashboard.svelte`'s `Start Practice to begin` empty-state and other unrelated Dashboard
  logic are untouched beyond the level-badge derivation.

## Testing

- `tests/decks.test.js`: `createDeck`/`importDeck` accepting and defaulting the third
  `jlptLevel` argument; `updateDeck` overwriting `jlptLevel` and reloading `session` with
  it when the edited deck is active.
- `tests/deckFormModal.test.js`: level picker renders and defaults correctly in both
  modes; changing it and saving passes the new level to `createDeck`/`updateDeck`.
- A `session.svelte.js`-focused test (new or extended) for `setQA` threading
  `jlptLevel` through and defaulting to `'N5'`.
- Manual verification (per the `verify` skill, same recipe as the last two features):
  create decks at different levels, confirm Decks tab sections and Sample-deck pinning;
  switch active deck between levels and confirm the Dashboard badge and a graded answer's
  strictness follow the switch without any Settings change.

## Critical files

- `src/lib/session.svelte.js` (`setQA`, `session` state, `checkAnswer`)
- `src/lib/decks.svelte.js` (`importDeck`, `createDeck`, `updateDeck`)
- `src/lib/ai/grading.js` (`gradeWithAI`)
- `src/lib/components/DeckFormModal.svelte` (level picker)
- `src/lib/components/Decks.svelte` (grouped sections)
- `src/lib/components/Dashboard.svelte` (level badge)
- `src/lib/components/Settings.svelte`, `src/lib/components/Onboarding.svelte` (copy only)
