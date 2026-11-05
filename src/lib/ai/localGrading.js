// ─────────────────────────────────────────────
// LOCAL FALLBACK GRADING (offline, no API)
// ─────────────────────────────────────────────

import { katakanaToHiragana, transcriptToFurigana } from '../parser.js';

export const STRIP_RE = /[\s　、。！？・「」『』【】〜〈〉（）,，.]/g;

const TOKEN_RE = /[\u3040-\u30ff\u4e00-\u9fffA-Za-z]+/g;

/**
 * @typedef {object} BreakdownItem  One AI-graded mistake.
 * @property {string} [original]   what the student said
 * @property {string} [corrected]  what it should be
 * @property {string} [category]   e.g. Grammar, Particle, Vocabulary
 * @property {string} [explanation]
 */

/** @typedef {(s: string) => string} TextFn */

/** Collapse common STT vowel insertions (e.g. しゅうみ → しゅみ). */
/** @param {string} s */
function relaxSpokenSttArtifacts(s) {
  return s
    .replace(/([ゅょぉ])う(?=[ぁ-ん])/g, '$1')
    .replace(/ぷん/g, 'ぶん');
}

/** Words often omitted in casual spoken answers without changing core meaning. */
const OPTIONAL_SPOKEN_OMISSIONS = ['あるいて', 'あるき', 'およそ', 'だいたい'];

/** @param {string} s */
function relaxOptionalSpokenOmissions(s) {
  let text = String(s || '');
  for (const word of OPTIONAL_SPOKEN_OMISSIONS) {
    text = text.replaceAll(word, '');
  }
  return text;
}

/** @param {unknown} s */
function normalizeGradingToken(s) {
  return katakanaToHiragana(transcriptToFurigana(String(s || '')))
    .replace(STRIP_RE, '')
    .toLowerCase();
}

/** @param {unknown} s */
export function normalizeForGradingComparison(s) {
  return relaxSpokenSttArtifacts(normalizeGradingToken(s));
}

/** True when two answers match after spoken-test normalization.
 * @param {string} answer @param {string} transcript */
export function gradingTextsEquivalent(answer, transcript) {
  const normA = normalizeForGradingComparison(answer);
  const normT = normalizeForGradingComparison(transcript);
  if (normA === normT) return true;
  return relaxOptionalSpokenOmissions(normA) === relaxOptionalSpokenOmissions(normT);
}

/** @param {string} token @param {string} normPrefix */
function extractTokenPrefix(token, normPrefix) {
  if (!normPrefix) return null;
  let normBuilt = '';
  for (let i = 0; i < token.length; i++) {
    normBuilt = normalizeGradingToken(token.slice(0, i + 1));
    if (normBuilt === normPrefix) return token.slice(0, i + 1);
    if (normBuilt.length > normPrefix.length) return null;
  }
  return null;
}

/**
 * Replace AI-hallucinated breakdown originals with the student's actual words.
 * @param {BreakdownItem} item
 * @param {string} transcript
 * @returns {BreakdownItem | null} null when no word of the transcript fits
 */
export function groundBreakdownItem(item, transcript) {
  const original = String(item.original || '').trim();
  const corrected = String(item.corrected || '').trim();
  if (!original || !corrected) return item;

  const source = String(transcript || '');
  if (source.includes(original)) return item;

  const normOriginal = normalizeGradingToken(original);
  const tokens = source.match(TOKEN_RE) || [];
  for (const token of tokens) {
    if (normalizeGradingToken(token) === normOriginal) {
      return { ...item, original: token };
    }
    const prefix = extractTokenPrefix(token, normOriginal);
    if (prefix) return { ...item, original: prefix };
  }

  const normCorrected = normalizeGradingToken(corrected);
  let bestToken = null;
  let bestScore = Infinity;
  for (const token of tokens) {
    const normToken = normalizeGradingToken(token);
    if (normToken === normCorrected) continue;
    const score = Math.abs(normToken.length - normCorrected.length)
      + (normToken.slice(0, 2) === normCorrected.slice(0, 2) ? 0 : 5);
    if (score < bestScore) {
      bestScore = score;
      bestToken = token;
    }
  }
  if (bestToken) {
    const prefix = extractTokenPrefix(bestToken, normOriginal)
      || extractTokenPrefix(bestToken, normalizeGradingToken(bestToken).slice(0, normOriginal.length));
    if (prefix) return { ...item, original: prefix };
    if (normalizeGradingToken(bestToken).length <= normOriginal.length + 2) {
      return { ...item, original: bestToken };
    }
  }

  return null;
}

