// ─────────────────────────────────────────────
// STUDY ASSISTANT & TRANSLATION
// ─────────────────────────────────────────────

import { getGroqApiKey, getGradingModel } from './groqClient.js';
import {
  STUDY_ASSISTANT_PROMPT, TRANSLATION_SYSTEM_PROMPT, getToJapaneseTranslationPrompt
} from './prompts.js';

function normalizeJapaneseTranslation(raw) {
  if (!raw) return '';

  let text = String(raw).trim();
  if (!text) return '';

  text = text.replace(/^\s*['"`]+|['"`]+\s*$/g, '');
  text = text.replace(/\{[^{}]*\}/g, '').trim();
  text = text.replace(/^[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}0-9A-Za-z]+/u, '');
  text = text.replace(/[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}0-9A-Za-z]+$/u, '');

  const separatorParts = text.split(/[・/／,，。.!?;:]+/u).map(part => part.trim()).filter(Boolean);
  if (separatorParts.length > 1) {
    const kanjiPart = separatorParts.find(part => /[\p{Script=Han}]/u.test(part));
    if (kanjiPart) return kanjiPart;
    return separatorParts[0];
  }

  const englishLike = /[A-Za-z]/.test(text) && !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
  if (englishLike) return '';

  return text;
}

/**
 * Ask the AI study assistant a question, maintaining conversation history.
 * @param {string} query
 * @param {Array} history - previous conversation turns
 * @returns {Promise<{response?: string, error?: string}>}
 */
export async function askStudyAssistant(query, history = []) {
  const apiKey = getGroqApiKey();
  if (!apiKey) return { error: 'MISSING_KEY' };

  try {
    const messages = [
      { role: 'system', content: STUDY_ASSISTANT_PROMPT },
      ...history,
      { role: 'user', content: query }
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: getGradingModel(),
        temperature: 0.7,
        max_tokens: 500,
        messages: messages
      })
    });

    if (!response.ok) {
      if (response.status === 401) return { error: 'INVALID_KEY' };
      if (response.status === 429) return { error: 'RATE_LIMIT' };
      return { error: 'API_ERROR_' + response.status };
    }
    const data = await response.json();
    const text = (data.choices?.[0]?.message?.content || '').trim();
    return { response: text };
  } catch (e) {
    console.error('Study Assistant error:', e);
    return { error: 'NETWORK_ERROR' };
  }
}

/**
 * Translate Japanese text to English using the Groq LLM.
 * @param {string} japaneseText
 * @returns {Promise<string|null>}
 */
/**
 * Translate learner input into Japanese using the Groq LLM.
 * @param {string} text
 * @returns {Promise<{japanese?: string, error?: string}>}
 */
export async function translateToJapaneseWithAI(text, sourceLang = 'English') {
  const apiKey = getGroqApiKey();
  if (!apiKey) return { error: 'MISSING_KEY' };

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: getGradingModel(),
        temperature: 0.2,
        max_tokens: 300,
        messages: [
          { role: 'system', content: getToJapaneseTranslationPrompt(sourceLang) },
          { role: 'user', content: text }
        ]
      })
    });

    if (!response.ok) {
      if (response.status === 401) return { error: 'INVALID_KEY' };
      if (response.status === 429) return { error: 'RATE_LIMIT' };
      return { error: 'API_ERROR_' + response.status };
    }

    const data = await response.json();
    const content = (data.choices?.[0]?.message?.content || '').trim();

    try {
      // Robust JSON extraction: find the first '{' and last '}'
      const startIdx = content.indexOf('{');
      const endIdx = content.lastIndexOf('}');

      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        const jsonString = content.substring(startIdx, endIdx + 1);
        const parsed = JSON.parse(jsonString);

        // Flexible key checking: look for 'japanese', 'translation', or 'text'
        const japaneseRaw = (parsed.japanese || parsed.translation || parsed.text || '').trim();
        const romaji = (parsed.romaji || '').trim();
        const japanese = normalizeJapaneseTranslation(japaneseRaw);

        if (japanese) {
          return { japanese, romaji };
        }

        // If we have romaji but no japanese, and the content was JSON,
        // the AI might have messed up the keys. We can't easily recover
        // the Japanese from romaji, so we check if the whole content is useful.
      }

      // Fallback: if no valid JSON with a Japanese translation is found,
      // check if the AI returned the translation as a plain string.
      // We remove common JSON-like markers if they are wrapping a single string.
      const cleanContent = content.replace(/^\{.*"japanese":\s*"/, '').replace(/"\s*\},?$/, '').trim();
      const normalizedClean = normalizeJapaneseTranslation(cleanContent);

      if (normalizedClean) {
         return { japanese: normalizedClean, romaji: '' };
      }

      const normalizedContent = normalizeJapaneseTranslation(content);
      if (normalizedContent) return { japanese: normalizedContent, romaji: '' };
      return { error: 'EMPTY_RESPONSE' };
    } catch (e) {
      console.error('Translation parse error:', e, content);
      return content ? { japanese: content, romaji: '' } : { error: 'EMPTY_RESPONSE' };
    }
  } catch (e) {
    console.error('To-Japanese translation error:', e);
    return { error: 'NETWORK_ERROR' };
  }
}

export async function translateWithAI(japaneseText, context = '') {
  const apiKey = getGroqApiKey();
  if (!apiKey) return null;

  try {
    const userContent = context 
      ? `Context (The Question): ${context}\n\nText to translate: ${japaneseText}`
      : japaneseText;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: getGradingModel(),
        temperature: 0.1,
        max_tokens: 200,
        messages: [
          { role: 'system', content: TRANSLATION_SYSTEM_PROMPT },
          { role: 'user', content: userContent }
        ]
      })
    });
    if (!response.ok) return null;
    const data = await response.json();
    return (data.choices?.[0]?.message?.content || '').trim();
  } catch (e) {
    console.error('Translation error:', e);
    return null;
  }
}
