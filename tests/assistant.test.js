import { describe, it, expect, vi, beforeEach } from 'vitest';
import { askStudyAssistant, translateToJapaneseWithAI } from '../src/ai/index.js';
import { handleAssistantQuery, assistantHistory } from '../src/assistant-ui.js';

vi.mock('../src/ai/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    askStudyAssistant: vi.fn(),
  };
});

describe('askStudyAssistant Unit Tests', () => {
  let realAskStudyAssistant;
  beforeEach(async () => {
    const mod = await vi.importActual('../src/ai/index.js');
    realAskStudyAssistant = mod.askStudyAssistant;
    vi.restoreAllMocks();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
    });
  });

  it('should return the trimmed response on a successful API call', async () => {
    vi.mocked(localStorage.getItem).mockReturnValue('gsk_test_key');

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: '  Hello! I am your tutor.  '
          }
        }]
      })
    })));

    const result = await realAskStudyAssistant('Konnichiwa');
    expect(result).toEqual({ response: 'Hello! I am your tutor.' });
  });

  it('should return MISSING_KEY when no API key is found', async () => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await realAskStudyAssistant('Konnichiwa');

    expect(result).toEqual({ error: 'MISSING_KEY' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should return INVALID_KEY when the API returns 401', async () => {
    vi.mocked(localStorage.getItem).mockReturnValue('gsk_invalid_key');

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 401
    })));

    const result = await realAskStudyAssistant('Konnichiwa');
    expect(result).toEqual({ error: 'INVALID_KEY' });
  });

  it('should return RATE_LIMIT when the API returns 429', async () => {
    vi.mocked(localStorage.getItem).mockReturnValue('gsk_test_key');

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 429
    })));

    const result = await realAskStudyAssistant('Konnichiwa');
    expect(result).toEqual({ error: 'RATE_LIMIT' });
  });

  it('should return NETWORK_ERROR when fetch fails', async () => {
    vi.mocked(localStorage.getItem).mockReturnValue('gsk_test_key');

    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));

    const result = await realAskStudyAssistant('Konnichiwa');
    expect(result).toEqual({ error: 'NETWORK_ERROR' });
  });

  it('should correctly include history in the API payload', async () => {
    vi.mocked(localStorage.getItem).mockReturnValue('gsk_test_key');

    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Response' } }]
      })
    }));
    vi.stubGlobal('fetch', mockFetch);

    const history = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' }
    ];

    await realAskStudyAssistant('How are you?', history);

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.messages).toHaveLength(4);
    expect(callBody.messages[0].role).toBe('system');
    expect(callBody.messages[1]).toEqual(history[0]);
    expect(callBody.messages[2]).toEqual(history[1]);
    expect(callBody.messages[3].content).toBe('How are you?');
  });
});

describe('translateToJapaneseWithAI normalization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => 'gsk_test_key'),
      setItem: vi.fn(),
    });
  });

  it('prefers a single canonical Japanese phrase when the model returns a furigana pair', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"japanese":"電車{でんしゃ}","romaji":"densha"}' } }]
      })
    })));

    const result = await translateToJapaneseWithAI('train');
    expect(result).toEqual({ japanese: '電車', romaji: 'densha' });
  });
});

describe('AI Assistant UI Integration', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="ai-chat-history"></div>
      <input id="ai-chat-input" value="Hello tutor!" />
      <button id="btn-ai-send"></button>
    `;
    assistantHistory.length = 0; // Clear history
    vi.restoreAllMocks();
  });

  it('should append user message and handle a successful AI response', async () => {
    vi.mocked(askStudyAssistant).mockResolvedValue({ response: 'Hello! I am here to help. (konnichiwa)' });

    await handleAssistantQuery('Hello tutor!');

    const history = document.getElementById('ai-chat-history');
    expect(history.innerHTML).toContain('Hello tutor!');
    expect(history.innerHTML).toContain('Hello! I am here to help.');
    expect(history.innerHTML).toContain('ai-reading-highlight'); // Verify formatting
    expect(assistantHistory).toHaveLength(2);
  });

  it('should map API errors to user-friendly messages', async () => {
    vi.mocked(askStudyAssistant).mockResolvedValue({ error: 'RATE_LIMIT' });

    await handleAssistantQuery('Help me!');

    const history = document.getElementById('ai-chat-history');
    expect(history.innerHTML).toContain('Rate limit exceeded');
  });

  it('should truncate history to 20 messages', async () => {
    vi.mocked(askStudyAssistant).mockResolvedValue({ response: 'Ok' });

    // Fill history up to 20
    for (let i = 0; i < 11; i++) {
      await handleAssistantQuery('Query ' + i);
    }

    expect(assistantHistory.length).toBe(20);

    // Add one more
    await handleAssistantQuery('Query 11');
    expect(assistantHistory.length).toBe(20); // Should remain 20
  });
});
