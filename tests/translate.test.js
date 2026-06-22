import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translateToJapaneseWithAI } from '../src/ai/index.js';
import { toFuriganaHtml } from '../src/parser.js';
import {
  handleTranslateAndSpeak, toggleTranslateMic, replayJapaneseAudio
} from '../src/translate-ui.js';

describe('translateToJapaneseWithAI Unit Tests', () => {
  let realTranslateToJapanese;

  beforeEach(async () => {
    const mod = await vi.importActual('../src/ai/studyAssistant.js');
    realTranslateToJapanese = mod.translateToJapaneseWithAI;
    vi.restoreAllMocks();
    vi.stubGlobal('localStorage', {
      store: {},
      getItem(key) { return this.store[key] || null; },
      setItem(key, value) { this.store[key] = value.toString(); },
      removeItem(key) { delete this.store[key]; },
      clear() { this.store = {}; },
    });
  });

  it('returns Japanese text on success', async () => {
    localStorage.setItem('api_key', 'gsk_test_key');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '  こんにちは  ' } }]
      })
    })));

    const result = await realTranslateToJapanese('Hello');
    expect(result).toEqual({ japanese: 'こんにちは', romaji: '' });
  });

  it('returns MISSING_KEY when no API key is configured', async () => {
    localStorage.removeItem('api_key');
    const result = await realTranslateToJapanese('Hello');
    expect(result).toEqual({ error: 'MISSING_KEY' });
  });

  it('returns RATE_LIMIT on 429', async () => {
    localStorage.setItem('api_key', 'gsk_test_key');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429 })));

    const result = await realTranslateToJapanese('Hello');
    expect(result).toEqual({ error: 'RATE_LIMIT' });
  });
});

vi.mock('../src/ai/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    translateToJapaneseWithAI: vi.fn(),
    transcribeForTool: vi.fn(),
    hasGroqApiKey: vi.fn(() => true),
  };
});

vi.mock('../src/tts.js', () => ({
  speakQuestion: vi.fn((_text, onEnd) => {
    if (onEnd) onEnd();
    return Promise.resolve();
  }),
  cancelCurrentSpeech: vi.fn(),
  cancelSpeech: vi.fn(),
}));

describe('Furigana Rendering', () => {
  it('renders AI furigana markers as ruby tags', () => {
    const input = '元気{genki}ですか';
    const html = toFuriganaHtml(input);
    expect(html).toBe('<ruby>元気<rt>genki</rt></ruby>ですか');
  });

  it('handles multiple markers in one string', () => {
    const input = '図書館{toshokan}に行きます{ikimasu}';
    const html = toFuriganaHtml(input);
    expect(html).toBe('<ruby>図書館<rt>toshokan</rt></ruby><ruby>に行きます<rt>ikimasu</rt></ruby>');
  });
});

describe('Translate Tool UI', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <textarea id="translate-input"></textarea>
      <button id="btn-translate-speak"></button>
      <button id="btn-translate-mic"></button>
      <div id="translate-status"></div>
      <div id="translate-result-area" class="hidden"></div>
      <div id="translate-result-text"></div>
    `;
    vi.clearAllMocks();
  });

  it('translates input and shows Japanese result', async () => {
    vi.mocked(translateToJapaneseWithAI).mockResolvedValue({ japanese: '元気ですか？', romaji: 'genki desu ka?' });

    document.getElementById('translate-input').value = 'How are you?';
    await handleTranslateAndSpeak();

    expect(translateToJapaneseWithAI).toHaveBeenCalledWith('How are you?', 'English');
    const resultText = document.getElementById('translate-result-text').textContent;
    expect(resultText).toContain('元気');
    expect(resultText).toContain('genki desu ka?');
    expect(document.getElementById('translate-result-area').classList.contains('hidden')).toBe(false);
  });

  it('shows an error when translation fails', async () => {
    vi.mocked(translateToJapaneseWithAI).mockResolvedValue({ error: 'MISSING_KEY' });

    document.getElementById('translate-input').value = 'Hello';
    await handleTranslateAndSpeak();

    expect(document.getElementById('translate-status').textContent).toContain('No API key');
  });

  it('rejects empty input', async () => {
    await handleTranslateAndSpeak();
    expect(translateToJapaneseWithAI).not.toHaveBeenCalled();
    expect(document.getElementById('translate-status').textContent).toContain('Enter or speak');
  });

  it('replays the last Japanese audio', async () => {
    const { speakQuestion } = await import('../src/tts.js');
    vi.mocked(translateToJapaneseWithAI).mockResolvedValue({ japanese: 'ありがとう' });

    document.getElementById('translate-input').value = 'Thank you';
    await handleTranslateAndSpeak();
    vi.mocked(speakQuestion).mockClear();

    await replayJapaneseAudio();
    expect(speakQuestion).toHaveBeenCalledWith('ありがとう', expect.any(Function));
  });
});

describe('Translate Tool Mic', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <textarea id="translate-input"></textarea>
      <button id="btn-translate-mic"></button>
      <div id="translate-status"></div>
    `;
    vi.clearAllMocks();
  });

  it('uses browser speech recognition when available', async () => {
    class MockSpeechRecognition {
      constructor() {
        this.lang = '';
        this.onstart = null;
        this.onresult = null;
        this.onend = null;
      }
      start() {
        if (this.onstart) this.onstart();
        if (this.onresult) {
          this.onresult({
            results: [{ 0: { transcript: 'Good morning' }, isFinal: true }]
          });
        }
        if (this.onend) this.onend();
      }
      stop() {
        if (this.onend) this.onend();
      }
    }

    window.SpeechRecognition = MockSpeechRecognition;
    window.webkitSpeechRecognition = MockSpeechRecognition;

    await toggleTranslateMic();

    expect(document.getElementById('translate-input').value).toBe('Good morning');
    expect(document.getElementById('btn-translate-mic').classList.contains('recording')).toBe(false);
  });
});
