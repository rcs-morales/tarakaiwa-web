# Scenario Dialogue Practice Design

## Context

Every practice session today is a **single-turn Q&A drill**. `session.qa` holds `{ q, a, r }`
items. For each one the avatar speaks `q`, the learner answers, and `gradeWithAI` checks the
answer against the expected answer `a`, strictly: particle, tense and wording mismatches all
fail. That is good for accuracy drills, but it never practices the thing learners actually
need in Japan: getting through a short real-world exchange such as ordering at a café, asking
for directions or buying a train ticket. In those exchanges the other person reacts to what
you said, and "good enough to be understood" is what counts.

This spec adds **scenario lessons**: short, built-in, role-played conversations. The avatar
plays a character (a barista, a passer-by, a station attendant) and holds a 4–6 turn dialogue
with the learner. Each turn has a communicative goal, and the character's next line reacts to
what the learner actually said.

## Scope / decisions (confirmed with user)

- **Multi-turn dialogue simulation**, not just themed Q&A decks. The avatar stays in
  character, reacts to the learner's actual words, and the conversation moves forward turn
  by turn.
- **Built-in curated packs.** Scenario content ships with the app, hand-written and grouped by
  JLPT level. Users can't create or edit scenarios in v1.
- **Surfaced as a new "Scenarios" section in the Decks tab.** No new top-level tab. Selecting
  a scenario makes it the active item, the same way selecting a deck does, and the Practice
  tab's existing Start button launches it.

## Proposed decisions (need sign-off; see Open questions)

- **Grade communication, not exact wording.** A turn passes when the learner achieves its goal
  in understandable Japanese at their level. Grammar slips still appear in the feedback
  breakdown but don't fail the turn unless they block meaning. This is deliberately more
  lenient than deck grading.
- **One attempt per turn after Check, same as decks.** The learner can still re-record or edit
  the transcript *before* pressing Check, exactly as today.
- **Scenario turns earn XP exactly like correct answers.** Passed turns count as `score`,
  total turns as `total`. XP, daily goal, streaks and badges then work with no changes.

## Technical approach: scripted "beats" + AI-adapted character lines

Three approaches were considered:

- **A. Free-form LLM role-play (rejected).** A system prompt describes the scene and the model
  improvises every character line. It feels the most natural, but it is unpredictable: it
  drifts off-level and off-topic, conversations have no fixed length (so there is no
  meaningful `score/total`), no line can be cached ahead of time for Voicevox, and it can't
  work offline at all.
- **B. Hand-authored branching tree (rejected).** Fully deterministic and offline-capable,
  but matching free speech against branches is brittle. Every "I'd like tea, not coffee"
  needs its own authored branch, which is far more content to write and still breaks.
- **C. Scripted beats with AI adaptation (chosen).** Each scenario is an ordered list of
  **beats**. A beat is one character line, one goal for the learner, and a model answer. The
  script fixes the conversation's shape, length and level. With AI access, a single LLM call
  per turn (1) judges whether the goal was met and (2) rewrites the character's *next* line so
  it reacts to what the learner said (「紅茶ですね。ホットと　アイス、どちらが…」). Without AI,
  the scripted lines play as written and grading falls back to local matching. This gives a
  fixed turn count, pre-cacheable audio, bounded cost and an offline path.

### Why beats fit the existing engine almost for free

Map each beat onto a normal `qa` item:

```js
{ q: beat.npc, a: beat.a, r: beat.r, goal: beat.goal }
```

Then nearly all of `session.svelte.js` works unchanged: speak `q`, listen, transcribe,
re-record, edit the transcript, reveal the hint (`a`/`r`), translate `q`, the progress bar,
Skip, End, and recording the session. The branches needed are small and listed in §6. This
also keeps scenarios inside the existing `#screen-practice`, which matters because the Live2D
canvas in `#avatar-container` must never be unmounted (`Practice.svelte`, `+page.svelte`). A
separate scenario screen would need a second avatar or a way to move the canvas.

## Design

### 1. Data model: `src/lib/scenarios.js` (new)

