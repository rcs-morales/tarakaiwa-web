// ─────────────────────────────────────────────
// STUDY ASSISTANT & TRANSLATION
// ─────────────────────────────────────────────

import { getGroqApiKey, getGradingModel } from './groqClient.js';
import { STUDY_ASSISTANT_PROMPT, TRANSLATION_SYSTEM_PROMPT } from './prompts.js';

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
export async function translateWithAI(japaneseText) {
  const apiKey = getGroqApiKey();
  if (!apiKey) return null;

  try {
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
          { role: 'user', content: japaneseText }
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
