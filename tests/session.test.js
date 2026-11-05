import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  session, setQA, setCurrent, setScore, setResults,
  startPractice, checkAnswer, nextQuestion, skipQuestion, endSession,
  toggleQuestionText, translateQuestion, getQuestionRomaji, revealAnswerHint,
  editTranscript, saveEditedTranscript, cancelEditTranscript,
} from '../src/lib/session.svelte.js';
import { practiceView, resetQuestionCard, resetAnswerCard } from '../src/lib/practiceView.svelte.js';
import * as ui from '../src/lib/ui.js';
import * as ai from '../src/lib/ai/index.js';
import * as settings from '../src/lib/settings.js';
import * as flags from '../src/lib/sessionFlags.js';
import * as tts from '../src/lib/tts.js';
import * as stt from '../src/lib/stt.js';
import { finalOverlay, closeFinalOverlay } from '../src/lib/finalOverlay.svelte.js';

vi.mock('../src/lib/ui.js', () => ({
  setStatus: vi.fn(),
  showTranscript: vi.fn(),
  showTranscriptIndicator: vi.fn(),
  showCheckedTranscript: vi.fn(),
  showResult: vi.fn(),
  showResultPanel: vi.fn(),
  showBtn: vi.fn(),
  showPracticeScreen: vi.fn(),
  showResultsScreen: vi.fn(),
  showStartScreen: vi.fn(),
  showMicWarning: vi.fn(),
  showVoicevoxPreloadModal: vi.fn().mockResolvedValue('skipped'),
  updateVoicevoxPreloadProgress: vi.fn(),
  hideVoicevoxPreloadModal: vi.fn(),
}));

vi.mock('../src/lib/ai/index.js', () => ({
  getGradingModel: vi.fn(),
  hasAIAccess: vi.fn().mockReturnValue(true),
  getGroqApiKey: vi.fn().mockReturnValue('gsk_test'),
  gradeWithAI: vi.fn(),
  transcribeWithWhisper: vi.fn(),
  isCorrectLocal: vi.fn(),
  translateWithAI: vi.fn().mockResolvedValue('Translated text'),
  getRomajiWithAI: vi.fn().mockResolvedValue('romaji'),
  getLastGradingErrorReason: vi.fn().mockReturnValue(null),
  getLastWhisperErrorReason: vi.fn().mockReturnValue(null),
  getLastTranslationErrorReason: vi.fn().mockReturnValue(null),
}));

vi.mock('../src/lib/settings.js', () => ({
  get: vi.fn(),
  set: vi.fn(),
  KEYS: {
    TTS_MODE: 'tts_mode',
    STT_MODE: 'stt_mode',
    JLPT_LEVEL: 'jlpt_level'
  }
}));

vi.mock('../src/lib/sessionFlags.js', () => ({
  getIsChecking: vi.fn().mockReturnValue(false),
  setIsChecking: vi.fn(),
}));

vi.mock('../src/lib/tts.js', () => ({
  speakQuestion: vi.fn((text, onEnd) => onEnd && onEnd()),
  speakFeedback: vi.fn((text, onEnd) => onEnd && onEnd()),
  cancelSpeech: vi.fn(),
  preloadVoicevoxAudio: vi.fn(),
  preloadAllVoicevoxAudio: vi.fn().mockResolvedValue(undefined),
  startVoicevoxWarmup: vi.fn(),
  // Fully cached by default so existing tests exercise the direct-warmup
  // path unchanged; tests targeting the confirmation prompt override this.
  getVoicePackStatus: vi.fn().mockImplementation((texts) => Promise.resolve({ cached: texts.length, total: texts.length })),
  VOICEVOX_STOCK_PHRASES: [],
  unlockAudioForMobile: vi.fn(),
}));

vi.mock('../src/lib/voicePackPrompt.svelte.js', () => ({
  requestVoicePackConfirmation: vi.fn().mockResolvedValue(true),
}));

vi.mock('../src/lib/stt.js', () => ({
  initRecognizer: vi.fn().mockReturnValue(true),
  startListening: vi.fn(),
  abortRecognition: vi.fn(),
  startAIRecording: vi.fn(),
  stopAIRecording: vi.fn().mockResolvedValue(new Blob(['test'], { type: 'audio/webm' })),
  getLiveTranscript: vi.fn().mockReturnValue('こんにちは'),
  setLiveTranscript: vi.fn(),
  releaseMic: vi.fn(),
  ensureMicAccess: vi.fn().mockResolvedValue(true),
}));

