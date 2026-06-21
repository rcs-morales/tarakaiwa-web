// ─────────────────────────────────────────────
// AI GRADING (Groq LLM)
// ─────────────────────────────────────────────

import { getGroqApiKey, getGradingModel } from './groqClient.js';
import { getGradingPrompt, GRADING_SYSTEM_PROMPT } from './prompts.js';
import { createGrammarRuleHelper, analyzeAnswerCompleteness, isCorrectLocal, STRIP_RE } from './localGrading.js';
import { get, KEYS } from '../settings.js';

/**
 * Parse the raw text returned by the LLM into a structured grading result.
 */
export function parseAIGradingResponse(rawText) {
  let text = String(rawText || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const startIdx = text.indexOf('{');
  if (startIdx === -1) return null;

  const endIdx = text.lastIndexOf('}');
  const candidate = endIdx !== -1 && endIdx > startIdx
    ? text.substring(startIdx, endIdx + 1)
    : text.substring(startIdx);

  try {
    const parsed = JSON.parse(candidate);
    return {
      correct: parsed.correct ?? false,
      score: parsed.score ?? (parsed.correct ? 100 : 0),
      general_feedback: parsed.general_feedback || '',
      suggested_answer: parsed.suggested_answer || '',
      breakdown: parsed.breakdown || []
    };
  } catch {
    // Groq can occasionally truncate a long JSON string.
  }

  const parseStringField = (key) => {
    const match = candidate.match(new RegExp('"' + key + '"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"', 's'));
    if (!match) return '';
    try {
      return JSON.parse('"' + match[1] + '"');
    } catch {
      return match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
  };
  const parseBoolField = (key) => {
    const match = candidate.match(new RegExp('"' + key + '"\\s*:\\s*(true|false)', 'i'));
    return match ? match[1].toLowerCase() === 'true' : null;
  };
  const parseNumberField = (key) => {
    const match = candidate.match(new RegExp('"' + key + '"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)'));
    return match ? Number(match[1]) : null;
  };

  const partial = {
    correct: parseBoolField('correct'),
    score: parseNumberField('score'),
    general_feedback: parseStringField('general_feedback'),
    suggested_answer: parseStringField('suggested_answer'),
    breakdown: [] // Fallback regex doesn't parse complex arrays
  };

  const hasUsefulFeedback = partial.correct !== null
    || partial.score !== null
    || partial.general_feedback
    || partial.suggested_answer;

  if (!hasUsefulFeedback) return null;
  if (partial.correct == null) partial.correct = false;
  if (partial.score == null) partial.score = partial.correct ? 100 : 0;
  return partial;
}

/**
 * Post-process the raw AI grading result with local safety checks.
 */
async function finalizeAIGradingResult(text, question, expectedAnswer, transcript) {
    const result = parseAIGradingResponse(text);
    if (!result) {
      console.error('AI text did not contain parseable grading JSON:', text);
      return null;
    }

    // Strip garbled replacement/box/diamond characters the AI may still produce
    const sanitize = (str) => (str || '')
      .replace(/[\uFFFD\u25C6\u25A0\u25CF\u2022\u00A0\u3000]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Local verb-tense safety net: count occurrences of past verbs
    const { katakanaToHiragana, transcriptToFurigana } = await import('../parser.js');
    const analyzeGrammar = createGrammarRuleHelper(transcriptToFurigana, katakanaToHiragana);
    const grammarSignals = analyzeGrammar(expectedAnswer, transcript);
    const completionSignals = analyzeAnswerCompleteness(question, expectedAnswer, transcript, transcriptToFurigana, katakanaToHiragana);
    const detectTense = (text) => {
      const normalized = transcriptToFurigana(String(text || '')).replace(/[\s\u3000]/g, '');
      const patterns = [
        { type: 'past', re: /(ました|でした|ていた|ていました|たこと|かった|だった)/g },
        { type: 'present', re: /(ます|です|ています|ている|いる|ある|ですか|ますか)/g }
      ];

      let lastType = 'unknown';
      let lastIndex = -1;
      for (const { type, re } of patterns) {
        for (const match of normalized.matchAll(re)) {
          const idx = match.index ?? 0;
          if (idx >= lastIndex) {
            lastType = type;
            lastIndex = idx;
          }
        }
      }

      return lastType;
    };

    const normT = grammarSignals.normalizedTranscript;
    const normA = grammarSignals.normalizedAnswer;
    const particlesInAnswer = grammarSignals.particleSeqA;
    const particlesInTranscript = grammarSignals.particleSeqT;
    const particleWrong = grammarSignals.particleMismatch;

    const pastVerbRe = /([\u3041-\u3096]{1,6})\u307e\u3057\u305f/g; // Xました
    let tenseMismatch = false;
    let pastVerbMatch;
    
    // Find unique stems
    const stems = new Set();
    while ((pastVerbMatch = pastVerbRe.exec(normA)) !== null) {
      stems.add(pastVerbMatch[1]);
    }

    for (const stem of stems) {
      const presentForm = stem + '\u307e\u3059';  // stem + ます
      const pastForm = stem + '\u307e\u3057\u305f'; // stem + ました
      
      const countA_past = (normA.match(new RegExp(pastForm, 'g')) || []).length;
      const countT_past = (normT.match(new RegExp(pastForm, 'g')) || []).length;
      const countT_present = (normT.match(new RegExp(presentForm, 'g')) || []).length;
      
      // If transcript is missing the expected number of past tense forms
      // AND has a present tense form of that verb, it's a tense mismatch.
      if (countT_past < countA_past && countT_present > 0) {
        tenseMismatch = true;
        break;
      }
    }

    const questionTense = detectTense(question);
    const answerTense = detectTense(expectedAnswer);
    const questionAnswerTenseMismatch = questionTense !== 'unknown' && answerTense !== 'unknown' && questionTense !== answerTense;
    const particleMismatch = particleWrong || (
      particlesInAnswer.length > 0 &&
      particlesInTranscript.length > 0 &&
      normT !== normA &&
      particlesInTranscript !== particlesInAnswer
    );
    const hasTenseProblem = tenseMismatch || questionAnswerTenseMismatch || grammarSignals.tenseMismatch || grammarSignals.polarityMismatch;
    const hasCompletionProblem = completionSignals.incomplete || completionSignals.hasExtraTrailingChars;
    const isCorrect = hasCompletionProblem ? false : (hasTenseProblem ? false : !!result.correct);
    let scoreVal;
    if (hasCompletionProblem) {
      scoreVal = Math.min(typeof result.score === 'number' ? result.score : 70, completionSignals.incomplete ? 40 : 35);
    } else if (hasTenseProblem) {
      scoreVal = Math.min(typeof result.score === 'number' ? result.score : 70, 35);
    } else if (typeof result.score === 'number') {
      scoreVal = result.score;
    } else {
      scoreVal = result.correct ? 100 : 0;
    }

    const STRIP_RE = /[\s　、。！？・「」『』【】〜〈〉（）,，.]/g;
    const breakdown = (result.breakdown || []).filter(item => {
      if (!item.original || !item.corrected) return true;
      const normOrig = katakanaToHiragana(transcriptToFurigana(item.original)).replace(STRIP_RE, '').toLowerCase();
      const normCorr = katakanaToHiragana(transcriptToFurigana(item.corrected)).replace(STRIP_RE, '').toLowerCase();
      // Drop breakdown cards where the only difference is Kanji vs Hiragana/Katakana
      if (normOrig === normCorr) return false;

      // Aggressive filter: AI loves to hallucinate lectures about "numerical vs written form" and "kanji vs hiragana"
      const exp = (item.explanation || '').toLowerCase();
      if (
        exp.includes('numerical') || 
        exp.includes('written form') || 
        exp.includes('arabic numeral') ||
        exp.includes('spoken japanese') ||
        exp.includes('more common') ||
        exp.includes('usually written')
      ) {
        return false;
      }

      return true;
    });

    return {
      correct: isCorrect,
      score: scoreVal,
      general_feedback: hasCompletionProblem
        ? completionSignals.reason
        : sanitize(result.general_feedback),
      suggested_answer: sanitize(result.suggested_answer) || (hasCompletionProblem || tenseMismatch ? expectedAnswer : ''),
      breakdown: breakdown,
      source: 'groq'
    };
}

/**
 * Grade a student's spoken answer using the Groq AI, with local safety-net post-processing.
 */
export async function gradeWithAI(question, expectedAnswer, transcript) {
  const apiKey = getGroqApiKey();
  if (!apiKey) return null;

  try {
    const level = get(KEYS.JLPT_LEVEL);
    const prompt = getGradingPrompt(level, question, expectedAnswer, transcript);
    const requestBody = {
      model: getGradingModel(),
      temperature: 0.1,
      max_tokens: 520,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: GRADING_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ]
    };

    let response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      const errText = await response.text();
      if (/response_format|json_object/i.test(errText)) {
        const fallbackBody = { ...requestBody };
        delete fallbackBody.response_format;
        response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(fallbackBody)
        });
        if (response.ok) {
          const data = await response.json();
          let text = data.choices?.[0]?.message?.content || '';
          if (!text) {
            console.error('AI returned empty text');
            return null;
          }
          return finalizeAIGradingResult(text, question, expectedAnswer, transcript);
        }
      }
      console.error('Groq API failed:', response.status, errText);
      return null;
    }
    const data = await response.json();
    let text = data.choices?.[0]?.message?.content || '';

    if (!text) {
      console.error('AI returned empty text');
      return null;
    }

    return finalizeAIGradingResult(text, question, expectedAnswer, transcript);
  } catch (e) {
    console.error('AI grading error:', e);
    return null;
  }
}
