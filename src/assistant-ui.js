import { askStudyAssistant } from './ai/index.js';

export const assistantHistory = [];

/**
 * Handle a query from the AI Study Assistant, updating the chat UI and history.
 * @param {string} query
 */
export async function handleAssistantQuery(query) {
  if (!query) return;

  const historyBox = document.getElementById('ai-chat-history');
  const inputField = document.getElementById('ai-chat-input');
  const sendBtn = document.getElementById('btn-ai-send');

  appendAiMessage('user', query);

  inputField.value = '';
  if (sendBtn) sendBtn.disabled = true;

  const assistantMsgDiv = appendAiMessage('assistant', 'Thinking...');

  const result = await askStudyAssistant(query, assistantHistory);

  if (result && result.response) {
    // Remove furigana processing for the chatbot to avoid clutter and mismatched readings.
    // Instead, highlight the readings provided in parentheses by the AI.
    const formattedResponse = result.response.replace(/(\([a-zA-Z\s-]+\))/g, '<span class="ai-reading-highlight">$1</span>');
    assistantMsgDiv.innerHTML = formattedResponse;

    assistantHistory.push({ role: 'user', content: query });
    assistantHistory.push({ role: 'assistant', content: result.response });

    if (assistantHistory.length > 20) {
      assistantHistory.splice(0, assistantHistory.length - 20);
    }
  } else {
    let errorMsg = '❌ Sorry, I encountered an error.';
    if (result?.error === 'MISSING_KEY') {
      errorMsg = '❌ No API key found. Please add one in settings.';
    } else if (result?.error === 'INVALID_KEY') {
      errorMsg = '❌ Invalid API key. Please check your key in settings.';
    } else if (result?.error === 'RATE_LIMIT') {
      errorMsg = '⚠️ Rate limit exceeded. Please wait a moment and try again.';
    } else if (result?.error === 'NETWORK_ERROR') {
      errorMsg = '🌐 Network error. Please check your connection.';
    } else {
      errorMsg = `❌ API Error (${result?.error || 'Unknown'}). Please try again.`;
    }
    assistantMsgDiv.textContent = errorMsg;
  }

  if (sendBtn) sendBtn.disabled = false;
  if (historyBox) historyBox.scrollTop = historyBox.scrollHeight;
}

/**
 * Append a message to the AI chat history UI.
 * @param {string} role - 'user' or 'assistant'
 * @param {string} text
 * @returns {HTMLElement|null}
 */
export function appendAiMessage(role, text) {
  const historyBox = document.getElementById('ai-chat-history');
  if (!historyBox) return null;

  const msgDiv = document.createElement('div');
  msgDiv.className = `ai-msg ${role}`;
  msgDiv.innerHTML = text;
  historyBox.appendChild(msgDiv);
  historyBox.scrollTop = historyBox.scrollHeight;
  return msgDiv;
}

function makeDraggable(element, handle) {
  let isDragging = false;
  let offsetX = 0, offsetY = 0;

  handle.addEventListener('mousedown', (e) => {
    isDragging = true;
    const rect = element.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    element.style.transition = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (isDragging) {
      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;
      element.style.left = x + 'px';
      element.style.top = y + 'px';
      element.style.bottom = 'auto';
      element.style.right = 'auto';
    }
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      element.style.transition = '';
    }
    isDragging = false;
  });
}

/** Make the floating assistant button draggable on the page. */
export function initAssistantFloatButton() {
  const btn = document.getElementById('btn-ai-assistant');
  if (btn) makeDraggable(btn, btn);
}

export function initAiPanelInteractivity() {
  const panel = document.getElementById('ai-assistant-panel');
  const header = panel?.querySelector('.ai-panel-header');
  const resizer = panel?.querySelector('.ai-panel-resizer');
  if (!panel || !header || !resizer) return;

  makeDraggable(panel, header);

  // ── Resizing Logic ──
  let isResizing = false;
  let startWidth = 0, startHeight = 0, startX = 0, startY = 0;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    e.preventDefault();
    e.stopPropagation();
    startWidth = panel.offsetWidth;
    startHeight = panel.offsetHeight;
    startX = e.clientX;
    startY = e.clientY;
    panel.style.transition = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (isResizing) {
      const width = startWidth + (e.clientX - startX);
      const height = startHeight + (e.clientY - startY);
      if (width > 280) panel.style.width = width + 'px';
      if (height > 300) panel.style.height = height + 'px';
    }
  });

  window.addEventListener('mouseup', () => {
    if (isResizing) {
      panel.style.transition = '';
    }
    isResizing = false;
  });
}
