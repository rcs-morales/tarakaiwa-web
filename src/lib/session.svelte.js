import {
  setStatus, showTranscript, showCheckedTranscript,
  showResult, showResultPanel, showBtn,
  showAnswerTranslation, updateCheckedTranslation,
  showPracticeScreen, showResultsScreen
} from './ui.js';
import {
  getGradingModel, hasAIAccess,
  gradeWithAI, transcribeWithWhisper, isCorrectLocal,
  translateWithAI, getLastGradingErrorReason
} from './ai/index.js';
import { updateQuotaDisplay } from './quota.js';
import { get, set, KEYS } from './settings.js';
import { saveSessionResult } from './sync.js';
import { recordSession } from './history.svelte.js';
import { getIsChecking, setIsChecking } from './sessionFlags.js';
import {
  speakQuestion, speakFeedback, cancelSpeech, preloadVoicevoxAudio,
  startVoicevoxWarmup, VOICEVOX_STOCK_PHRASES, unlockAudioForMobile
} from './tts.js';
import {
  initRecognizer, startListening, abortRecognition,
  startAIRecording, stopAIRecording, getLiveTranscript,
  setLiveTranscript, releaseMic, ensureMicAccess
} from './stt.js';
import { formatLiveTranscript } from './parser.js';

// ─────────────────────────────────────────────
// SESSION STATE — reactive ($state) since Phase 5c
// ─────────────────────────────────────────────
// One reactive object instead of module-level lets, so components (Dashboard,
// Results, Onboarding) render from it directly. The imperative practice flow
// below mutates it exactly as before.
export const session = $state({
  qa: [],
  current: 0,
  score: 0,
  results: [],
  // True only when qa is the built-in starter deck (tutorial mode +
  // sample-deck labeling key off this, not off the shape of the data).
  isDefaultDeck: false,
  // The multi-deck list's active deck id (decks.svelte.js), or null for the
  // built-in Sample deck. Tags recorded sessions so scores can be shown
  // per-deck on the Decks screen.
  activeDeckId: null,
});

export function setQA(newData, { isDefault = false, deckId = null } = {}) {
  session.qa = newData;
  session.isDefaultDeck = isDefault;
  session.activeDeckId = deckId;
}
export function setCurrent(val) {
  session.current = val;
}
export function setScore(val) {
  session.score = val;
}
export function setResults(val) {
  session.results = val;
}

function playSound(type) {
  const sounds = { correct: 'assets/sounds/correct.wav', incorrect: 'assets/sounds/incorrect.wav' };
  const audio = new Audio(sounds[type]);
  audio.play().catch(e => console.warn('Audio playback failed:', e));
}

// ─────────────────────────────────────────────
// PRACTICE LOGIC
// ─────────────────────────────────────────────

export async function startPractice() {
  // Unlock audio playback on mobile browsers immediately during user gesture,
  // BEFORE any await, so TTS works on the first question.
  unlockAudioForMobile();

  if (session.qa.length === 0) {
    alert('Please import a Q&A database before starting practice.');
    return;
  }
  const recognitionSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!recognitionSupported) {
    setStatus('', 'Speech recognition is not available in this browser, but microphone access will still be requested for AI transcription.');
  }
  // Shuffle questions (unless the user turned shuffling off in settings)
  if (get(KEYS.SHUFFLE_QUESTIONS) !== '0') {
    for (let i = session.qa.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [session.qa[i], session.qa[j]] = [session.qa[j], session.qa[i]];
    }
  }
  session.current = 0; session.score = 0; session.results = [];

  try {
    const micReady = await ensureMicAccess();
    if (!micReady) {
      console.warn('Microphone access unavailable during practice startup.');
    }
    if (recognitionSupported && !initRecognizer()) {
      setStatus('', 'SpeechRecognition could not be initialized.');
    }
  } catch (e) {
    console.warn('Microphone access unavailable during practice startup:', e);
    initRecognizer();
  }

  // ── Warm the Voicevox cache in the background ──
  // Practice starts immediately; audio downloads quietly in question order
  // (post-shuffle) plus the stock feedback phrases. Playback fetches on
  // demand if it gets ahead — the >2.5s "Loading Cloud Voice" overlay in
  // tts.js covers that visibly.
  if (get(KEYS.TTS_MODE) === 'voicevox') {
    startVoicevoxWarmup([...session.qa.map(q => q.q), ...VOICEVOX_STOCK_PHRASES]);
  }

  showPracticeScreen();
  loadQuestion();
}

