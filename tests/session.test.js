import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as session from '../src/session.js';
import * as ui from '../src/ui.js';
import * as ai from '../src/ai/index.js';
import * as settings from '../src/settings.js';
import * as flags from '../src/sessionFlags.js';
import * as tts from '../src/tts.js';
import * as stt from '../src/stt.js';

vi.mock('../src/ui.js', () => ({
  setStatus: vi.fn(),
  showTranscript: vi.fn(),
  showCheckedTranscript: vi.fn(),
  showResult: vi.fn(),
  showResultPanel: vi.fn(),
  showBtn: vi.fn(),
  updateQACount: vi.fn(),
  updateStartButton: vi.fn(),
  showAnswerTranslation: vi.fn(),
  updateCheckedTranslation: vi.fn(),
  showPracticeScreen: vi.fn(),
  showResultsScreen: vi.fn(),
  showVoicevoxPreloadModal: vi.fn().mockResolvedValue('skipped'),
  updateVoicevoxPreloadProgress: vi.fn(),
  hideVoicevoxPreloadModal: vi.fn(),
}));

vi.mock('../src/ai/index.js', () => ({
  getGradingModel: vi.fn(),
  hasGroqApiKey: vi.fn().mockReturnValue(true),
  getGroqApiKey: vi.fn().mockReturnValue('gsk_test'),
  gradeWithAI: vi.fn(),
  transcribeWithWhisper: vi.fn(),
  isCorrectLocal: vi.fn(),
  translateWithAI: vi.fn().mockResolvedValue('Translated text'),
}));

vi.mock('../src/settings.js', () => ({
  get: vi.fn(),
  set: vi.fn(),
  KEYS: {
    TTS_MODE: 'tts_mode',
    STT_MODE: 'stt_mode',
    JLPT_LEVEL: 'jlpt_level'
  }
}));

vi.mock('../src/sessionFlags.js', () => ({
  getIsChecking: vi.fn().mockReturnValue(false),
  setIsChecking: vi.fn(),
}));

vi.mock('../src/tts.js', () => ({
  speakQuestion: vi.fn((text, onEnd) => onEnd && onEnd()),
  speakFeedback: vi.fn((text, onEnd) => onEnd && onEnd()),
  cancelCurrentSpeech: vi.fn(),
  preloadVoicevoxAudio: vi.fn(),
  preloadAllVoicevoxAudio: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/stt.js', () => ({
  initRecognizer: vi.fn().mockReturnValue(true),
  startListening: vi.fn(),
  abortRecognition: vi.fn(),
  startAIRecording: vi.fn(),
  stopAIRecording: vi.fn().mockResolvedValue(new Blob(['test'], { type: 'audio/webm' })),
  getLiveTranscript: vi.fn().mockReturnValue('こんにちは'),
  setLiveTranscript: vi.fn(),
  releaseMic: vi.fn(),
  setMicStream: vi.fn(),
}));

describe('Session Flow Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = `
      <div id="question-text"></div>
      <button id="btn-toggle-question"></button>
      <div id="translate-row"></div>
      <div id="translate-result"></div>
      <button id="btn-translate"></button>
      <button id="btn-next"></button>
      <div id="result-badge"></div>
      <div id="warning-box"></div>
      <div id="target-answer-box">
        <div id="target-label"></div>
        <div id="target-answer-text"></div>
        <div id="target-romaji-text"></div>
      </div>
      <div id="progress-bar"></div>
      <div id="progress-label"></div>
      <div id="score-display"></div>
      <div id="score-bar"></div>
      <div id="score-message"></div>
      <div id="final-score-overlay" class="hidden">
        <div id="final-score-icon"></div>
        <div id="final-score-text"></div>
      </div>
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

    session.setQA([
      { q: 'Question 1', a: 'Answer 1', r: 'Answer 1 Romaji' },
      { q: 'Question 2', a: 'Answer 2', r: 'Answer 2 Romaji' }
    ]);
  });

  it('should start practice and load the first question', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999); // Disable shuffle
    settings.get.mockReturnValue('browser');
    await session.startPractice();

    expect(ui.showPracticeScreen).toHaveBeenCalled();
    expect(document.getElementById('question-text').textContent).toBe('Question 1');
    expect(document.getElementById('progress-label').textContent).toBe('Question 1 / 2');
  });

  it('should correctly track score and results during checkAnswer', async () => {
    session.setQA([{ q: 'Q1', a: 'A1', r: 'R1' }]);
    session.setCurrent(0);
    session.setScore(0);
    session.setResults([]);

    ai.gradeWithAI.mockResolvedValue({
      correct: true,
      score: 100,
      general_feedback: 'Perfect!',
      suggested_answer: 'A1',
      breakdown: [],
      source: 'groq'
    });

    await session.checkAnswer();

    expect(session.score).toBe(1);
    expect(session.results.length).toBe(1);
    expect(session.results[0].correct).toBe(true);
    expect(ui.showResult).toHaveBeenCalled();
  });

  it('should progress to next question and finish when reaching the end', async () => {
    session.setQA([{ q: 'Q1', a: 'A1', r: 'R1' }]);
    session.setCurrent(0);

    session.nextQuestion();

    // Since current was 0 and length was 1, it should have called handleFinishPractice
    expect(ui.showResultsScreen).toHaveBeenCalled();
  });

  it('should handle skipping questions correctly', () => {
    session.setQA([{ q: 'Q1', a: 'A1', r: 'R1' }, { q: 'Q2', a: 'A2', r: 'R2' }]);
    session.setCurrent(0);
    session.setResults([]);

    session.skipQuestion();

    expect(session.current).toBe(1);
    expect(session.results[0].transcript).toBe('(skipped)');
    expect(session.results[0].correct).toBe(false);
  });

  it('should properly end the session and fill missing results', () => {
    session.setQA([
      { q: 'Q1', a: 'A1', r: 'R1' },
      { q: 'Q2', a: 'A2', r: 'R2' },
      { q: 'Q3', a: 'A3', r: 'R3' }
    ]);
    session.setCurrent(1);
    session.setResults([
      { q: 'Q1', a: 'A1', transcript: 'A1', correct: true }
    ]);

    session.endSession();

    expect(session.results.length).toBe(3);
    expect(session.results[1].transcript).toBe('(not reached)');
    expect(session.results[2].transcript).toBe('(not reached)');
    expect(ui.showResultsScreen).toHaveBeenCalled();
  });
});