```js
export const SCENARIOS = Object.freeze([
  {
    id: 'cafe',                         // stable; stored in history as 'scenario:cafe'
    title: 'At the Café',
    titleJp: 'カフェで　ちゅうもん',
    icon: '☕',
    jlptLevel: 'N5',
    role: { jp: '店員', en: 'Barista', persona: 'a friendly barista at a small café in Tokyo' },
    setting: 'You walk into a small café in Tokyo. The barista greets you at the counter.',
    keyPhrases: [
      { jp: '〜を　ください', en: '~, please' },
      { jp: '〜で　おねがいします', en: "I'll have it ~ (choice)" },
      { jp: '〜で　いいですか', en: 'Is ~ okay?' },
    ],
    beats: [
      { npc: 'いらっしゃいませ。なにに　しますか。',
        goal: 'Order a drink', a: 'コーヒーを　ください。', r: 'Kōhī o kudasai.' },
      // ...see "Starter content" below for full scripts
    ],
    closing: { jp: 'ありがとうございました！', en: 'Thank you very much!' },
  },
]);

export function scenarioDeckId(scenario) { /* 'scenario:' + id */ }
export function findScenarioByDeckId(deckId) { /* null for anything not 'scenario:<known id>' */ }
export function scenarioToQA(scenario) {
  return scenario.beats.map((b) => ({ q: b.npc, a: b.a, r: b.r, goal: b.goal }));
}
```

`SCENARIOS` is authored in level order (N5 → N4 → N3), so the Decks tab renders it directly.

The text style matches `DEFAULT_QA` in `data.js`: kana with full-width spaces (U+3000)
between phrases at N5, and romaji in `r` so the hint/tutorial path doesn't need an AI
romaji call.

`scenarioToQA` must return **fresh objects** every time. `session.qa` gets mutated during a
run (§6, character-line substitution), and the scenario data itself is frozen.

### 2. `session.svelte.js`: one new field

```js
export const session = $state({ /* ...existing... */ scenario: null });

export function setQA(newData, { isDefault = false, deckId = null, jlptLevel = 'N5', scenario = null } = {}) {
  // ...existing four assignments...
  session.scenario = scenario;
}
```

`session.scenario` holds the scenario object for a scenario run and `null` for a deck run.
Every mode branch in this spec is `if (session.scenario)`. No separate `mode` enum, same
single-field pattern as `jlptLevel`.

### 3. `decks.svelte.js`: scenarios as selectable active items

Scenario ids use a `scenario:` prefix (`'scenario:cafe'`). That way `decks.activeId`,
`session.activeDeckId` and history `deckId` can each hold a scenario id with no new field,
and the id can never collide with a deck UUID or with `null` (the Sample deck).

- `findDeck(id)`: if `id?.startsWith('scenario:')`, build a deck-shaped view:
  `{ id, name: s.title, jlptLevel: s.jlptLevel, qa: scenarioToQA(s), scenario: s }`.
- `setActiveDeck` / `loadActiveDeckIntoSession`: both build their `setQA` options through a
  shared `sessionOptions(deck)` helper, which adds `scenario` only for scenario views (so deck
  runs pass exactly the options they did before, and `setQA`'s default resets
  `session.scenario` to `null`). The scenario view has no `builtin` flag, so the existing
  `deck.builtin ? null : deck.id` and `isDefault: !!deck.builtin` expressions already give the
  right answer (`deckId: 'scenario:cafe'`, `isDefault: false`).
- A stored scenario id that no longer exists in the catalog resolves to `null`, so boot falls
  back to the Sample deck the same way a deleted deck does.
- `startPractice` rebuilds `session.qa` from `scenarioToQA(session.scenario)` in place of
  shuffling, so every run starts from the original script.
- `KEYS.ACTIVE_DECK_ID` is already device-local (excluded from sync, `sync.js:25`), so a
  stored scenario id never reaches another device.

### 4. AI: one merged turn-evaluation call

**`prompts.js`** gains `getScenarioTurnPrompt({ level, scenario, beat, nextBeat, turns, transcript })`
and `SCENARIO_SYSTEM_PROMPT`. The prompt gives:

- the scene, the character's persona, the learner's JLPT level;
- the conversation so far (`turns`: prior character line + learner transcript pairs, capped
  at the last 6);
- the current beat's **goal** and **model answer** (as a reference, not a target to match);
- the next beat's scripted character line (`nextBeat.npc`, or the closing line when this is
  the final beat).

It asks for JSON:

```json
{
  "goal_met": true,
  "score": 85,
  "general_feedback": "One encouraging English sentence.",
  "suggested_answer": "A natural way to say what the learner meant, at their level",
  "breakdown": [{ "original": "", "corrected": "", "category": "", "explanation": "" }],
  "npc_reply": "The character's next line in Japanese"
}
```

Prompt rules (differences from `getGradingPrompt`):