export async function loadQuestion() {
  const item = session.qa[session.current];
  const qText = document.getElementById('question-text');
  qText.textContent = item.q;
  qText.style.display = 'none';
  const toggleBtn = document.getElementById('btn-toggle-question');
  if (toggleBtn) {
    toggleBtn.textContent = '👁 Show Text';
    toggleBtn.classList.remove('highlight-pulse');
  }

  const translateRow = document.getElementById('translate-row');
  const translateResult = document.getElementById('translate-result');
  const translateLink = document.getElementById('btn-translate');
  if (translateRow) translateRow.style.display = 'none';
  if (translateResult) { translateResult.textContent = ''; translateResult.classList.remove('visible'); }
  if (translateLink) { translateLink.textContent = '🌐 Translate'; translateLink.classList.remove('loading'); }

  showAnswerTranslation('');

  const btnNext = document.getElementById('btn-next');
  if (btnNext) btnNext.textContent = 'Next →';

  document.getElementById('result-badge').className = 'result-badge';
  document.getElementById('warning-box').style.display = 'none';
  showTranscript('');
  showBtn('btn-submit',   false);
  showBtn('btn-next',     false);
  showBtn('btn-rerecord', false);
  showBtn('btn-skip',     true);

  const targetBox = document.getElementById('target-answer-box');
  if (targetBox) {
    targetBox.style.display = 'none';
  }

  const pct = (session.current / session.qa.length) * 100;
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-label').textContent =
    'Question ' + (session.current + 1) + ' / ' + session.qa.length;

  cancelSpeech('practice');
  setStatus('speaking', 'Preparing…');
  try {
    const { resetAvatarPose } = await import('./avatar.js');
    resetAvatarPose();
  } catch (error) {
    console.warn('Avatar pose reset unavailable:', error);
  }

  // Voice synthesis check
  const synth = window.speechSynthesis;
  if (synth.getVoices().length === 0) {
    synth.addEventListener('voiceschanged', () => speakThenListen(item), { once: true });
  } else {
    speakThenListen(item);
  }
}

export function toggleQuestionText() {
  const qText = document.getElementById('question-text');
  const btn = document.getElementById('btn-toggle-question');
  const translateRow = document.getElementById('translate-row');
  if (!qText || !btn) return;

  btn.classList.remove('highlight-pulse');

  if (qText.style.display === 'none') {
    qText.style.display = 'block';
    btn.textContent = '👁 Hide Text';
    if (translateRow) translateRow.style.display = 'block';
  } else {
    qText.style.display = 'none';
    btn.textContent = '👁 Show Text';
    if (translateRow) translateRow.style.display = 'none';
  }
}

const translationCache = new Map();

