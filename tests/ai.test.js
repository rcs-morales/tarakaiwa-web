import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gradeWithAI, parseAIGradingResponse } from '../src/ai/grading.js';

describe('AI Grading Parser', () => {
  it('should parse a perfect JSON response', () => {
    const raw = '{"correct": true, "score": 100, "general_feedback": "Perfect!", "suggested_answer": "いきました", "breakdown": []}';
    const result = parseAIGradingResponse(raw);
    expect(result).toEqual({
      correct: true,
      score: 100,
      general_feedback: 'Perfect!',
      suggested_answer: 'いきました',
      breakdown: []
    });
  });

  it('should parse JSON wrapped in markdown blocks', () => {
    const raw = '```json\n{"correct": false, "score": 50, "general_feedback": "Wrong", "suggested_answer": "いきました", "breakdown": []}\n```';
    const result = parseAIGradingResponse(raw);
    expect(result.correct).toBe(false);
    expect(result.score).toBe(50);
  });

  it('should recover from truncated JSON using regex', () => {
    const raw = '{"correct": true, "score": 100, "general_feedback": "Great job! "'; // Truncated here
    const result = parseAIGradingResponse(raw);
    expect(result).toBeDefined();
    expect(result.correct).toBe(true);
    expect(result.score).toBe(100);
    expect(result.general_feedback).toBe('Great job! ');
  });

  it('should handle completely invalid text by returning null', () => {
    const raw = 'I am not sure about this answer.';
    const result = parseAIGradingResponse(raw);
    expect(result).toBeNull();
  });

  it('should provide default values when some fields are missing but some are present', () => {
    const raw = '{"correct": true}';
    const result = parseAIGradingResponse(raw);
    expect(result.correct).toBe(true);
    expect(result.score).toBe(100); // Default if correct is true
  });
});

describe('AI Grading Integration (gradeWithAI)', () => {
  beforeEach(() => {
    const storage = { api_key: 'gsk_test', jlpt_level: 'N5' };
    vi.stubGlobal('localStorage', {
      getItem: (key) => storage[key] || null,
      setItem: (key, val) => { storage[key] = val; }
    });

    const mockFetch = vi.fn(async (url, options) => {
      const body = JSON.parse(options.body);
      const prompt = body.messages[1].content;

      // Scenario: Tense error (AI thinks correct, local should override)
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

      // Scenario: Particle error (AI detects it)
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

      // Scenario: API Failure
      if (prompt.includes('FAIL_API')) {
        return { ok: false, status: 500, text: async () => 'Internal Server Error' };
      }

      return { ok: false, status: 404 };
    });

    vi.stubGlobal('fetch', mockFetch);
  });

  it('should catch local tense errors and add them to breakdown', async () => {
    const res = await gradeWithAI('Where did you go?', '学校にいきました', '学校にいきます');
    expect(res?.breakdown?.some(b => b.category === 'Tense')).toBe(true);
    expect(res?.correct).toBe(false);
  });

  it('should preserve AI-detected particle errors', async () => {
    const res = await gradeWithAI('PARTICLE_TEST', '私は学生です', '私か学生です');
    expect(res?.breakdown?.some(b => b.category === 'Particle')).toBe(true);
    expect(res?.correct).toBe(false);
  });

  it('should return null when the API fails completely', async () => {
    const res = await gradeWithAI('FAIL_API', 'expected', 'transcript');
    expect(res).toBeNull();
  });
});
