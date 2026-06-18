import { describe, it, expect, vi, beforeEach } from 'vitest';
import { askStudyAssistant } from '../src/ai/index.js';

describe('askStudyAssistant Unit Tests', () => {
  beforeEach(() => {
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

    const result = await askStudyAssistant('Konnichiwa');
    expect(result).toEqual({ response: 'Hello! I am your tutor.' });
  });

  it('should return MISSING_KEY when no API key is found', async () => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await askStudyAssistant('Konnichiwa');

    expect(result).toEqual({ error: 'MISSING_KEY' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should return INVALID_KEY when the API returns 401', async () => {
    vi.mocked(localStorage.getItem).mockReturnValue('gsk_invalid_key');

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 401
    })));

    const result = await askStudyAssistant('Konnichiwa');
    expect(result).toEqual({ error: 'INVALID_KEY' });
  });

  it('should return RATE_LIMIT when the API returns 429', async () => {
    vi.mocked(localStorage.getItem).mockReturnValue('gsk_test_key');

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 429
    })));

    const result = await askStudyAssistant('Konnichiwa');
    expect(result).toEqual({ error: 'RATE_LIMIT' });
  });

  it('should return NETWORK_ERROR when fetch fails', async () => {
    vi.mocked(localStorage.getItem).mockReturnValue('gsk_test_key');

    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));

    const result = await askStudyAssistant('Konnichiwa');
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

    await askStudyAssistant('How are you?', history);

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.messages).toHaveLength(4);
    expect(callBody.messages[0].role).toBe('system');
    expect(callBody.messages[1]).toEqual(history[0]);
    expect(callBody.messages[2]).toEqual(history[1]);
    expect(callBody.messages[3].content).toBe('How are you?');
  });
});
