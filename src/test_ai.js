
import { gradeWithAI } from './ai/index.js';

// Mock localStorage
const storage = {
  api_key: 'gsk_test',
  jlpt_level: 'N5'
};
global.localStorage = {
  getItem: (key) => storage[key] || null,
  setItem: (key, val) => { storage[key] = val; }
};

// Mock fetch to simulate AI responses
global.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  const prompt = body.messages[1].content;

  // Scenario: AI thinks it's correct, but local check should find tense error
  if (prompt.includes('TENSE_TEST')) {
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              correct: true,
              score: 100,
              general_feedback: 'Perfect!',
              suggested_answer: 'いきました',
              breakdown: []
            })
          }
        }]
      })
    };
  }

  // Scenario: AI finds a particle error
  if (prompt.includes('PARTICLE_TEST')) {
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              correct: false,
              score: 70,
              general_feedback: 'Wrong particle.',
              suggested_answer: '私は学生です',
              breakdown: [
                { original: '私か学生です', corrected: '私は学生です', category: 'Particle', explanation: 'Use は for topics.' }
              ]
            })
          }
        }]
      })
    };
  }

  return { ok: false, status: 500 };
};

async function runTests() {
  console.log('🚀 Starting AI Grading Breakdown Tests...\n');

  // Test 1: Local Tense Error (Local safety net should override AI correct)
  console.log('Test 1: Local Tense Error...');
  const res1 = await gradeWithAI('Where did you go?', '学校にいきました', '学校にいきます');
  console.log('Result:', JSON.stringify(res1, null, 2));
  if (res1?.breakdown?.some(b => b.category === 'Tense')) {
    console.log('✅ PASSED: Local tense error caught and added to breakdown.');
  } else {
    console.log('❌ FAILED: Tense error not found in breakdown.');
  }

  console.log('\n----------------------------\n');

  // Test 2: AI-detected Particle Error (AI breakdown should be preserved)
  console.log('Test 2: AI Particle Error...');
  const res2 = await gradeWithAI('PARTICLE_TEST', '私は学生です', '私か学生です');
  console.log('Result:', JSON.stringify(res2, null, 2));
  if (res2?.breakdown?.some(b => b.category === 'Particle')) {
    console.log('✅ PASSED: AI breakdown preserved.');
  } else {
    console.log('❌ FAILED: AI breakdown missing.');
  }
}

runTests().catch(console.error);