- **Goal-based judging.** `goal_met` is true when the learner achieves the goal
  understandably. Any valid choice passes: ordering 紅茶 when the model answer says コーヒー is
  correct. Only meaning-blocking errors fail the turn. Other slips go in `breakdown`.
- **Corrections are grounded in what the learner said**, not in the model answer. "Tea" must
  never be "corrected" to "coffee".
- **`npc_reply` rules:** stay in character, stay at or below `level`, keep it to 1–2 short
  sentences, briefly acknowledge the learner's actual choice, then deliver the *meaning* of
  `nextBeat.npc` (rephrase only as far as consistency with the learner's choice requires).
  If `goal_met` is false, repair the conversation the way a real clerk would: confirm the
  model answer's choice as a question (「コーヒーですね？」) and continue. If the learner goes
  off-topic, steer back.
- The existing rules still apply: ignore script/numeral/punctuation differences, grade only
  the final attempt, write explanations in English, use correct polite-form terminology, and
  output JSON only.

**`src/lib/ai/scenarioTurn.js`** (new) exports
`evaluateScenarioTurn({ scenario, beatIndex, transcript, turns, level })`. It returns a
`gradeResult`-shaped object (`correct` = `goal_met`, plus `score`, `general_feedback`,
`suggested_answer`, `breakdown`, `source: 'groq'`) plus `npc_reply`, or `null` on failure,
the same contract as `gradeWithAI`. The request/retry handling copies `gradeWithAI`
(json_object mode, then a fallback without it on a `response_format` error, and
`RATE_LIMIT` tracking).

**It must not reuse `finalizeAIGradingResult`** (`grading.js:114`). That function's local
safety nets (tense, particle and completeness checks *against the expected answer*) would
wrongly fail valid alternative answers. Reuse only:

- `parseAIGradingResponse`, extended or wrapped to also read `goal_met` and `npc_reply`;
- `groundBreakdown(breakdown, transcript)` and the `isScriptOrNumeralOnlyBreakdown` filter;
- the `sanitize` helper.

**Guardrail:** `npc_reply` is accepted only if it is non-empty, contains Japanese script, and
is under ~80 characters. Otherwise, use the scripted `nextBeat.npc`. The conversation can
never derail because of a bad model response.

### 5. Offline / no-AI fallback

With no AI access, `evaluateScenarioTurn` returns `null` and the existing local path runs:
`isCorrectLocal(raw, item.a, item.q)`. Local matching is strict against the model answer, so
the offline mode is effectively **guided shadowing**:

- The model-answer box is shown from turn 1. The existing no-AI branch in `beginListen`
  (`session.svelte.js:446`) shows it only from question 4 onward. For scenarios, drop the
  `session.current >= 3` condition and use the label "💬 Say this line:".
- Character lines play exactly as scripted.

### 6. `session.svelte.js` branches

| Where | Change for `session.scenario` |
|---|---|
| `startPractice` shuffle (`:93-99`) | **Never shuffle.** Beat order *is* the conversation. |
| `loadQuestion` progress label (`:181`) | `'Turn N / M'` instead of `'Question N / M'`. |
| `beginListen` no-AI box (`:446`) | Show the model answer from turn 1 (§5). Skip the Sample-deck tutorial box (already skipped: `isDefaultDeck` is false). |
| `finishRecording` Whisper hint (`:539`) | Pass `item.q` (the character line) instead of `item.a`. Whisper's `prompt` is meant as preceding context. Biasing it toward the model answer risks it "hearing" コーヒー when the learner said 紅茶. |
| `checkAnswer` grading (`:663`) | Call `evaluateScenarioTurn(...)` instead of `gradeWithAI`, building `turns` from `session.results`. Same `isCorrectLocal` fallback on `null`. |
| `checkAnswer` after grading | If there is a next beat and a valid `npc_reply`, replace `session.qa[current + 1].q` with it, then `preloadVoicevoxAudio(npc_reply)` in Voicevox mode so the audio downloads while the learner reads feedback. Push `goal` onto the results entry. |
| `checkAnswer` spoken verdict (`:744`) | Skip the spoken 正解です／不正解です in scenarios, because it breaks the conversation. Keep the sound effect and the status text. The character's reaction is heard when the learner presses Next (`loadQuestion` speaks the substituted `q`). |
| `handleFinishPractice` (`:821`) | Use `scenario.closing` (`{ jp, en }`) as the overlay `choice` instead of a random praise line. |

`nextQuestion`, `skipQuestion`, `endSession`, `rerecordAnswer`, the edit-transcript functions,
`translateQuestion`, `getQuestionRomaji` and `revealAnswerHint` need **no changes**.

### 7. `Practice.svelte`: conversation UI

All existing ids and elements stay. Add reactive markup (Svelte, not imperative) shown only
when `session.scenario`:

- **Scenario strip** above the question row: `{icon} {titleJp}` plus the current goal chip
  "🎯 {session.qa[session.current].goal}".
- **Conversation log** between the avatar and the question row. It is derived from
  `session.results`: for each finished turn, a character bubble (`r.q`, prefixed with
  `role.jp`) and a learner bubble (`r.transcript`, ✓/✗ tint). It stays scrolled to the
  bottom and is height-capped on mobile (the existing "no mid-recording scroll" constraint
  on the practice screen).
- The "Question" label in `.practice-question-row` reads `{role.jp} · {role.en}`. The current
  line keeps the hidden-by-default "Show Text" toggle, so it stays listening-first like decks.

### 8. `Dashboard.svelte`: scenario briefing

When `session.scenario` is set:

- The deck-summary chip (`:68-77`) reads `{icon} {title} · {n} turns`.
- A **briefing card** above the Start button shows the `setting` text, the goal checklist
  (all beat `goal`s) and `keyPhrases`. This is standard task-based teaching: the learner
  sees the task and the useful phrases before speaking. Start stays
  `はじめる — Start Practice`.

### 9. `Decks.svelte`: Scenarios section

New section between the pinned Sample deck (`:48-79`) and the user's level groups
(`:81-121`):

```svelte
<h3 class="decks-level-heading">シナリオ · Scenarios</h3>
{#each allScenarios() as s (s.id)}
  {@const id = 'scenario:' + s.id}
  <!-- same .deck-card-wrap / .deck-card markup; onclick={() => setActiveDeck(id)} -->
  <!-- name: `{s.icon} {s.titleJp}`, subtitle: s.title -->
  <!-- chips: JLPT {s.jlptLevel} · {s.beats.length} turns · best score (bestScoreForDeck(id)) -->
  <!-- "◉ In use" pill when decks.activeId === id; no edit button (built-in, read-only) -->
{/each}
```

The card markup and styles are reused from the existing deck cards. There is no new
component; that matches this file's inline style.

### 10. `Results.svelte`: conversation framing

When `session.scenario` is set:

- The title reads `{icon} {titleJp} · Complete!`.
- A **goal checklist** above the list: each beat's `goal` with ✓/✗ from `r.correct`.
- Each result row relabels its lines: `{role.jp}: {r.q}` / `You: {r.transcript}` /
  `💡 Model answer: {r.a}`. The feedback card (`general_feedback` + `breakdown`) renders
  unchanged.

The score card, XP, daily goal and badges need no changes.

### 11. History & cloud sync

**Locally, nothing changes.** `showResults` already records
`deckId = session.activeDeckId` (`'scenario:cafe'`), and `bestScoreForDeck('scenario:cafe')`
works on it as-is.

**At the Supabase boundary**, `session_results.deck_id` is a `uuid` FK to `decks`
(migration 0001), so a scenario id can't go there.

- New migration **`0004_session_results_scenario.sql`**:
  `alter table public.session_results add column if not exists scenario_id text;`
  (additive, same style as 0003).
- `saveSessionResult` (`sync.js:246`): if `deckId` starts with `scenario:`, insert
  `deck_id: null, scenario_id: <bare id>`. **Only include the `scenario_id` key for scenario
  runs.** Then deck-run inserts keep working even before the migration is applied.
- `fetchSessionHistory` (`sync.js:290`): select `scenario_id` too, and map
  `deckId: r.scenario_id ? 'scenario:' + r.scenario_id : r.deck_id`.
- **Rollout order:** apply 0004 before deploying. The fetch selects the new column, and an
  unknown column fails the whole history fetch (the app falls back to local history, but
  signed-in users lose their cross-device view until the migration is applied). Add 0004 to
  the README's migration list.

### 12. TTS / Voicevox

The scripted character lines are ordinary `session.qa[].q` texts, so the existing pre-session
voice-pack check (`startPractice:118-128`) and background warmup (`app.js`
`voicePackTexts`) already cache them. The closing line must also be warmed: add
`scenario.closing.jp` to the warmup text list when `session.scenario` is set. AI-adapted
lines can't be cached ahead of time. The preload in §6 hides most of that delay, and in the
worst case playback falls back to fetch-on-demand as it does today.

## Turn flow

```
Next / start ──► loadQuestion: avatar speaks session.qa[i].q   (scripted, or adapted last turn)
                 └─► listen ──► Finish Recording ──► Whisper (hint = q) ──► transcript
                      └─► [re-record / edit, as today] ──► Check
                           └─► evaluateScenarioTurn ──► { goal_met, feedback, npc_reply }
                                ├─ null → isCorrectLocal vs a (offline shadowing)
                                ├─ show feedback card, play ✓/✗ sound (no spoken verdict)
                                ├─ qa[i+1].q = npc_reply (if valid) + Voicevox preload
                                └─ Next ──► loop │ last turn ──► closing line + Results
```

## Starter content (v1 catalog)

Six scenarios: five at N5, one at N4. Two are fully scripted below; the other four follow
the same shape and are written in the content task (Phase 5). Every Japanese line needs a
native or teacher proofread before release.

**☕ カフェで　ちゅうもん: At the Café (N5, barista 店員)**

| # | Character says | Learner goal | Model answer |
|---|---|---|---|
| 1 | いらっしゃいませ。なにに　しますか。 | Order a drink | コーヒーを　ください。 |
| 2 | ホットと　アイス、どちらが　いいですか。 | Choose hot or iced | アイスで　おねがいします。 |
| 3 | サイズは　どう　しますか。 | Choose a size | ちいさいのを　おねがいします。 |
| 4 | ここで　のみますか。 | Say whether you'll drink it here | はい、ここで　のみます。 |
| 5 | ４５０えんです。 | Ask if you can pay by card | カードで　いいですか。 |

Closing: はい、だいじょうぶです。ありがとうございました！

**🗺️ みちを　きく: Asking for Directions (N5, passer-by 通行人)**

The character opens the conversation (you look lost), so every scenario keeps the
"character speaks first" invariant.

| # | Character says | Learner goal | Model answer |
|---|---|---|---|
| 1 | あのう、だいじょうぶですか。 | Ask where the post office is | すみません、ゆうびんきょくは　どこですか。 |
| 2 | この　みちを　まっすぐ　いって、ふたつめの　かどを　みぎに　まがって　ください。 | Repeat the directions back to confirm | まっすぐ　いって、ふたつめの　かどを　みぎですね。 |
| 3 | はい、そうです。ぎんこうの　となりに　ありますよ。 | Ask how long it takes on foot | あるいて　なんぷん　ぐらい　かかりますか。 |
| 4 | ５ふんぐらいです。 | Thank them | そうですか。どうも　ありがとうございました。 |

Closing: いいえ、どういたしまして。きを　つけて。

**Outlined (written in Phase 5):**

- 🏪 **コンビニで: Convenience store (N5).** Bag or no bag, heat the bento, chopsticks,
  point card, pay.
- 🚉 **えきで: At the station (N5).** Ticket price to a destination, how many tickets,
  which platform, time of the next train.
- 🙋 **じこしょうかい: Meeting someone new (N5).** Name, country, work/study, hobby, how
  long you've been in Japan.
- 🍜 **レストランで: At a restaurant (N4).** Party size, ask for a recommendation, say what
  you can't eat, ask for the bill.

Later candidates: clothes shopping, clinic visit, hotel check-in (N4); phone reservation
(N3).

## Cost & quota

Each turn costs one Whisper call (same as a deck question) and **one** chat call: grading and
the character reply are merged, the same count as `gradeWithAI` today. The optional English
hint translations cost the same as for decks. A 5-turn scenario therefore uses about 5 chat
calls, or about 15 with English hints on. That is well within the shared
`CHAT_DAILY_LIMIT = 200` (`server/quota.js`), and there is no proxy or quota change.

## Non-goals

- User-authored or user-edited scenarios, and scenario import/export.
- Free-form conversations with no script, or branching into different beat sequences.
- Letting the learner open the conversation (every beat starts with a character line).
- Retrying a turn after Check (see Open questions).
- Changes to deck grading, the Sample-deck tutorial, or `gradeWithAI`.
- New avatar models, character voices per role, or background art per scene.
- N2/N1 content.

## Open questions

1. **Leniency.** Should a turn pass when the goal is met but with minor grammar slips
   (proposed: yes, slips appear in the breakdown only)? Or should scenarios use deck-level
   strictness?
2. **Retry after a failed turn.** Keep one attempt after Check (proposed for v1), or add a
   "Try again" option on a failed turn that re-asks the same beat?
3. **Current character line: text hidden by default?** Proposed: keep the listening-first
   "Show Text" toggle, same as decks. Past turns in the log always show text.
4. **v1 catalog.** Are the six scenarios above the right starting set, and is one N4
   scenario enough?
5. **XP parity.** Should scenario turns earn the same `XP_PER_CORRECT` as deck answers
   (proposed), or a bonus for finishing a whole scenario?

## Testing

- `tests/scenarios.test.js` (new): the `SCENARIOS` schema (every beat has `npc`, `goal`,
  `a`, `r`; ids are unique; levels are in N5/N4/N3; every scenario has a `closing`).
  `scenarioToQA` returns fresh, mutable copies.
- `tests/decks.test.js`: `setActiveDeck('scenario:cafe')` calls `setQA` with the mapped qa,
  `deckId: 'scenario:cafe'`, `isDefault: false`, and the scenario object. An unknown
  scenario id is a no-op.
- `tests/session.test.js`: no shuffle when `session.scenario` is set. The "Turn N / M"
  label. `checkAnswer` routes to `evaluateScenarioTurn` and substitutes the next `q` with a
  valid `npc_reply`, keeps the scripted line when the reply is invalid, and falls back to
  `isCorrectLocal` when the result is `null`. No spoken verdict in scenario mode. The
  closing line is used as the finish overlay choice.
- `tests/scenarioTurn.test.js` (new, alongside `ai.test.js`): response parsing
  (`goal_met`/`npc_reply`, truncated JSON), the `npc_reply` guardrail, the json_object
  fallback retry, `RATE_LIMIT` tracking. **A valid alternative answer (紅茶 vs model
  コーヒー) is not failed by any local safety net.**
- `tests/decks` / new component tests: the Scenarios section renders, selecting a scenario
  shows the "In use" pill, and the scenario card has no edit button.
- `tests/dashboard.test.js`, `tests/results.test.js`: the briefing card, the goal
  checklist and the relabelled rows when `session.scenario` is set; deck runs render
  unchanged.
- `sync.js`: scenario runs insert `scenario_id` and a null `deck_id`; deck runs send no
  `scenario_id` key; fetch maps `scenario_id` back to `'scenario:…'`.
- **Manual (browser):** play the café scenario with a BYO key, ordering something *other*
  than the model answer, and check that the barista's next line acknowledges it. Repeat
  signed out with no key (shadowing mode). Repeat in Voicevox mode and watch for mid-turn
  audio delay. Check the Decks section, Dashboard briefing and Results on mobile width.

## Implementation phases

Each phase can be merged on its own and leaves the app working.

1. **Content and plumbing (no AI changes).** `scenarios.js` with the café and directions
   scenarios, the `session.scenario` field, the `decks.svelte.js` lookup, the Decks tab
   section, the no-shuffle and "Turn N / M" changes, and the Dashboard chip and briefing.
   *Checkpoint:* scenarios are playable end to end with existing grading, which is strict
   against the model answer.
2. **AI turn engine.** `getScenarioTurnPrompt`, `ai/scenarioTurn.js`, the `checkAnswer`
   branch, character-line substitution with the guardrail, the Voicevox preload, the
   Whisper hint change, no spoken verdict, and the offline shadowing label.
   *Checkpoint:* the character reacts to what the learner says.
3. **Conversation UI.** The scenario strip, goal chip and conversation log in
   `Practice.svelte`; Results relabelling and goal checklist; the closing line on finish.
4. **Persistence.** Migration 0004, the `saveSessionResult`/`fetchSessionHistory` mapping,
   and the README migration list.
5. **Content and verification.** Write and proofread the remaining four scenarios, add a
   "What's New" entry, and run the manual browser pass.

## Critical files

- `src/lib/scenarios.js` (new: data, `findScenario`, `scenarioToQA`)
- `src/lib/ai/scenarioTurn.js` (new), `src/lib/ai/prompts.js`, `src/lib/ai/index.js` (re-export)
- `src/lib/session.svelte.js` (`session.scenario`, `setQA`, the branches in §6)
- `src/lib/decks.svelte.js` (`findDeck`, `allScenarios`)
- `src/lib/components/Decks.svelte`, `Dashboard.svelte`, `Practice.svelte`, `Results.svelte`
- `src/lib/sync.js` (`saveSessionResult`, `fetchSessionHistory`)
- `src/lib/app.js` (`voicePackTexts`: warm the closing line)
- `supabase/migrations/0004_session_results_scenario.sql` (new), `README.md`
