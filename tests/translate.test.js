import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translateToJapaneseWithAI } from '../src/lib/ai/index.js';
import { toFuriganaHtml } from '../src/lib/parser.js';
import {
  translate, translateAndSpeak, toggleMic, replayJapaneseAudio, closeTranslateTool,
} from '../src/lib/translate.svelte.js';

describe('translateToJapaneseWithAI Unit Tests', () => {
  let realTranslateToJapanese;

  beforeEach(async () => {
    const mod = await vi.importActual('../src/lib/ai/studyAssistant.js');
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

  it('returns the English gloss alongside Japanese and romaji', async () => {
    localStorage.setItem('api_key', 'gsk_test_key');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          japanese: '元気ですか',
          romaji: 'genki desu ka',
          english: 'Are you doing well?'
        }) } }]
      })
    })));

    const result = await realTranslateToJapanese('How are you?');
    expect(result).toEqual({ japanese: '元気ですか', romaji: 'genki desu ka', english: 'Are you doing well?' });
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

vi.mock('../src/lib/ai/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    translateToJapaneseWithAI: vi.fn(),
    transcribeForTool: vi.fn(),
    hasGroqApiKey: vi.fn(() => true),
  };
});

vi.mock('../src/lib/tts.js', () => ({
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

function resetTranslate() {
  translate.open = false;
  translate.input = '';
  translate.sourceLang = 'English';
  translate.status = { message: '', type: '' };
  translate.result = null;
  translate.recording = false;
  translate.speaking = false;
}

describe('Translate tool flow', () => {
  beforeEach(() => {
    resetTranslate();
    vi.clearAllMocks();
  });

  it('translates the input and keeps the result', async () => {
    vi.mocked(translateToJapaneseWithAI).mockResolvedValue({ japanese: '元気ですか？', romaji: 'genki desu ka?' });

    translate.input = 'How are you?';
    await translateAndSpeak();

    expect(translateToJapaneseWithAI).toHaveBeenCalledWith('How are you?', 'English');
    expect(translate.result).toEqual({ japanese: '元気ですか？', romaji: 'genki desu ka?', english: '' });
    expect(translate.status).toEqual({ message: 'Done! Edit the phrase or tap Replay.', type: 'success' });
    expect(translate.speaking).toBe(false);
  });

  it('passes the chosen source language', async () => {
    vi.mocked(translateToJapaneseWithAI).mockResolvedValue({ japanese: 'こんにちは' });

    translate.input = 'Kumusta';
    translate.sourceLang = 'Filipino';
    await translateAndSpeak();

    expect(translateToJapaneseWithAI).toHaveBeenCalledWith('Kumusta', 'Filipino');
  });

  it('speaks the Japanese without furigana markers', async () => {
    const { speakQuestion } = await import('../src/lib/tts.js');
    vi.mocked(translateToJapaneseWithAI).mockResolvedValue({ japanese: '元気{げんき}ですか', romaji: 'genki desu ka' });

    translate.input = 'How are you?';
    await translateAndSpeak();

    expect(speakQuestion).toHaveBeenCalledWith('元気ですか', expect.any(Function), 'tool');
  });

  it('shows an error when translation fails', async () => {
    vi.mocked(translateToJapaneseWithAI).mockResolvedValue({ error: 'MISSING_KEY' });

    translate.input = 'Hello';
    await translateAndSpeak();

    expect(translate.status.message).toContain('No API key');
    expect(translate.status.type).toBe('error');
    expect(translate.speaking).toBe(false);
    expect(translate.result).toBeNull();
  });

  it('rejects empty input', async () => {
    await translateAndSpeak();
    expect(translateToJapaneseWithAI).not.toHaveBeenCalled();
    expect(translate.status.message).toContain('Enter or speak');
  });

  it('replays the last Japanese audio', async () => {
    const { speakQuestion } = await import('../src/lib/tts.js');
    vi.mocked(translateToJapaneseWithAI).mockResolvedValue({ japanese: 'ありがとう' });

    translate.input = 'Thank you';
    await translateAndSpeak();
    vi.mocked(speakQuestion).mockClear();

    await replayJapaneseAudio();
    expect(speakQuestion).toHaveBeenCalledWith('ありがとう', expect.any(Function), 'tool');
  });
});

describe('Translate tool mic', () => {
  /** @type {import('vitest').Mock} */
  let trackStop;

  beforeEach(() => {
    resetTranslate();
    vi.clearAllMocks();
    trackStop = vi.fn();
    // Browser speech recognition is gated behind a mic-permission request.
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: trackStop }] })) },
    });
  });

  it('uses browser speech recognition when available', async () => {
    class MockSpeechRecognition {
      start() {
        this.onstart?.();
        this.onresult?.({ results: [{ 0: { transcript: 'Good morning' }, isFinal: true }] });
        this.onend?.();
      }
      stop() { this.onend?.(); }
    }
    window.SpeechRecognition = MockSpeechRecognition;
    window.webkitSpeechRecognition = MockSpeechRecognition;

    await toggleMic();

    expect(translate.input).toBe('Good morning');
    expect(translate.recording).toBe(false);
    expect(translate.status.message).toContain('Speech captured');
  });

  it('releases the microphone when the user stops listening', async () => {
    class MockSpeechRecognition {
      start() { this.onstart?.(); }
      stop() { this.onend?.(); }
    }
    window.SpeechRecognition = MockSpeechRecognition;

    await toggleMic();
    expect(translate.recording).toBe(true);
    expect(trackStop).not.toHaveBeenCalled();

    await toggleMic();
    expect(translate.recording).toBe(false);
    expect(trackStop).toHaveBeenCalled();
  });

  it('releases the microphone when recognition ends on its own', async () => {
    let instance;
    class MockSpeechRecognition {
      constructor() { instance = this; }
      start() { this.onstart?.(); }
      stop() { this.onend?.(); }
    }
    window.SpeechRecognition = MockSpeechRecognition;

    await toggleMic();
    instance.onend(); // e.g. the browser times out on silence

    expect(translate.recording).toBe(false);
    expect(trackStop).toHaveBeenCalled();
  });

  it('closing the panel stops listening', async () => {
    class MockSpeechRecognition {
      start() { this.onstart?.(); }
      stop() { this.onend?.(); }
    }
    window.SpeechRecognition = MockSpeechRecognition;
    translate.open = true;

    await toggleMic();
    closeTranslateTool();

    expect(translate.open).toBe(false);
    expect(translate.recording).toBe(false);
    expect(trackStop).toHaveBeenCalled();
  });
});