/** @param {BreakdownItem[] | null | undefined} breakdown @param {string} transcript */
export function groundBreakdown(breakdown, transcript) {
  return (breakdown || [])
    .map((item) => groundBreakdownItem(item, transcript))
    .filter((item) => item !== null);
}

const PREDICATE_MARKER_RE = /(ませんでした|ませんか|ましたか|でしたか|ますか|ですか|ました|でした|ません|ます|です|ましょう|ない|ている|ています|ていました|たい|たかった)/g;
const PREDICATE_END_RE = /(ませんでした|ませんか|ましたか|でしたか|ますか|ですか|ました|でした|ません|ます|です|ましょう|ない|ている|ています|ていました|たい|たかった)$/;
// から is omitted — it commonly ends complete reason clauses (e.g. 〜ていますから).
const DANGLING_END_RE = /(は|が|を|に|へ|で|と|の|も|まで|より|そして|それから)$/;
const QUESTION_MARKER_RE = /(か[。！？?]|[？?])/g;

/** @param {string} text @param {RegExp} re */
function countMatches(text, re) {
  re.lastIndex = 0;
  return Array.from(String(text || '').matchAll(re)).length;
}

/**
 * Creates a grammar analysis helper bound to parser functions.
 * @param {TextFn} transcriptToFurigana
 * @param {TextFn} katakanaToHiragana
 */