export async function translateQuestion() {
  const item = session.qa[session.current];
  if (!item) return;

  const link = document.getElementById('btn-translate');
  const result = document.getElementById('translate-result');
  if (!link || !result) return;

  if (link.classList.contains('loading')) return;

  if (result.classList.contains('visible')) {
    result.classList.remove('visible');
    link.textContent = '🌐 Translate';
    return;
  }

  if (translationCache.has(item.q)) {
    result.textContent = translationCache.get(item.q);
    result.classList.add('visible');
    link.textContent = '🌐 Hide Translation';
    return;
  }

  if (!hasAIAccess()) {
    const query = encodeURIComponent(item.q);
    const url = `https://translate.google.com/?sl=ja&tl=en&text=${query}&op=translate`;
    result.innerHTML = `⚠️ AI Translation unavailable. <a href="${url}" target="_blank" style="color: var(--teal); text-decoration: underline;">Translate on Google Translate ↗</a>`;
    result.classList.add('visible');
    return;
  }

  link.textContent = '⏳ Translating…';
  link.classList.add('loading');

  const translation = await translateWithAI(item.q);
  link.classList.remove('loading');

  if (translation) {
    translationCache.set(item.q, translation);
    result.textContent = translation;
    result.classList.add('visible');
    link.textContent = '🌐 Hide Translation';
  } else {
    result.textContent = '❌ Translation failed. Check your API key or try again.';
    result.classList.add('visible');
    link.textContent = '🌐 Translate';
  }
}

function speakThenListen(item) {
  speakQuestion(item.q, () => {
    if (session.qa[session.current] !== item) return;
    setStatus('', 'Starting microphone…');
    setTimeout(() => {
      if (session.qa[session.current] !== item) return;
      beginListen();
    }, 800);
  });
}

async function beginListen() {
  const item = session.qa[session.current];
  const targetBox = document.getElementById('target-answer-box');
  if (targetBox) {
    if (session.isDefaultDeck && item.r && session.current < 3 && get(KEYS.TUTORIAL_DONE) !== '1') {
      const label = document.getElementById('target-label');
      if (label) label.textContent = '🎯 Tutorial Mode (' + (session.current + 1) + '/3) Please say the sample answer clearly:';
      document.getElementById('target-answer-text').textContent = item.a;
      document.getElementById('target-romaji-text').textContent = item.r;
      targetBox.style.display = 'block';
    } else if (session.current >= 3 && !hasAIAccess()) {
      const label = document.getElementById('target-label');
      if (label) {
        label.innerHTML = '⚠️ AI Grading Not Configured<br><span style="font-size:0.75rem; font-weight:normal; color:var(--teal);">Showing answer key. Sign in or add a Groq key in settings for flexible answers and feedback!</span>';
      }
      document.getElementById('target-answer-text').textContent = item.a;
      document.getElementById('target-romaji-text').textContent = item.r || '';
      targetBox.style.display = 'block';
    }
  }

  // First-time hints (tutorial box above + Show Text pulse) are one-time:
  // once the third question's hints have been shown, the flag turns them off
  // for all future sessions — on any deck.
  if (session.current < 3 && get(KEYS.TUTORIAL_DONE) !== '1') {
    const toggleBtn = document.getElementById('btn-toggle-question');
    if (toggleBtn) toggleBtn.classList.add('highlight-pulse');
    if (session.current === 2) set(KEYS.TUTORIAL_DONE, '1');
  }

  const sttMode = get(KEYS.STT_MODE) || 'ai';
  const useWhisper = sttMode === 'ai' && hasAIAccess();

  if (useWhisper) {
    const started = await startAIRecording((err) => {
      setStatus('', 'Error: ' + err);
      if (err.includes('permission')) {
        document.getElementById('warning-box').style.display = 'block';
      }
      showBtn('btn-rerecord', true);
      showBtn('btn-skip',     true);
    });

    if (!started) {
      setStatus('listening', '🌐 Browser recognition fallback (AI mic unavailable)');
      try {
        startListening((err) => {
          setStatus('', 'Error: ' + err);
          if (err.includes('permission')) {
            document.getElementById('warning-box').style.display = 'block';
          }
          showBtn('btn-rerecord', true);
          showBtn('btn-skip',     true);
        }, formatLiveTranscript);
      } catch (e) {
        setStatus('', 'Microphone access is blocked by this browser. Please allow microphone access and retry.');
      }
      setTimeout(() => {
        if (!getLiveTranscript()) {
          setStatus('', 'If the mic still does not respond, reopen the page and allow microphone access again.');
        }
      }, 1800);
    }
  } else {
    if (sttMode === 'ai' && !hasAIAccess()) {
      setStatus('listening', '🌐 Browser recognition (sign in or save a Groq key for AI Whisper)');
    }
    startListening((err) => {
      setStatus('', 'Error: ' + err);
      if (err.includes('permission')) {
        document.getElementById('warning-box').style.display = 'block';
      }
      showBtn('btn-rerecord', true);
      showBtn('btn-skip',     true);
    }, formatLiveTranscript);
  }
}

