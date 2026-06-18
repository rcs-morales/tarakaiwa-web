import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gradeWithAI } from '../src/ai.js';

describe('AI Grading Breakdown', () => {
  beforeEach(() => {
    // Setup mock localStorage
    const storage = { api_key: 'gsk_test', jlpt_level: 'N5' };
    vi.stubGlobal('localStorage', {
      getItem: (key) => storage[key] || null,
      setItem: (key, val) => { storage[key] = val; }
    });

    // Define mock fetch function
    const mockFetch = vi.fn(async (url, options) => {
      const body = JSON.parse(options.body);
      const prompt = body.messages[1].content;

      // Scenario: AI thinks it's correct, but local check should find tense error
      // We trigger this if the prompt contains the specific test case words
      if (prompt.includes('学校にいきました') && prompt.includes('学校にいきます')) {
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({
              correct: true, score: 100, general_feedback: 'Perfect!', suggested_answer: 'いきました', breakdown: []
            })}}]
          })
        };
      }

      // Scenario: AI finds a particle error
      if (prompt.includes('PARTICLE_TEST') || (prompt.includes('私は学生です') && prompt.includes('私か学生です'))) {
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({
              correct: false, score: 70, general_feedback: 'Wrong particle.', suggested_answer: '私は学生です',
              breakdown: [{ original: '私か学生です', corrected: '私は学生です', category: 'Particle', explanation: 'Use は for topics.' }]
            })}}]
          })
        };
      }

      return { ok: false, status: 500 };
    });

    vi.stubGlobal('fetch', mockFetch);
  });

  it('should catch local tense errors and add them to breakdown', async () => {
    const res = await gradeWithAI('Where did you go?', '学校にいきました', '学校にいきます');
    expect(res?.breakdown?.some(b => b.category === 'Tense')).toBe(true);
  });

  it('should preserve AI-detected particle errors', async () => {
    // We use a specific marker here to ensure the mock triggers
    const res = await gradeWithAI('PARTICLE_TEST', '私は学生です', '私か学生です');
    expect(res?.breakdown?.some(b => b.category === 'Particle')).toBe(true);
  });
});
