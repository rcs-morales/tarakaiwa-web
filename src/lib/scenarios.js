// ─────────────────────────────────────────────
// SCENARIOS — built-in role-play conversations
// ─────────────────────────────────────────────
//
// Each scenario is a short scripted conversation: an ordered list of beats,
// each one a line the character says, a goal for the learner, and a model
// answer. A scenario plays through the normal practice session by mapping
// its beats onto qa items (scenarioToQA), so the character line is spoken
// like a question and the model answer serves as the expected answer/hint.
//
// Scenario ids are stored anywhere a deck id is (active pointer, session,
// history) with a 'scenario:' prefix so they can never collide with a deck
// UUID or the Sample deck's null id.

const ID_PREFIX = 'scenario:';

export const SCENARIOS = Object.freeze([
  {
    id: 'cafe',
    title: 'At the Café',
    titleJp: 'カフェで　ちゅうもん',
    icon: '☕',
    jlptLevel: 'N5',
    role: { jp: '店員', en: 'Barista', persona: 'a friendly barista at a small café in Tokyo' },
    setting: 'You walk into a small café in Tokyo. The barista greets you at the counter.',
    keyPhrases: [
      { jp: '〜を　ください', en: '~, please' },
      { jp: '〜で　おねがいします', en: "I'd like it ~ (making a choice)" },
      { jp: '〜で　いいですか', en: 'Is ~ okay?' },
    ],
    beats: [
      { npc: 'いらっしゃいませ。なにに　しますか。', goal: 'Order a drink',
        a: 'コーヒーを　ください。', r: 'Kōhī o kudasai.' },
      { npc: 'ホットと　アイス、どちらが　いいですか。', goal: 'Choose hot or iced',
        a: 'アイスで　おねがいします。', r: 'Aisu de onegaishimasu.' },
      { npc: 'サイズは　どう　しますか。', goal: 'Choose a size',
        a: 'ちいさいのを　おねがいします。', r: 'Chiisai no o onegaishimasu.' },
      { npc: 'ここで　のみますか。', goal: "Say whether you'll drink it here",
        a: 'はい、ここで　のみます。', r: 'Hai, koko de nomimasu.' },
      { npc: '４５０えんです。', goal: 'Ask if you can pay by card',
        a: 'カードで　いいですか。', r: 'Kādo de ii desu ka.' },
    ],
    closing: { jp: 'はい、だいじょうぶです。ありがとうございました！', en: "Sure, that's fine. Thank you very much!" },
  },
  {
    id: 'directions',
    title: 'Asking for Directions',
    titleJp: 'みちを　きく',
    icon: '🗺️',
    jlptLevel: 'N5',
    role: { jp: '通行人', en: 'Passer-by', persona: 'a kind local passer-by near a train station' },
    setting: "You're near a train station, looking for the post office. A passer-by notices you look lost.",
    keyPhrases: [
      { jp: 'すみません、〜は　どこですか', en: 'Excuse me, where is ~?' },
      { jp: '〜ですね', en: "So it's ~, right? (confirming)" },
      { jp: 'なんぷん　ぐらい　かかりますか', en: 'About how many minutes does it take?' },
    ],
    beats: [
      { npc: 'あのう、だいじょうぶですか。', goal: 'Ask where the post office is',
        a: 'すみません、ゆうびんきょくは　どこですか。', r: 'Sumimasen, yūbinkyoku wa doko desu ka.' },
      { npc: 'この　みちを　まっすぐ　いって、ふたつめの　かどを　みぎに　まがって　ください。',
        goal: 'Repeat the directions back to confirm',
        a: 'まっすぐ　いって、ふたつめの　かどを　みぎですね。', r: 'Massugu itte, futatsume no kado o migi desu ne.' },
      { npc: 'はい、そうです。ぎんこうの　となりに　ありますよ。', goal: 'Ask how long it takes on foot',
        a: 'あるいて　なんぷん　ぐらい　かかりますか。', r: 'Aruite nanpun gurai kakarimasu ka.' },
      { npc: '５ふんぐらいです。', goal: 'Thank them',
        a: 'そうですか。どうも　ありがとうございました。', r: 'Sō desu ka. Dōmo arigatō gozaimashita.' },
    ],
    closing: { jp: 'いいえ、どういたしまして。きを　つけて。', en: "You're welcome. Take care." },
  },
]);

export function scenarioDeckId(scenario) {
  return ID_PREFIX + scenario.id;
}

/** The scenario a 'scenario:<id>' deck id points to, or null for anything else. */
export function findScenarioByDeckId(deckId) {
  if (typeof deckId !== 'string' || !deckId.startsWith(ID_PREFIX)) return null;
  const id = deckId.slice(ID_PREFIX.length);
  return SCENARIOS.find((s) => s.id === id) || null;
}

/** Fresh qa items for a run — callers may mutate them without touching the script. */
export function scenarioToQA(scenario) {
  return scenario.beats.map((b) => ({ q: b.npc, a: b.a, r: b.r, goal: b.goal }));
}
