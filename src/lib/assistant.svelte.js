// AI Study Assistant: chat state + the ask flow. Rendered by
// components/StudyAssistant.svelte.

import { askStudyAssistant } from './ai/index.js';

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
// harmless inline ones. Everything else is unwrapped to its text; no
// attributes survive, so replies can't carry scripts, handlers or links.
const ALLOWED_TAGS = new Set(['P', 'STRONG', 'B', 'EM', 'I', 'UL', 'OL', 'LI', 'BR']);
const DROP_WITH_CONTENT = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT']);
// Readings the model writes after kanji, e.g. 時 (toki).
const READING_RE = /(\([a-zA-Z\s-]+\))/g;

/**
 * Turn the model's HTML reply into safe markup: keep only ALLOWED_TAGS (with
 * no attributes) and wrap romaji readings in .ai-reading-highlight spans.
 * @param {string} html
 * @returns {string}
 */
export function formatAssistantReply(html) {
  // <template> content is inert: nothing in it runs or loads while parsing.
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html ?? '');
  const out = document.createElement('div');
  appendClean(tpl.content, out);
  return out.innerHTML;
}

/**
 * @param {Node} from
 * @param {Node} to
 */
function appendClean(from, to) {
  for (const node of Array.from(from.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      appendHighlightedText(node.textContent || '', to);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = /** @type {Element} */ (node).tagName;
      if (DROP_WITH_CONTENT.has(tag)) continue;
      if (ALLOWED_TAGS.has(tag)) {
        const el = document.createElement(tag.toLowerCase());
        appendClean(node, el);
        to.appendChild(el);
      } else {
        appendClean(node, to);
      }
    }
    // Comments and anything else are dropped.
  }
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