describe('Session Flow Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = `
      <div id="result-badge"></div>
      <div id="score-display"></div>
      <div id="score-bar"></div>
      <div id="score-message"></div>
      <div id="results-list"></div>
    `;

    vi.stubGlobal('window', {
      SpeechRecognition: vi.fn(),
      webkitSpeechRecognition: vi.fn(),
      speechSynthesis: {
        speaking: false,
        cancel: vi.fn(),
        getVoices: vi.fn().mockReturnValue([{}])
      }
    });

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({})
      }
    });

    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();

    setQA([
      { q: 'Question 1', a: 'Answer 1', r: 'Answer 1 Romaji' },
      { q: 'Question 2', a: 'Answer 2', r: 'Answer 2 Romaji' }
    ]);
  });

  it('should start practice and load the first question', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999); // Disable shuffle
    settings.get.mockReturnValue('browser');
    await startPractice();

    expect(ui.showPracticeScreen).toHaveBeenCalled();
    expect(session.qa[session.current].q).toBe('Question 1'); // Practice.svelte renders it
    expect(practiceView.question.textVisible).toBe(false);
    expect(session.current).toBe(0); // Practice.svelte renders "Question 1 / 2" from this
    expect(ui.showMicWarning).toHaveBeenCalledWith(false);
  });

  it('requests microphone access before Voicevox preloading in practice startup', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    settings.get.mockImplementation((key) => key === 'tts_mode' ? 'voicevox' : 'browser');

    const order = [];
    stt.ensureMicAccess.mockImplementation(async () => {
      order.push('mic');
      return true;
    });
    // Startup warms the Voicevox cache in the background via startVoicevoxWarmup
    // (formerly preloadAllVoicevoxAudio); it must run after mic access is requested.
    tts.startVoicevoxWarmup.mockImplementation(() => {
      order.push('preload');
    });

    await startPractice();

    expect(order).toContain('mic');
    expect(order).toContain('preload');
    expect(order.indexOf('mic')).toBeLessThan(order.indexOf('preload'));
  });

  it('still requests microphone access when speech recognition is unavailable', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;
    vi.stubGlobal('alert', vi.fn());

    await startPractice();

    expect(stt.ensureMicAccess).toHaveBeenCalled();
  });

  it('should correctly track score and results during checkAnswer', async () => {
    setQA([{ q: 'Q1', a: 'A1', r: 'R1' }]);
    setCurrent(0);
    setScore(0);
    setResults([]);

    ai.gradeWithAI.mockResolvedValue({
      correct: true,
      score: 100,
      general_feedback: 'Perfect!',
      suggested_answer: 'A1',
      breakdown: [],
      source: 'groq'
    });

    await checkAnswer();

    expect(session.score).toBe(1);
    expect(session.results.length).toBe(1);
    expect(session.results[0].correct).toBe(true);
    expect(ui.showResult).toHaveBeenCalled();
  });

  it('passes the active deck level to gradeWithAI and records it on finish', async () => {
    setQA([{ q: 'Q1', a: 'A1', r: 'R1' }], { isDefault: false, deckId: 'deck-1', jlptLevel: 'N4' });
    setCurrent(0);
    setScore(0);
    setResults([]);

    ai.gradeWithAI.mockResolvedValue({
      correct: true,
      score: 100,
      general_feedback: 'Perfect!',
      suggested_answer: 'A1',
      breakdown: [],
      source: 'groq'
    });

    await checkAnswer();

    expect(ai.gradeWithAI).toHaveBeenCalledWith('Q1', 'A1', expect.any(String), 'N4');
  });

  it('should progress to next question and finish when reaching the end', async () => {
    setQA([{ q: 'Q1', a: 'A1', r: 'R1' }]);
    setCurrent(0);

    await nextQuestion();
    await Promise.resolve();

    // Since current was 0 and length was 1, it should have called handleFinishPractice
    expect(ui.showResultsScreen).toHaveBeenCalled();
  });

  it('shows the Session Complete overlay with the score when a session ends', async () => {
    closeFinalOverlay();
    setQA([{ q: 'Q1', a: 'A1', r: 'R1' }, { q: 'Q2', a: 'A2', r: 'R2' }]);
    setCurrent(1);
    setScore(2);
    setResults([
      { q: 'Q1', a: 'A1', transcript: 'A1', correct: true },
      { q: 'Q2', a: 'A2', transcript: 'A2', correct: true },
    ]);

    await nextQuestion();
    await vi.waitFor(() => expect(finalOverlay.visible).toBe(true));

    expect(finalOverlay.score).toBe(2);
    expect(finalOverlay.total).toBe(2);
    expect(finalOverlay.passed).toBe(true);
    expect(finalOverlay.message).not.toBe('');
    closeFinalOverlay();
  });

  it('should handle skipping questions correctly', async () => {
    setQA([{ q: 'Q1', a: 'A1', r: 'R1' }, { q: 'Q2', a: 'A2', r: 'R2' }]);
    setCurrent(0);
    setResults([]);

    await skipQuestion();

    expect(session.current).toBe(1);
    expect(session.results[0].transcript).toBe('(skipped)');
    expect(session.results[0].correct).toBe(false);
  });

  it('should properly end the session and fill missing results', () => {
    setQA([
      { q: 'Q1', a: 'A1', r: 'R1' },
      { q: 'Q2', a: 'A2', r: 'R2' },
      { q: 'Q3', a: 'A3', r: 'R3' }
    ]);
    setCurrent(1);
    setResults([
      { q: 'Q1', a: 'A1', transcript: 'A1', correct: true }
    ]);

    endSession();

    expect(session.results.length).toBe(3);
    expect(session.results[1].transcript).toBe('(not reached)');
    expect(session.results[2].transcript).toBe('(not reached)');
    expect(ui.showResultsScreen).toHaveBeenCalled();
  });

  it('setQA defaults jlptLevel to N5 when not provided', () => {
    setQA([{ q: 'Q1', a: 'A1' }]);
    expect(session.jlptLevel).toBe('N5');
  });
});

describe('Question card', () => {
  const QA = [{ q: 'Q1', a: 'A1' }, { q: 'Q2', a: 'A2', r: 'a ni' }];

  beforeEach(() => {
    vi.clearAllMocks();
    setQA(QA.map((x) => ({ ...x })));
    setCurrent(0);
    resetQuestionCard();
    ai.hasAIAccess.mockReturnValue(true);
    ai.getLastTranslationErrorReason.mockReturnValue(null);
    settings.get.mockReturnValue(null);
  });

  /** Move to the next question the way loadQuestion does for the card. */
  function moveOn() {
    setCurrent(1);
    resetQuestionCard();
  }

  it('Show Text toggles the text and stops the first-time pulse', () => {
    practiceView.question.pulse = true;
    toggleQuestionText();
    expect(practiceView.question.textVisible).toBe(true);
    expect(practiceView.question.pulse).toBe(false);
    toggleQuestionText();
    expect(practiceView.question.textVisible).toBe(false);
  });

  it('translates the question, toggles it, and reuses the cached result', async () => {
    ai.translateWithAI.mockResolvedValue('What is your name?');
    setQA([{ q: 'お名前は？', a: 'A' }]);

    await translateQuestion();
    expect(practiceView.question.translate).toMatchObject({ open: true, ok: true, loading: false, text: 'What is your name?' });

    await translateQuestion(); // tap again hides it
    expect(practiceView.question.translate.open).toBe(false);

    await translateQuestion(); // cached — no second request
    expect(practiceView.question.translate.open).toBe(true);
    expect(ai.translateWithAI).toHaveBeenCalledTimes(1);
  });

  it('offers a Google Translate link without AI access', async () => {
    ai.hasAIAccess.mockReturnValue(false);
    setQA([{ q: 'お元気ですか', a: 'A' }]);
    await translateQuestion();
    const tr = practiceView.question.translate;
    expect(tr).toMatchObject({ open: true, ok: false });
    expect(tr.fallbackUrl).toBe('https://translate.google.com/?sl=ja&tl=en&text=' + encodeURIComponent('お元気ですか') + '&op=translate');
    expect(ai.translateWithAI).not.toHaveBeenCalled();
  });

  it('explains why a translation failed', async () => {
    ai.translateWithAI.mockResolvedValue(null);
    ai.getLastTranslationErrorReason.mockReturnValue('RATE_LIMIT');
    setQA([{ q: 'Q-fail', a: 'A' }]);
    await translateQuestion();
    expect(practiceView.question.translate).toMatchObject({ open: true, ok: false });
    expect(practiceView.question.translate.text).toContain('Shared daily quota reached');
  });

  it('drops a translation that arrives after moving to the next question', async () => {
    let resolve;
    ai.translateWithAI.mockImplementation(() => new Promise((r) => { resolve = r; }));
    setQA([{ q: 'Q-slow-1', a: 'A1' }, { q: 'Q-slow-2', a: 'A2' }]);

    const pending = translateQuestion();
    expect(practiceView.question.translate.loading).toBe(true);
    moveOn();
    resolve('Translation of question 1');
    await pending;

    expect(practiceView.question.translate).toMatchObject({ open: false, loading: false, text: '' });
  });

  it('gets romaji, and drops a late romaji after moving on', async () => {
    ai.getRomajiWithAI.mockResolvedValueOnce('onamae wa');
    setQA([{ q: 'Q-r1', a: 'A1' }, { q: 'Q-r2', a: 'A2' }]);
    await getQuestionRomaji();
    expect(practiceView.question.romaji).toMatchObject({ open: true, ok: true, text: 'onamae wa' });

    resetQuestionCard();
    setQA([{ q: 'Q-r3', a: 'A1' }, { q: 'Q-r4', a: 'A2' }]);
    let resolve;
    ai.getRomajiWithAI.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const pending = getQuestionRomaji();
    moveOn();
    resolve('late romaji');
    await pending;
    expect(practiceView.question.romaji).toMatchObject({ open: false, text: '' });
  });

  it('reveals the answer with the deck romaji and an AI translation', async () => {
    setCurrent(1); // Q2 has stored romaji
    ai.translateWithAI.mockResolvedValue('Answer two');
    revealAnswerHint();
    const t = practiceView.question.target;
    expect(t).toMatchObject({ visible: true, kind: 'hint', answer: 'A2', romaji: 'a ni', translation: 'Translating…' });
    await vi.waitFor(() => expect(t.translation).toBe('Answer two'));
    expect(ui.showBtn).toHaveBeenCalledWith('btn-hint-prompt', false);
  });

  it('does not let a late hint translation land on the next question', async () => {
    let resolve;
    ai.translateWithAI.mockImplementation(() => new Promise((r) => { resolve = r; }));
    revealAnswerHint(); // Q1
    const old = practiceView.question.target;
    moveOn();
    resolve('Answer one');
    await Promise.resolve();
    await Promise.resolve();
    expect(practiceView.question.target.translation).toBe('');
    expect(old.translation).toBe('Translating…');
  });
});

describe('Answer card (transcript + result)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setQA([{ q: 'Q1', a: 'A1' }, { q: 'Q2', a: 'A2' }]);
    setCurrent(0);
    setResults([]);
    resetAnswerCard();
    flags.getIsChecking.mockReturnValue(false);
    ai.hasAIAccess.mockReturnValue(true);
    ai.getLastTranslationErrorReason.mockReturnValue(null);
    ai.gradeWithAI.mockResolvedValue({ correct: true, score: 100, general_feedback: 'ok', source: 'groq' });
    settings.get.mockReturnValue(null);
    stt.getLiveTranscript.mockReturnValue('A1');
  });

  it('edits the transcript: Save uses the edited text', () => {
    stt.getLiveTranscript.mockReturnValue('えーわん');
    editTranscript();
    expect(practiceView.answer.transcript).toMatchObject({ mode: 'editing', editText: 'えーわん' });
    expect(ui.showBtn).toHaveBeenCalledWith('btn-save-edit', true);

    practiceView.answer.transcript.editText = '  A1  ';
    saveEditedTranscript();
    expect(stt.setLiveTranscript).toHaveBeenCalledWith('A1');
    expect(ui.showTranscript).toHaveBeenCalledWith('A1', true);
  });

  it('edits the transcript: an empty edit is refused, Cancel keeps the original', () => {
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);
    stt.getLiveTranscript.mockReturnValue('original');
    editTranscript();
    practiceView.answer.transcript.editText = '   ';
    saveEditedTranscript();
    expect(alert).toHaveBeenCalled();
    expect(stt.setLiveTranscript).not.toHaveBeenCalled();

    cancelEditTranscript();
    expect(ui.showTranscript).toHaveBeenCalledWith('original', true);
    vi.unstubAllGlobals();
  });

  it('fills the translation lines after Check Answer', async () => {
    ai.translateWithAI.mockImplementation(async (text) => (text === 'A1' ? 'Answer one' : 'You said one'));
    stt.getLiveTranscript.mockReturnValue('heard');
    await checkAnswer();
    await vi.waitFor(() => expect(practiceView.answer.result.expTrans.text).toBe('Answer one'));
    expect(practiceView.answer.transcript.checked.userTrans.text).toBe('You said: You said one');
  });

  it('offers Google Translate links without AI access', async () => {
    ai.hasAIAccess.mockReturnValue(false);
    ai.isCorrectLocal.mockResolvedValue({ correct: false, source: 'local', feedback: 'no', hints: [] });
    ai.gradeWithAI.mockResolvedValue(null);
    stt.getLiveTranscript.mockReturnValue('こんにちは');
    await checkAnswer();
    const user = practiceView.answer.transcript.checked.userTrans;
    expect(user.linkText).toBe('Translate what you said on Google Translate ↗');
    expect(user.linkUrl).toContain(encodeURIComponent('こんにちは'));
    expect(practiceView.answer.result.expTrans.linkText).toBe('Translate expected answer on Google Translate ↗');
  });

  it('drops translations that arrive after moving to the next question', async () => {
    let resolveUser;
    ai.translateWithAI.mockImplementation(() => new Promise((r) => { resolveUser = r; }));
    await checkAnswer();
    const oldCard = practiceView.answer;
    // learner moves on: loadQuestion resets the card for Q2
    setCurrent(1);
    resetAnswerCard();
    resolveUser('late translation');
    await Promise.resolve(); await Promise.resolve();
    expect(practiceView.answer.transcript.checked.userTrans.text).toBe('');
    expect(oldCard.transcript.checked.userTrans.text).toBe('Translating your answer...');
  });
});