export async function finishRecording() {
  if (getIsChecking()) return;
  setIsChecking(true);

  showBtn('btn-submit', false);
  showBtn('btn-rerecord', false);
  showBtn('btn-skip', false);

  const sttMode = get(KEYS.STT_MODE) || 'ai';
  const item = session.qa[session.current];

  if (sttMode === 'ai' && hasAIAccess()) {
    setStatus('checking', '🤖 Transcribing audio…');
    const ct = document.getElementById('transcript-content');
    if (ct) ct.innerHTML = '<div class="ai-transcribing-indicator">Transcribing<span class="dots"></span></div>';

    const audioBlob = await stopAIRecording();
    if (audioBlob) {
      showTranscript('Transcribing…', true);
      const transcript = await transcribeWithWhisper(audioBlob, item.a);
      if (transcript) {
        setLiveTranscript(transcript);
        showTranscript(transcript, true);
      } else {
        setLiveTranscript('');
        showTranscript('', false);
      }
    }
  } else {
    setStatus('checking', '⌛ Processing transcript…');
    abortRecognition();
    await new Promise(resolve => setTimeout(resolve, 600));
  }

  const raw = getLiveTranscript().trim();

  if (!raw || raw.startsWith('Transcribing')) {
    setStatus('', 'Transcription failed or no speech captured — try re-recording.');
    showBtn('btn-rerecord', true);
    showBtn('btn-skip',     true);
    setIsChecking(false);
    return;
  }

  setStatus('', 'Transcript ready. Review it, then click Check Answer.');
  showBtn('btn-check', true);
  showBtn('btn-rerecord', true);
  showBtn('btn-skip', true);
  setIsChecking(false);

  // A Whisper request consumed shared quota — keep the start-screen chip fresh.
  updateQuotaDisplay();
}