export function createGrammarRuleHelper(transcriptToFurigana, katakanaToHiragana) {
  /** @type {Record<string, string>} */
  const ROMAJI_PARTICLE_MAP = {
    ha: 'は', wa: 'は', ga: 'が', wo: 'を', ni: 'に', he: 'へ', de: 'で', no: 'の',
    to: 'と', ya: 'や', mo: 'も', kara: 'から', made: 'まで', yori: 'より', 'わ': 'は'
  };
  const PARTICLE_REGEX = /(?:は|わ|が|を|に|へ|で|の|と|や|も|から|まで|より)/g;
  const ROMAJI_PARTICLE_REGEX = /\b(?:ha|ga|wo|ni|he|de|no|to|ya|mo|kara|made|yori)\b/gi;

  const normalizeText = (/** @type {string} */ s) => {
    const text = String(s || '');
    return katakanaToHiragana(transcriptToFurigana(text))
      .replace(/[\s　、。！？・「」『』【】〜〈〉（）,，.]/g, '');
  };
  const normalizeParticleToken = (/** @type {string} */ token) => {
    const lower = String(token || '').toLowerCase();
    return ROMAJI_PARTICLE_MAP[lower] || lower;
  };
  const extractParticles = (/** @type {string} */ s) => {
    const text = String(s || '');
    const fromKana = Array.from(text.matchAll(PARTICLE_REGEX), m => normalizeParticleToken(m[0])).join('');
    const fromRomaji = Array.from(text.matchAll(ROMAJI_PARTICLE_REGEX), m => normalizeParticleToken(m[0])).join('');
    return (fromKana + fromRomaji).replace(/[\s　、。！？・「」『』【】〜〈〉（）,，.]/g, '');
  };
  const stripParticles = (/** @type {string} */ s) => String(s || '')
    .replace(/[\s　、。！？・「」『』【】〜〈〉（）,，.]/g, '')
    .replace(PARTICLE_REGEX, '')
    .replace(ROMAJI_PARTICLE_REGEX, '');

  /** @param {string} answer @param {string} transcript */
  const detectTenseMismatch = (answer, transcript) => {
    const a = normalizeText(answer);
    const t = normalizeText(transcript);
    const pastVerbRe = /([ぁ-んー]{1,6})ました/g;
    const stems = new Set();
    let match;
    while ((match = pastVerbRe.exec(a)) !== null) stems.add(match[1]);

    for (const stem of stems) {
      const presentForm = stem + 'ます';
      const pastForm = stem + 'ました';
      const countA_past = (a.match(new RegExp(pastForm, 'g')) || []).length;
      const countT_past = (t.match(new RegExp(pastForm, 'g')) || []).length;
      const countT_present = (t.match(new RegExp(presentForm, 'g')) || []).length;
      if (countA_past > 0 && countT_past < countA_past && countT_present > 0) {
        return true;
      }
    }
    return false;
  };

  /** @param {string} answer @param {string} transcript */
  const detectPolarityMismatch = (answer, transcript) => {
    const a = normalizeText(answer);
    const t = normalizeText(transcript);
    const negativePatterns = [/ない/g, /ません/g, /ませんでした/g, /なく/g, /ませんか/g];
    const positivePatterns = [/ます/g, /ました/g, /です/g, /でした/g, /ますか/g, /でしたか/g];
    /** @param {string} text @param {RegExp[]} patterns */
    const matchesAny = (text, patterns) => patterns.some((re) => {
      re.lastIndex = 0;
      return re.test(text);
    });
    const expectedNegative = matchesAny(a, negativePatterns);
    const heardNegative = matchesAny(t, negativePatterns);
    const expectedPositive = matchesAny(a, positivePatterns);
    const heardPositive = matchesAny(t, positivePatterns);

    const hasPolaritySignalA = expectedNegative || expectedPositive;
    const hasPolaritySignalT = heardNegative || heardPositive;
    if (!hasPolaritySignalA || !hasPolaritySignalT) return false;

    return (expectedNegative !== heardNegative) || (expectedPositive !== heardPositive);
  };

  /** @param {string} answer @param {string} transcript */
  return function analyzeGrammar(answer, transcript) {
    const a = normalizeText(answer);
    const t = normalizeText(transcript);
    const particleSeqA = extractParticles(answer);
    const particleSeqT = extractParticles(transcript);
    const exactNormalizedMatch = a === t;
    const particleMismatch = !exactNormalizedMatch
      && particleSeqA.length > 0 && particleSeqT.length > 0
      && stripParticles(t) === stripParticles(a)
      && particleSeqA !== particleSeqT;
    const missingOrExtraParticles = (particleSeqA.length > 0 || particleSeqT.length > 0)
      && !exactNormalizedMatch
      && stripParticles(t) === stripParticles(a)
      && particleSeqA !== particleSeqT;

    return {
      particleMismatch: particleMismatch || missingOrExtraParticles,
      tenseMismatch: detectTenseMismatch(answer, transcript),
      polarityMismatch: detectPolarityMismatch(answer, transcript),
      prohibitionMismatch: detectProhibitionFormMismatch(answer, transcript),
      particleSeqA,
      particleSeqT,
      normalizedAnswer: a,
      normalizedTranscript: t
    };
  };
}

const PROHIBITION_FORMS = [
  'てはいけません', 'てはいけない', 'てはだめ', 'てはなりません', 'ではいけません', 'ではいけない'
];
const WRONG_PROHIBITION_FORMS = [
  'てもいきません', 'てもいけない', 'てもいけません', 'でもいけません', 'てもだめ'
];

/** Detect 〜てはいけません swapped for incorrect forms like 〜てもいきません.
 * @param {string} answer @param {string} transcript */
export function detectProhibitionFormMismatch(answer, transcript) {
  const a = normalizeForGradingComparison(answer);
  const t = normalizeForGradingComparison(transcript);

  for (const form of PROHIBITION_FORMS) {
    if (!a.includes(form)) continue;
    if (t.includes(form)) continue;
    if (WRONG_PROHIBITION_FORMS.some((wrong) => t.includes(wrong))) return true;
  }
  return false;
}

