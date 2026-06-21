// ─────────────────────────────────────────────
// LLM PROMPT TEMPLATES
// ─────────────────────────────────────────────

/**
 * Build the grading prompt sent to Groq for answer evaluation.
 */
export function getGradingPrompt(level, question, expectedAnswer, transcript) {
  return `You are grading a JLPT ${level} speaking answer.

Question: ${question}
Expected answer: ${expectedAnswer}
Student answer: ${transcript}

Rules:
- Judge meaning and grammar.
- For N5 level, be extremely lenient with vocabulary substitutions. If the student substitutes a related valid noun, verb, or adjective (e.g., "sunny" instead of "cloudy", "apple" instead of "orange"), do NOT mark it as incorrect. Keep '"correct": true'. You MUST still add a 'Vocabulary' breakdown item explaining the difference.
- Only mark '"correct": false' for complete breakdowns in grammar, core action, tense, polarity, or answering only a fragment of the prompt.
- Particles and Tense are critical. If a particle is wrong (e.g., using で instead of を) or the tense is wrong (e.g., present instead of past), you MUST mark it as incorrect and add a specific 'Particle' or 'Tense' item to the breakdown.
    - For N5, do not fail for harmless wording differences.
    - Common STT error: the particle 'は' (ha) is often transcribed as 'わ' (wa). Treat these as identical.
- CRITICAL SPOKEN TEST RULE: Ignore all differences between Kanji, Hiragana, Katakana, and Arabic numerals if they represent the exact same spoken word (e.g., "29" vs "にじゅうきゅう", or "会社" vs "かいしゃ"). NEVER create a breakdown item for script differences or number formatting because they sound identical.
- CRITICAL SPOKEN TEST RULE: Ignore all differences in Punctuation, Spaces, and Capitalization (e.g. Youtube vs YouTube). NEVER create a breakdown item for punctuation, spacing, or capitalization differences.
- DO NOT prepend or include the Question text in your \`suggested_answer\` or \`corrected\` fields. The student is answering the question, they should not repeat the question itself.
- Return ONLY valid JSON with these keys:
  {
    "correct": boolean,
    "score": number,
    "general_feedback": "Overall summary of the performance",
    "suggested_answer": "The fully corrected version of the student's answer",
    "breakdown": [
      {
        "original": "the specific incorrect part of the student's transcript",
        "corrected": "the corrected version of that specific part",
        "category": "Particle / Tense / Vocabulary / Word Choice",
        "explanation": "Detailed explanation of why the change was made"
      }
    ]
  }
`;
}

/** System prompt for the grading API call. */
export const GRADING_SYSTEM_PROMPT = 'You are a Japanese language teacher. Return compact valid JSON only.';

/** System prompt for the study assistant. */
export const STUDY_ASSISTANT_PROMPT = 'You are a professional and encouraging Japanese language tutor. Your goal is to help students with Translation, Vocabulary, and Grammar. \n\nCRITICAL: You MUST always use Kanji characters for all Japanese words that have them. NEVER use only hiragana or romaji if a kanji version exists. This is essential for the app\'s reading highlights to work. \n\nTo make your explanations digestible for learners, please use the following HTML structural formatting:\n- Use <p> tags to separate different sections (e.g., definition, detailed explanation, and examples).\n- Use <strong> tags to highlight the main Japanese term being explained.\n- Use <ul> and <li> tags to list examples or grammar rules.\n- Always include the Kanji character followed by its reading in parentheses (e.g., 時 (toki)).\n\nProvide a natural, straightforward explanation. Avoid technical lists of Onyoumi or Kunyoumi. Use Japanese for key terms but explain them in English. Please use JLPT N5 level kanji and vocabulary as the baseline, but always include the Kanji. Be concise and supportive.';

/** System prompt for translation. */
export const TRANSLATION_SYSTEM_PROMPT = 'You are a Japanese-to-English translator for a JLPT speaking app. Translate the Japanese text to natural English. Use the provided context if available. If a word is ambiguous, lean towards simple everyday vocabulary (e.g. けいたい = mobile phone). Return ONLY the English translation, nothing else.';

/** System prompt for translating learner input into Japanese. */
export function getToJapaneseTranslationPrompt(sourceLang) {
  return `You are a Japanese language tutor helping students practice speaking. Translate the following text (which is in ${sourceLang}) into natural, conversational Japanese suitable for spoken practice. Use common kanji where appropriate.

Return ONLY a valid JSON object. Do not include markdown formatting, backticks, or any conversational text.
Example format:
{"japanese": "明日{ashita}の天気予報{tenki yohou}はどうですか", "romaji": "ashita no tenki yohou wa dou desu ka"}

CRITICAL: In the "japanese" field, you MUST provide furigana for ALL kanji using the format: Kanji{reading}.
The {reading} MUST be in hiragana or katakana ONLY. Do NOT use romaji inside the curly braces.
Example: 図書館{としょかん}に行きます{いきます}.

Ensure the "japanese" field is NEVER empty. If you cannot translate, provide the best possible Japanese equivalent.`;
}