export async function checkAnswer() {
  if (getIsChecking()) return;
  setIsChecking(true);

  showBtn('btn-check', false);
  showBtn('btn-rerecord', false);
  showBtn('btn-skip', false);

  const item = session.qa[session.current];
  const raw = getLiveTranscript().trim();

  const level = get(KEYS.JLPT_LEVEL) || 'N5';
  const furiganaReading = await import('./parser.js').then(m =>
    level === 'N5' ? m.transcriptToFurigana(raw) : m.transcriptToFuriganaForGrading(raw, item.a)
  );
  showCheckedTranscript(raw, furiganaReading, formatLiveTranscript);

  setStatus('checking', '🤖 AI is checking your answer…');

  let gradeResult = await gradeWithAI(item.q, item.a, raw);
  if (!gradeResult) {
    const rateLimited = getLastGradingErrorReason() === 'RATE_LIMIT';
    setStatus('checking', rateLimited
      ? '⚠️ Shared daily quota reached — using local grading. Add your own Groq key in settings to continue.'
      : '⚙️ AI unavailable — using local grading…');
    gradeResult = await isCorrectLocal(raw, item.a, item.q);
  }

  if (gradeResult.correct) { session.score++; playSound("correct"); } else { playSound("incorrect"); }
  const feedbackText = gradeResult.correct ? '正解です！' : '不正解です。';
  session.results.push({
    q: item.q, a: item.a, transcript: raw, furigana: furiganaReading,
    correct: gradeResult.correct, gradeResult: gradeResult
  });

  showResultPanel(false);

  showResult(gradeResult, item.a);
  showResultPanel(true);

  if (hasAIAccess()) {
    updateCheckedTranslation('user-ans-trans', 'Translating your answer...');
    updateCheckedTranslation('expected-ans-trans', 'Translating expected answer...');
    
    (async () => {
      let userTrans = null;
      try {
        userTrans = await translateWithAI(raw, item.q);
      } catch (e) {}
      
      if (userTrans) {
        updateCheckedTranslation('user-ans-trans', 'You said: ' + userTrans);
      } else {
        const query = encodeURIComponent(raw);
        const url = `https://translate.google.com/?sl=ja&tl=en&text=${query}&op=translate`;
        updateCheckedTranslation('user-ans-trans', `⚠️ AI Translation failed. <a href="${url}" target="_blank" style="color: var(--teal); text-decoration: underline;">Translate on Google ↗</a>`);
      }
      
      let expTrans = null;
      try {
        expTrans = await translateWithAI(item.a, item.q);
      } catch (e) {}
      
      if (expTrans) {
        updateCheckedTranslation('expected-ans-trans', expTrans);
      } else {
        const expectedUrl = `https://translate.google.com/?sl=ja&tl=en&text=${encodeURIComponent(item.a)}&op=translate`;
        updateCheckedTranslation('expected-ans-trans', `⚠️ AI Translation failed. <a href="${expectedUrl}" target="_blank" style="color: var(--teal); text-decoration: underline;">Translate on Google ↗</a>`);
      }
    })();
  } else {
    const query = encodeURIComponent(raw);
    const url = `https://translate.google.com/?sl=ja&tl=en&text=${query}&op=translate`;
    updateCheckedTranslation('user-ans-trans', `🌐 <a href="${url}" target="_blank" style="color: var(--teal); text-decoration: underline;">Translate what you said on Google Translate ↗</a>`);
    
    const expectedUrl = `https://translate.google.com/?sl=ja&tl=en&text=${encodeURIComponent(item.a)}&op=translate`;
    updateCheckedTranslation('expected-ans-trans', `🌐 <a href="${expectedUrl}" target="_blank" style="color: var(--teal); text-decoration: underline;">Translate expected answer on Google Translate ↗</a>`);
  }

  cancelSpeech('practice');
  setStatus('checking', '🔊 Speaking result feedback…');
  speakFeedback(feedbackText, () => {
    setStatus('', gradeResult.correct ? 'Correct! 🎉' : 'Incorrect. Review the feedback.');
  });

  const btnNext = document.getElementById('btn-next');
  if (btnNext) {
    showBtn('btn-next', true);
    if (session.current === session.qa.length - 1) {
      btnNext.textContent = 'Finish Practice';
    }
  }
  showBtn('btn-rerecord', false);
  showBtn('btn-check',    false);
  showBtn('btn-skip',     false);
  setIsChecking(false);

  // A grading request consumed shared quota — keep the start-screen chip fresh.
  updateQuotaDisplay();
}

export async function rerecordAnswer() {
  const item = session.qa[session.current];
  await ensureMicAccess();
  abortRecognition();
  setLiveTranscript('');
  document.getElementById('result-badge').className = 'result-badge';
  showTranscript('');
  showBtn('btn-next',     false);
  showBtn('btn-rerecord', false);
  showBtn('btn-submit',   false);
  showBtn('btn-check',    false);
  speakThenListen(item);
}

export async function nextQuestion() {
  cancelSpeech('practice');
  await ensureMicAccess();
  abortRecognition();
  if (session.current === session.qa.length - 1) {
    handleFinishPractice();
    return;
  }
  session.current++;
  loadQuestion();
}

export async function skipQuestion() {
  cancelSpeech('practice');
  await ensureMicAccess();
  abortRecognition();
  session.results.push({ q: session.qa[session.current].q, a: session.qa[session.current].a, transcript: '(skipped)', correct: false });
  if (session.current === session.qa.length - 1) {
    handleFinishPractice();
    return;
  }
  session.current++;
  loadQuestion();
}

