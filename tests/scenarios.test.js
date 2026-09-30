import { describe, it, expect } from 'vitest';
import { SCENARIOS, scenarioDeckId, findScenarioByDeckId, scenarioToQA } from '../src/lib/scenarios.js';

const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

describe('SCENARIOS catalog', () => {
  it('has unique ids', () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(SCENARIOS.map((s) => [s.id, s]))('%s has every field the session and UI rely on', (_id, s) => {
    expect(['N5', 'N4', 'N3']).toContain(s.jlptLevel);
    expect(s.title).toBeTruthy();
    expect(s.titleJp).toMatch(JAPANESE);
    expect(s.icon).toBeTruthy();
    expect(s.setting).toBeTruthy();
    expect(s.role.jp).toMatch(JAPANESE);
    expect(s.role.en).toBeTruthy();
    expect(s.role.persona).toBeTruthy();
    expect(s.keyPhrases.length).toBeGreaterThan(0);
    for (const p of s.keyPhrases) {
      expect(p.jp).toMatch(JAPANESE);
      expect(p.en).toBeTruthy();
    }
    expect(s.closing.jp).toMatch(JAPANESE);
    expect(s.closing.en).toBeTruthy();

    expect(s.beats.length).toBeGreaterThanOrEqual(3);
    for (const b of s.beats) {
      expect(b.npc).toMatch(JAPANESE);
      expect(b.a).toMatch(JAPANESE);
      expect(b.r).toMatch(/^[\x20-\x7EāēīōūĀĒĪŌŪ]+$/); // Hepburn romaji only
      expect(b.goal).toBeTruthy();
    }
  });
});

describe('scenario deck ids', () => {
  it('round-trips a scenario through its prefixed deck id', () => {
    const cafe = SCENARIOS.find((s) => s.id === 'cafe');
    expect(scenarioDeckId(cafe)).toBe('scenario:cafe');
    expect(findScenarioByDeckId('scenario:cafe')).toBe(cafe);
  });

  it('returns null for deck UUIDs, the Sample deck, and unknown scenarios', () => {
    expect(findScenarioByDeckId(null)).toBeNull();
    expect(findScenarioByDeckId('3f1c2a9e-0000-4000-8000-000000000000')).toBeNull();
    expect(findScenarioByDeckId('cafe')).toBeNull();
    expect(findScenarioByDeckId('scenario:does-not-exist')).toBeNull();
  });
});

describe('scenarioToQA', () => {
  it('maps beats onto qa items in script order', () => {
    const cafe = SCENARIOS.find((s) => s.id === 'cafe');
    const qa = scenarioToQA(cafe);

    expect(qa).toHaveLength(cafe.beats.length);
    expect(qa[0]).toEqual({ q: cafe.beats[0].npc, a: cafe.beats[0].a, r: cafe.beats[0].r, goal: cafe.beats[0].goal });
    expect(qa.map((item) => item.q)).toEqual(cafe.beats.map((b) => b.npc));
  });

  it('returns fresh objects so a run can mutate them without touching the script', () => {
    const cafe = SCENARIOS.find((s) => s.id === 'cafe');
    const first = scenarioToQA(cafe);
    first[1].q = 'changed';

    const second = scenarioToQA(cafe);
    expect(second[1].q).toBe(cafe.beats[1].npc);
    expect(cafe.beats[1].npc).not.toBe('changed');
  });
});
