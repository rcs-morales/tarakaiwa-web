import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAssistantQuery } from '../src/app.js';
import * as ai from '../src/ai.js';

describe('Assistant Integration Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    document.body.innerHTML = `
      <div id="ai-assistant-panel" class="hidden"></div>
      <div id="ai-chat-history"></div>
      <input id="ai-chat-input" value="" />
      <button id="btn-ai-send"></button>
    `;
  });

  it('should maintain a conversation history of maximum 20 messages', async () => {
    const { assistantHistory } = await import('../src/app.js');
    assistantHistory.splice(0, assistantHistory.length);

    vi.spyOn(ai, 'askStudyAssistant').mockResolvedValue({ response: 'AI Response' });

    for (let i = 0; i < 11; i++) {
      await handleAssistantQuery(`Query ${i}`);
    }

    expect(assistantHistory.length).toBe(20);
    const historyTexts = assistantHistory.map(m => m.content);
    expect(historyTexts).not.toContain('Query 0');
  });

  it('should disable the send button while waiting for AI response', async () => {
    vi.spyOn(ai, 'askStudyAssistant').mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve({ response: 'Done' }), 100))
    );

    const sendBtn = document.getElementById('btn-ai-send');
    const queryPromise = handleAssistantQuery('Testing loading state');

    expect(sendBtn.disabled).toBe(true);

    await queryPromise;

    expect(sendBtn.disabled).toBe(false);
  });

  it('should update the chat history UI with the assistant response', async () => {
    const historyDiv = document.getElementById('ai-chat-history');

    vi.spyOn(ai, 'askStudyAssistant').mockResolvedValue({
      response: 'Hello! I am your tutor.'
    });

    await handleAssistantQuery('Hello');

    expect(historyDiv.innerHTML).toContain('Hello! I am your tutor.');
    expect(historyDiv.innerHTML).toContain('ai-msg user');
  });
});