/** True when AI breakdown items reflect real grammar or vocabulary errors.
 * @param {BreakdownItem[] | null | undefined} breakdown
 * @param {(item: BreakdownItem) => boolean} isScriptOrNumeralOnly */
export function hasMeaningfulBreakdownError(breakdown, isScriptOrNumeralOnly) {
  return (breakdown || []).some((item) => {
    if (isScriptOrNumeralOnly(item)) return false;
    const category = String(item.category || '').toLowerCase();
    if (category === 'grammar' || category === 'particle' || category === 'tense') return true;
    if (category === 'vocabulary' || category === 'word choice') {
      return normalizeForGradingComparison(item.original) !== normalizeForGradingComparison(item.corrected);
    }
    return false;
  });
}

/**
 * Analyze whether the student's answer covers all required parts.
 * @param {string} question
 * @param {string} answer
 * @param {string} transcript
 * @param {TextFn} transcriptToFurigana
 * @param {TextFn} katakanaToHiragana
 */
export function analyzeAnswerCompleteness(question, answer, transcript, transcriptToFurigana, katakanaToHiragana) {
  const normalize = (/** @type {string} */ s) => katakanaToHiragana(transcriptToFurigana(String(s || '')))
    .replace(STRIP_RE, '')
    .toLowerCase();

  const a = normalize(answer);
  const t = normalize(transcript);
  if (gradingTextsEquivalent(answer, transcript)) {
    return {
      incomplete: false,
      hasExtraTrailingChars: false,
      reason: '',
      predicateCountA: countMatches(a, PREDICATE_MARKER_RE),
      predicateCountT: countMatches(t, PREDICATE_MARKER_RE),
      requiredResponses: 0
    };
  }
  const predicateCountA = countMatches(a, PREDICATE_MARKER_RE);
  const predicateCountT = countMatches(t, PREDICATE_MARKER_RE);
  const questionParts = countMatches(question, QUESTION_MARKER_RE);
  const requiredResponses = Math.max(predicateCountA, Math.min(questionParts, 2));
  const hasExtraTrailingChars = t.startsWith(a) && t.slice(a.length).replace(STRIP_RE, '').length > 0;
  const hasIncompleteSentence = PREDICATE_END_RE.test(a) && !PREDICATE_END_RE.test(t) && a.startsWith(t);
  const hasDanglingEnding = t.length > 0 && !PREDICATE_END_RE.test(t) && DANGLING_END_RE.test(t);
  const missingRequiredResponse = requiredResponses >= 2 && predicateCountT < requiredResponses;

  let reason = '';
  if (missingRequiredResponse) {
    reason = 'It looks like your answer is a bit short! Try to cover all the parts of the question to make it complete.';
  } else if (hasIncompleteSentence || hasDanglingEnding) {
    reason = 'Your sentence seems to end a bit early. Try to finish the thought completely!';
  } else if (hasExtraTrailingChars) {
    reason = 'You added some extra words at the end. Try to keep your answer concise and focused on the question.';
  }

  return {
    incomplete: missingRequiredResponse || hasIncompleteSentence || hasDanglingEnding,
    hasExtraTrailingChars,
    reason,
    predicateCountA,
    predicateCountT,
    requiredResponses
  };
}

/**
 * Local (offline) grading — uses text similarity and grammar rule checks.
 * @param {string} rawTranscript
 * @param {string} answer
 * @param {string} [question]
 */