export function endSession() {
  cancelSpeech('practice');
  abortRecognition();
  releaseMic();
  while (session.results.length < session.qa.length) {
    const i = session.results.length;
    session.results.push({ q: session.qa[i].q, a: session.qa[i].a, transcript: '(not reached)', correct: false });
  }
  showResults(undefined, { skipProgression: true });
}

async function handleFinishPractice() {
  setStatus('checking', 'Calculating overall score…');

  const responses = {
    pass: [
      { jp: 'おめでとう！', en: 'Congratulations!' },
      { jp: 'すごい！', en: 'Amazing!' },
      { jp: '完璧です！', en: 'Perfect!' },
      { jp: 'やったね！', en: 'You did it!' },
      { jp: '素晴らしい！', en: 'Wonderful!' }
    ],
    fail: [
      { jp: 'あともう少し！', en: 'Just a little more!' },
      { jp: '諦めないで！', en: 'Don\'t give up!' },
      { jp: 'ゆっくり頑張ろう！', en: 'Let\'s take it slow and keep trying!' },
      { jp: '次はきっとできる！', en: 'You\'ll definitely get it next time!' }
    ]
  };

  const total = session.results.length;
  const scoreVal = session.score;
  const pct = total ? Math.round((scoreVal / total) * 100) : 0;
  const passed = pct >= 75;
  const choice = responses[passed ? 'pass' : 'fail'][Math.floor(Math.random() * (passed ? responses.pass.length : responses.fail.length))];

  if (get(KEYS.TTS_MODE) === 'voicevox') {
    await preloadVoicevoxAudio(choice.jp);
  }

  showResults(choice, { skipProgression: false });
}

async function showResults(choice, { skipProgression = false } = {}) {
  const synth = window.speechSynthesis;
  if (synth.speaking) synth.cancel();

  // The score hero and per-question list render reactively from session
  // state in Results.svelte — this only reveals the screen + overlay.
  showResultsScreen();

  const total = session.results.length;
  const pct   = total ? Math.round((session.score / total) * 100) : 0;

  showFinalOverlay(pct, choice);

  // Only persist when the session was completed naturally (all questions
  // answered / skipped). Manually ended sessions ("End" button) pass
  // skipProgression=true so they don't inflate recent sessions, XP,
  // daily goals, avg score, or the cloud session_results table.
  if (!skipProgression) {
    const deckId = session.isDefaultDeck ? null : session.activeDeckId;
    recordSession({ score: session.score, total, jlpt: get(KEYS.JLPT_LEVEL), deckId });
    saveSessionResult({
      jlpt_level: get(KEYS.JLPT_LEVEL),
      score: session.score,
      total,
      results: session.results,
      deckId,
    });
  }
}

async function showFinalOverlay(pct, choice) {
  const overlay = document.getElementById('final-score-overlay');
  const icon = document.getElementById('final-score-icon');
  const text = document.getElementById('final-score-text');

  if (overlay && icon && text) {
    const passed = pct >= 75;
    icon.textContent = passed ? '🎉' : '💪';

    const choiceEn = choice?.en || (passed ? 'Great job!' : 'Keep practicing!');
    text.innerHTML = `<div style="font-size: 1.5rem; font-weight: bold; margin-bottom: 4px;">${session.score} / ${session.qa.length}</div>
                     <div style="font-size: 1.1rem; color: var(--muted);">${choiceEn}</div>`;

    overlay.style.display = '';
    overlay.classList.remove('hidden');
    overlay.style.opacity = '1';

    const choiceJp = choice?.jp || '';
    if (choiceJp) {
      speakFeedback(choiceJp, () => {
        setTimeout(() => {
          overlay.style.opacity = '0';
          setTimeout(() => {
            overlay.classList.add('hidden');
          }, 1000);
        }, 2000);
      }, true);
    } else {
      // Ensure overlay disappears even if no audio is played
      setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => {
          overlay.classList.add('hidden');
        }, 1000);
      }, 3000);
    }
  }
}
