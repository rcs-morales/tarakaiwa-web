// AI Study Assistant: chat state + the ask flow. Rendered by
// components/StudyAssistant.svelte.

import { askStudyAssistant } from './ai/index.js';
import { sanitizeHtml } from './sanitize.js';

/** Conversation sent back to the model as context (capped at 20 messages). */
export const assistantHistory = [];
const MAX_HISTORY = 20;

/**
 * @typedef {{ role: 'user' | 'assistant', text?: string, html?: string }} ChatMessage
 *   `text` is rendered as plain text; `html` is a sanitized assistant reply.
 */

export const assistant = $state({
  /** @type {ChatMessage[]} */
  messages: [],
  busy: false,
  open: false,
});

const ERROR_MESSAGES = {
  MISSING_KEY: '❌ No API key found. Please add one in settings.',
  INVALID_KEY: '❌ Invalid API key. Please check your key in settings.',
  RATE_LIMIT: '⚠️ Rate limit exceeded. Please wait a moment and try again.',
  NETWORK_ERROR: '🌐 Network error. Please check your connection.',
};

/**
 * Send a question to the assistant and append the exchange to the chat.
 * @param {string} query
 */
export async function askAssistant(query) {
  query = (query || '').trim();
  if (!query || assistant.busy) return;

  assistant.messages.push({ role: 'user', text: query });
  assistant.messages.push({ role: 'assistant', text: 'Thinking...' });
  const reply = assistant.messages[assistant.messages.length - 1];
  assistant.busy = true;

  try {
    const result = await askStudyAssistant(query, assistantHistory);
    if (result && result.response) {
      reply.text = undefined;
      reply.html = formatAssistantReply(result.response);

      assistantHistory.push({ role: 'user', content: query });
      assistantHistory.push({ role: 'assistant', content: result.response });
      if (assistantHistory.length > MAX_HISTORY) {
        assistantHistory.splice(0, assistantHistory.length - MAX_HISTORY);
      }
    } else {
      reply.text = ERROR_MESSAGES[result?.error]
        ?? `❌ API Error (${result?.error || 'Unknown'}). Please try again.`;
    }
  } catch {
    reply.text = '❌ Sorry, I encountered an error.';
  } finally {
    assistant.busy = false;
  }
}

// Tags the assistant prompt asks for (see STUDY_ASSISTANT_PROMPT), plus a few
// harmless inline ones. No attributes survive, so replies can't carry
// scripts, handlers or links.
const ALLOWED_TAGS = ['p', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'br'];
// Readings the model writes after kanji, e.g. 時 (toki).
const READING_RE = /(\([a-zA-Z\s-]+\))/g;

/**
 * Turn the model's HTML reply into safe markup: keep only ALLOWED_TAGS (with
 * no attributes) and wrap romaji readings in .ai-reading-highlight spans.
 * @param {string} html
 * @returns {string}
 */
export function formatAssistantReply(html) {
  return sanitizeHtml(html, { allow: ALLOWED_TAGS, onText: appendHighlightedText });
}

/**
 * @param {string} text
 * @param {Node} to
 */
function appendHighlightedText(text, to) {
  const parts = text.split(READING_RE);
  parts.forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 1) {
      const span = document.createElement('span');
      span.className = 'ai-reading-highlight';
      span.textContent = part;
      to.appendChild(span);
    } else {
      to.appendChild(document.createTextNode(part));
    }
  });
}