export async function isCorrectLocal(rawTranscript, answer, question = '') {
  const { katakanaToHiragana, transcriptToFurigana, transcriptToFuriganaForGrading } = await import('../parser.js');
  const analyzeGrammar = createGrammarRuleHelper(transcriptToFurigana, katakanaToHiragana);
  const grammarSignals = analyzeGrammar(answer, rawTranscript);

  const normalizeAnswer = (/** @type {string} */ s) => katakanaToHiragana(s).replace(STRIP_RE, '').toLowerCase();
  /** @param {string} raw @param {string} [ans] */
  const normalizeTranscript = (raw, ans) => {
    const furigana = ans != null
      ? transcriptToFuriganaForGrading(raw, ans)
      : transcriptToFurigana(raw);
    return furigana.replace(STRIP_RE, '').toLowerCase();
  };

  const t = normalizeTranscript(rawTranscript, answer);
  const a = normalizeTranscript(answer, answer);

  if (gradingTextsEquivalent(answer, rawTranscript)) {
    return {
      correct: true,
      score: 100,
      feedback: 'Answer matched (local check).',
      grammarNotes: '',
      particleNotes: '',
      vocabularyNotes: '',
      suggestedAnswer: '',
      hints: [],
      source: 'local'
    };
  }
  let sim = 0;
  if (a.length === 0) sim = 0;
  else {
    const m = t.length, n = a.length;
    let prev = new Array(n + 1).fill(0);
    for (let i = 1; i <= m; i++) {
      const curr = new Array(n + 1).fill(0);
      for (let j = 1; j <= n; j++) {
        curr[j] = t[i-1] === a[j-1]
          ? prev[j-1] + 1
          : Math.max(prev[j], curr[j-1]);
      }
      prev = curr;
    }
    sim = prev[n] / a.length;
  }

  let finalScore = Math.round(sim * 100);
  let grammarNotes = '';
  // Category for grammarNotes, matching the AI breakdown tags
  // (Completeness / Conjugation / Tense) so the UI can colour it the same way.
  let grammarCategory = '';
  let particleNotes = '';

  const completionSignals = analyzeAnswerCompleteness(question, answer, rawTranscript, transcriptToFurigana, katakanaToHiragana);
  const hasCompletionProblem = completionSignals.incomplete || completionSignals.hasExtraTrailingChars;
  if (completionSignals.incomplete || completionSignals.hasExtraTrailingChars) {
    finalScore = Math.min(finalScore, completionSignals.incomplete ? 40 : 35);
    grammarNotes = completionSignals.reason;
    grammarCategory = 'Completeness';
  }

  // N5-friendly: small wording differences should not be treated as hard failures.
  if (finalScore >= 70) {
    finalScore = Math.max(finalScore, 85);
  }

  const particles = ['は', 'わ', 'が', 'に', 'へ', 'で', 'を', 'の', 'も'];
  /** @type {Record<string, string>} */
  const romajiParticleMap = {
    ha: 'は', ga: 'が', wo: 'を', ni: 'に', he: 'へ', de: 'で', no: 'の',
    to: 'と', ya: 'や', mo: 'も', kara: 'から', made: 'まで', yori: 'より'
  };
  const particleSet = /(?:は|わ|が|を|に|へ|で|の|と|や|も|から|まで|より)/g;
  const romajiParticleSet = /\b(?:ha|ga|wo|ni|he|de|no|to|ya|mo|kara|made|yori)\b/gi;
  const normalizeParticleToken = (/** @type {string} */ token) => {
    const lower = String(token || '').toLowerCase();
    return romajiParticleMap[lower] || lower;
  };
  const detectTense = (/** @type {string} */ text) => {
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

  const pastVerbRe = /([ぁ-んー]{1,6})ました/g;
  let tenseMismatch = false;
  let pastVerbMatch;
  const stems = new Set();
  while ((pastVerbMatch = pastVerbRe.exec(a)) !== null) {
    stems.add(pastVerbMatch[1]);
  }
  for (const stem of stems) {
    const presentForm = stem + 'ます';
    const pastForm = stem + 'ました';
    const countA_past = (a.match(new RegExp(pastForm, 'g')) || []).length;
    const countT_past = (t.match(new RegExp(pastForm, 'g')) || []).length;
    const countT_present = (t.match(new RegExp(presentForm, 'g')) || []).length;
    if (countA_past > 0 && countT_past < countA_past && countT_present > 0) {
      tenseMismatch = true;
      break;
    }
  }
  const questionTense = detectTense(question);
  const answerTense = detectTense(answer);
  const questionAnswerTenseMismatch = questionTense !== 'unknown' && answerTense !== 'unknown' && questionTense !== answerTense;
  const particleSeqA = grammarSignals.particleSeqA;
  const particleSeqT = grammarSignals.particleSeqT;
  /** @type {string[]} */
  const missingParticles = [];
  particles.forEach(p => {
    const countA = (a.match(new RegExp(p, 'g')) || []).length;
    const countT = (t.match(new RegExp(p, 'g')) || []).length;
    if (countA > 0 && countT < countA) missingParticles.push(p);
    if (countT > 0 && countA === 0) missingParticles.push(p);
  });

  const hasParticleMismatch = grammarSignals.particleMismatch || missingParticles.length > 0;

  const markers = ['ます', 'ました', 'ません', 'です', 'でした', 'ましょう', 'ますか', 'ませんか'];
  /** @type {string[]} */
  const missingVerbs = [];
  markers.forEach(marker => {
    const pattern = new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const countA = (a.match(pattern) || []).length;
    const countT = (t.match(pattern) || []).length;
    if ((countA > 0 || countT > 0) && countA !== countT) missingVerbs.push(marker);
  });

  const hasPolarityProblem = grammarSignals.polarityMismatch;
  const hasProhibitionProblem = grammarSignals.prohibitionMismatch;
  const hasTenseProblem = tenseMismatch || questionAnswerTenseMismatch || grammarSignals.tenseMismatch;
  const particlePenalty = (hasParticleMismatch ? 40 : 0) + missingParticles.length * 4;
  const verbPenalty = ((hasTenseProblem || hasPolarityProblem || hasProhibitionProblem) ? 60 : 0) + missingVerbs.length * 6;
  if (particlePenalty + verbPenalty > 0) {
    finalScore -= particlePenalty + verbPenalty;
    if (hasParticleMismatch) {
      particleNotes = 'Particle mismatch: expected particles "' + particleSeqA + '" but heard "' + particleSeqT + '".';
    } else if (missingParticles.length > 0) {
      particleNotes = 'Check your particles: ' + missingParticles.join(', ') + ' seems missing or incorrect.';
    }
    if (hasCompletionProblem) {
      grammarNotes = completionSignals.reason;
      grammarCategory = 'Completeness';
    } else if (hasProhibitionProblem) {
      grammarNotes = 'Prohibition form error: use 〜てはいけません instead of 〜てもいきません.';
      grammarCategory = 'Conjugation';
    } else if (hasPolarityProblem) {
      grammarNotes = 'Polarity mismatch: positive/negative form does not match the expected answer.';
      grammarCategory = 'Conjugation';
    } else if (hasTenseProblem || missingVerbs.length > 0) {
      grammarNotes = hasTenseProblem
        ? (questionAnswerTenseMismatch
          ? 'Question and answer tense do not match.'
          : 'Verb tense error: used present tense (ます) instead of required past tense (ました).')
        : 'Check your verb tense/conjugation: ' + missingVerbs.join(', ') + ' seems missing or incorrect.';
      grammarCategory = hasTenseProblem ? 'Tense' : 'Conjugation';
    }
  }

  finalScore = Math.max(0, finalScore);
  const isCorrect = !hasCompletionProblem && !hasParticleMismatch && !hasTenseProblem && !hasProhibitionProblem && finalScore >= 45;

  // The specific reasons above, in the { category, explanation } shape the
  // feedback cards render (AI results carry these as `breakdown`). The
  // particle note is only shown when the sentence is otherwise identical
  // (grammarSignals.particleMismatch): the character-count check also fires on
  // kana inside words (が in がくせい, で in です), which reads as nonsense.
  const hints = [];
  if (grammarNotes) hints.push({ category: grammarCategory || 'Grammar', explanation: grammarNotes });
  if (particleNotes && grammarSignals.particleMismatch) hints.push({ category: 'Particle', explanation: particleNotes });

  return {
    correct: isCorrect,
    score: finalScore,
    feedback: isCorrect ? 'Answer matched (local check).' : 'Answer did not match closely enough (local check).',
    grammarNotes: grammarNotes,
    particleNotes: particleNotes,
    vocabularyNotes: '',
    suggestedAnswer: isCorrect ? '' : answer,
    hints,
    source: 'local'
  };
}
