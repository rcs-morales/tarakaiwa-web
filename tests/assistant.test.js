import { describe, it, expect, vi, beforeEach } from 'vitest';
import { askStudyAssistant, translateToJapaneseWithAI } from '../src/lib/ai/index.js';
import { askAssistant, assistant, assistantHistory, formatAssistantReply } from '../src/lib/assistant.svelte.js';

vi.mock('../src/lib/ai/index.js', async (importOriginal) => {
  const actual = /** @type {object} */ (await importOriginal());
  return {
    ...actual,
    askStudyAssistant: vi.fn(),
  };
});

describe('askStudyAssistant Unit Tests', () => {
  let realAskStudyAssistant;
  beforeEach(async () => {
    const mod = await vi.importActual('../src/lib/ai/index.js');
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

    const callBody = JSON.parse(/** @type {any[]} */ (mockFetch.mock.calls[0])[1].body);
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
    expect(result).toEqual({ japanese: '電車', romaji: 'densha', english: '' });
  });
});

describe('AI Assistant chat flow', () => {
  beforeEach(() => {
    assistant.messages.length = 0;
    assistant.busy = false;
    assistantHistory.length = 0;
    vi.restoreAllMocks();
    vi.mocked(askStudyAssistant).mockClear();
  });

  it('appends the question and a formatted reply', async () => {
    vi.mocked(askStudyAssistant).mockResolvedValue({ response: 'Hello! I am here to help. (konnichiwa)' });

    await askAssistant('Hello tutor!');

    expect(assistant.messages).toHaveLength(2);
    expect(assistant.messages[0]).toEqual({ role: 'user', text: 'Hello tutor!' });
    expect(assistant.messages[1].html).toContain('Hello! I am here to help.');
    expect(assistant.messages[1].html).toContain('<span class="ai-reading-highlight">(konnichiwa)</span>');
    expect(assistantHistory).toHaveLength(2);
  });

  it('maps API errors to user-friendly messages', async () => {
    vi.mocked(askStudyAssistant).mockResolvedValue({ error: 'RATE_LIMIT' });

    await askAssistant('Help me!');

    expect(assistant.messages[1].text).toContain('Rate limit exceeded');
    expect(assistant.messages[1].html).toBeUndefined();
    expect(assistantHistory).toHaveLength(0);
  });

  it('shows the error code for unknown API errors', async () => {
    vi.mocked(askStudyAssistant).mockResolvedValue({ error: 'API_ERROR_500' });

    await askAssistant('Help me!');

    expect(assistant.messages[1].text).toBe('❌ API Error (API_ERROR_500). Please try again.');
  });

  it('keeps the context history capped at 20 messages', async () => {
    vi.mocked(askStudyAssistant).mockResolvedValue({ response: 'Ok' });

    for (let i = 0; i < 12; i++) {
      await askAssistant('Query ' + i);
    }

    expect(assistantHistory).toHaveLength(20);
    expect(assistantHistory.map((m) => m.content)).not.toContain('Query 0');
    expect(assistantHistory.map((m) => m.content)).toContain('Query 11');
  });

  it('is busy while waiting and ignores a second question meanwhile', async () => {
    /** @type {any} */ let resolve;
    vi.mocked(askStudyAssistant).mockImplementation(() => new Promise((r) => { resolve = r; }));

    const pending = askAssistant('First');
    expect(assistant.busy).toBe(true);
    await askAssistant('Second');
    expect(askStudyAssistant).toHaveBeenCalledTimes(1);

    resolve({ response: 'Done' });
    await pending;
    expect(assistant.busy).toBe(false);
  });
});

describe('formatAssistantReply', () => {
  it('keeps the formatting tags the prompt asks for', () => {
    const html = formatAssistantReply('<p><strong>時</strong> means time.</p><ul><li>今 (ima)</li></ul>');
    expect(html).toBe('<p><strong>時</strong> means time.</p><ul><li>今 <span class="ai-reading-highlight">(ima)</span></li></ul>');
  });

  it('strips scripts, event handlers, links and other attributes', () => {
    const html = formatAssistantReply(
      '<p onclick="x()">Hi</p><img src=x onerror="alert(1)"><script>alert(2)</script>' +
      '<a href="javascript:alert(3)">link</a><strong style="color:red">bold</strong>'
    );
    expect(html).toBe('<p>Hi</p>link<strong>bold</strong>');
  });

  it('escapes plain text that looks like markup after decoding', () => {
    const html = formatAssistantReply('a &lt;b&gt; c');
    expect(html).toBe('a &lt;b&gt; c');
  });
});
