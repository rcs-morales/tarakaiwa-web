import {
  setStatus, showTranscript, showCheckedTranscript,
  showResult, showResultPanel, showBtn, showMicWarning,
  showAnswerTranslation, updateCheckedTranslation,
  showPracticeScreen, showResultsScreen, showStartScreen
} from './ui.js';
import {
  getGradingModel, hasAIAccess,
  gradeWithAI, transcribeWithWhisper, isCorrectLocal,
  translateWithAI, getRomajiWithAI, getLastGradingErrorReason, getLastWhisperErrorReason,
  getLastTranslationErrorReason
} from './ai/index.js';
import { updateQuotaDisplay } from './quota.svelte.js';
import { get, set, KEYS } from './settings.js';
import { saveSessionResult } from './sync.js';
import { recordSession } from './history.svelte.js';
import { getIsChecking, setIsChecking } from './sessionFlags.js';
import {
  speakQuestion, speakFeedback, cancelSpeech, preloadVoicevoxAudio,
  startVoicevoxWarmup, VOICEVOX_STOCK_PHRASES, unlockAudioForMobile, getVoicePackStatus
} from './tts.js';
import { requestVoicePackConfirmation } from './voicePackPrompt.svelte.js';
import { openFinalOverlay, scheduleFinalOverlayFade } from './finalOverlay.svelte.js';
import { assistantHistory } from './assistant.svelte.js';
import { practiceView, resetQuestionCard } from './practiceView.svelte.js';
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
  // The active deck's own jlptLevel (decks.svelte.js) — drives grading
  // strictness and recorded-history labeling. Not the global Settings
  // default; that only seeds new decks (see decks.svelte.js).
  jlptLevel: 'N5',
});

export function setQA(newData, { isDefault = false, deckId = null, jlptLevel = 'N5' } = {}) {
  session.qa = newData;
  session.isDefaultDeck = isDefault;
  session.activeDeckId = deckId;
  session.jlptLevel = jlptLevel;
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

  // ── Voicevox cache: warn before committing if it isn't fully warmed ──
  // A mid-session "Loading Cloud Voice…" delay is a worse surprise than a
  // heads-up now. Silent + immediate when the pack is already complete.
  if (get(KEYS.TTS_MODE) === 'voicevox') {
    const texts = [...session.qa.map(q => q.q), ...VOICEVOX_STOCK_PHRASES];
    const { cached, total } = await getVoicePackStatus(texts);
    if (cached < total) {
      const proceed = await requestVoicePackConfirmation(cached, total);
      if (!proceed) return;
    }
    // Downloads quietly in question order (post-shuffle) plus the stock
    // feedback phrases; playback fetches on demand if it gets ahead.
    startVoicevoxWarmup(texts);
  }

  showPracticeScreen();
  loadQuestion();
}

export async function loadQuestion() {
  clearHintTimer();
  const item = session.qa[session.current];
  // Question text hidden, Translate/Romaji closed, no expected-answer box.
  resetQuestionCard();

  showAnswerTranslation('');

  document.getElementById('result-badge').className = 'result-badge';
  showMicWarning(false);
  showTranscript('');
  showBtn('btn-submit',   false);
  showBtn('btn-next',     false);
  showBtn('btn-rerecord', false);
  showBtn('btn-edit-transcript', false);
  showBtn('btn-save-edit', false);
  showBtn('btn-cancel-edit', false);
  showBtn('btn-skip',     true);

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

/** "👁 Show Text": show or hide the question text (and its Translate / Romaji row). */
export function toggleQuestionText() {
  const card = practiceView.question;
  card.pulse = false;
  card.textVisible = !card.textVisible;
}

// Maps translateWithAI's failure reason to something more useful than a
// blanket "check your API key" — most failures aren't actually a bad key.
function translationFailureReasonText() {
  return {
    RATE_LIMIT: 'Shared daily quota reached — try again later, or add your own Groq key in settings.',
    INVALID_KEY: 'Your Groq API key looks invalid — check it in settings.',
    NETWORK_ERROR: 'Couldn’t reach the translation service — check your connection and try again.',
    EMPTY_RESPONSE: 'The AI returned an empty translation — try again.',
  }[getLastTranslationErrorReason()] || null;
}

const translationCache = new Map();

export async function translateQuestion() {
  const item = session.qa[session.current];
  if (!item) return;
  const tr = practiceView.question.translate;
  if (tr.loading) return;

  if (tr.open) {
    tr.open = false;
    return;
  }

  if (translationCache.has(item.q)) {
    Object.assign(tr, { open: true, ok: true, text: translationCache.get(item.q), fallbackUrl: '' });
    return;
  }

  if (!hasAIAccess()) {
    const query = encodeURIComponent(item.q);
    Object.assign(tr, {
      open: true, ok: false, text: '⚠️ AI Translation unavailable.',
      fallbackUrl: `https://translate.google.com/?sl=ja&tl=en&text=${query}&op=translate`,
    });
    return;
  }

  tr.loading = true;
  const translation = await translateWithAI(item.q);
  // The learner may have moved on while this was loading — the card (and
  // practiceView.question) now belongs to another question.
  if (session.qa[session.current] !== item || practiceView.question.translate !== tr) return;
  tr.loading = false;

  if (translation) {
    translationCache.set(item.q, translation);
    Object.assign(tr, { open: true, ok: true, text: translation, fallbackUrl: '' });
  } else {
    Object.assign(tr, {
      open: true, ok: false, fallbackUrl: '',
      text: '❌ ' + (translationFailureReasonText() || 'Translation failed. Check your API key or try again.'),
    });
  }
}

const romajiCache = new Map();

export async function getQuestionRomaji() {
  const item = session.qa[session.current];
  if (!item) return;
  const rm = practiceView.question.romaji;
  if (rm.loading) return;

  if (rm.open) {
    rm.open = false;
    return;
  }

  if (romajiCache.has(item.q)) {
    Object.assign(rm, { open: true, ok: true, text: romajiCache.get(item.q) });
    return;
  }

  if (!hasAIAccess()) {
    Object.assign(rm, { open: true, ok: false, text: '⚠️ Romaji needs AI access — sign in or add a Groq key in Settings.' });
    return;
  }

  rm.loading = true;
  const romaji = await getRomajiWithAI(item.q);
  if (session.qa[session.current] !== item || practiceView.question.romaji !== rm) return; // moved on meanwhile
  rm.loading = false;

  if (romaji) {
    romajiCache.set(item.q, romaji);
    Object.assign(rm, { open: true, ok: true, text: romaji });
  } else {
    Object.assign(rm, { open: true, ok: false, text: '❌ Romaji failed. Try again.' });
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

// ─────────────────────────────────────────────
// STUCK-ANSWER HINT — offers a "Taking a While? Tap to Reveal Answer" prompt
// (opt-in, never automatic) whenever the learner has gone quiet too long —
// either before saying anything, or mid-answer if they pause. It keeps
// watching the whole time listening is active: if they resume speaking
// after the prompt appears, it hides again; if they pause again, it
// re-shows after another quiet window.
//
// Detection is based on the live transcript changing, which only streams in
// real time for browser STT. Whisper/AI recording has no partial transcript
// until it stops, so there's no way to see them mid-answer — the transcript
// just sits unchanged whether they're mid-sentence or done and forgot to
// hit Finish. AI mode therefore uses a longer flat delay (a "reasonable
// time to have finished speaking and pressed Finish Recording") instead of
// the short pause-detection window that browser STT can afford.
// ─────────────────────────────────────────────
const HINT_DELAY_MS = 3000;       // browser STT — real pause detection
const HINT_DELAY_AI_MS = 4000;   // AI/Whisper — same but with no mid transcript updates, so it's just a flat delay.
const HINT_POLL_MS = 400;
let hintPollTimer = null;
let hintLastTranscript = '';
let hintQuietSinceMs = 0;
let hintDelayMs = HINT_DELAY_MS;

function clearHintTimer() {
  if (hintPollTimer) { clearInterval(hintPollTimer); hintPollTimer = null; }
  showBtn('btn-hint-prompt', false);
}

function scheduleHint(item, isAiMode) {
  clearHintTimer();
  hintDelayMs = isAiMode ? HINT_DELAY_AI_MS : HINT_DELAY_MS;
  hintLastTranscript = getLiveTranscript();
  hintQuietSinceMs = Date.now();

  hintPollTimer = setInterval(() => {
    if (session.qa[session.current] !== item) { clearHintTimer(); return; }

    if (practiceView.question.target.visible) { clearHintTimer(); return; } // tutorial/no-AI already showing it

    const current = getLiveTranscript();
    if (current !== hintLastTranscript) {
      // New speech since the last check — they're actively answering.
      // Reset the quiet window and hide the prompt if it was showing.
      hintLastTranscript = current;
      hintQuietSinceMs = Date.now();
      showBtn('btn-hint-prompt', false);
      return;
    }

    if (Date.now() - hintQuietSinceMs >= hintDelayMs) {
      showBtn('btn-hint-prompt', true);
    }
  }, HINT_POLL_MS);
}

/** "💡 Tap to Reveal Answer": show the expected answer, with romaji and a translation. */
export function revealAnswerHint() {
  showBtn('btn-hint-prompt', false);

  const item = session.qa[session.current];
  const target = practiceView.question.target;
  if (!item || target.visible) return;

  Object.assign(target, { visible: true, kind: 'hint', answer: item.a, romaji: '', translation: '' });
  // Async fills below are dropped if the learner has moved on by then.
  const stillHere = () => session.qa[session.current] === item && practiceView.question.target === target;

  if (item.r) {
    target.romaji = item.r;
  } else if (get(KEYS.SHOW_ROMAJI) !== '0' && hasAIAccess()) {
    target.romaji = 'Loading romaji…';
    getRomajiWithAI(item.a).then(romaji => { if (stillHere()) target.romaji = romaji || ''; });
  }
  if (get(KEYS.SHOW_EN_HINTS) !== '0' && hasAIAccess()) {
    target.translation = 'Translating…';
    translateWithAI(item.a, item.q).then(t => { if (stillHere()) target.translation = t || ''; });
  }
}

async function beginListen() {
  const item = session.qa[session.current];
  const target = practiceView.question.target;
  if (session.isDefaultDeck && item.r && session.current < 3 && get(KEYS.TUTORIAL_DONE) !== '1') {
    Object.assign(target, {
      visible: true, kind: 'tutorial', tutorialStep: session.current + 1,
      answer: item.a, romaji: item.r, translation: '',
    });
  } else if (session.current >= 3 && !hasAIAccess()) {
    Object.assign(target, { visible: true, kind: 'answerKey', answer: item.a, romaji: item.r || '', translation: '' });
  }

  // First-time hints (tutorial box above + Show Text pulse) are one-time:
  // once the third question's hints have been shown, the flag turns them off
  // for all future sessions — on any deck.
  if (session.current < 3 && get(KEYS.TUTORIAL_DONE) !== '1') {
    practiceView.question.pulse = true;
    if (session.current === 2) set(KEYS.TUTORIAL_DONE, '1');
  }

  const sttMode = get(KEYS.STT_MODE) || 'ai';
  const useWhisper = sttMode === 'ai' && hasAIAccess();
  let isAiMode = useWhisper;

  if (useWhisper) {
    const started = await startAIRecording((err) => {
      setStatus('', 'Error: ' + err);
      if (err.includes('permission')) showMicWarning(true);
      showBtn('btn-rerecord', true);
      showBtn('btn-skip',     true);
    });

    if (!started) {
      isAiMode = false; // fell back to browser recognition — it does stream live results
      setStatus('listening', '🌐 Browser recognition fallback (AI mic unavailable)');
      try {
        startListening((err) => {
          setStatus('', 'Error: ' + err);
          if (err.includes('permission')) showMicWarning(true);
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
      if (err.includes('permission')) showMicWarning(true);
      showBtn('btn-rerecord', true);
      showBtn('btn-skip',     true);
    }, formatLiveTranscript);
  }

  scheduleHint(item, isAiMode);
}

export async function finishRecording() {
  if (getIsChecking()) return;
  setIsChecking(true);
  clearHintTimer();

  showBtn('btn-submit', false);
  showBtn('btn-rerecord', false);
  showBtn('btn-skip', false);

  const sttMode = get(KEYS.STT_MODE) || 'ai';
  const item = session.qa[session.current];

  let whisperFailReason = null;
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
        whisperFailReason = getLastWhisperErrorReason();
      }
    } else {
      // stopAIRecording() returned null — the recorder never captured
      // anything (e.g. it never actually started on this device).
      whisperFailReason = 'NO_RECORDING';
    }
  } else {
    setStatus('checking', '⌛ Processing transcript…');
    abortRecognition();
    await new Promise(resolve => setTimeout(resolve, 600));
  }

  const raw = getLiveTranscript().trim();

  if (!raw || raw.startsWith('Transcribing')) {
    const message = {
      NO_RECORDING: 'No recording was captured — check microphone permissions and try again.',
      EMPTY_BLOB: 'No audio was captured — check your microphone permissions and try again.',
      EMPTY_TRANSCRIPT: 'Didn’t catch any speech in that recording — try speaking louder or closer to the mic, then re-record.',
      NETWORK_ERROR: 'Couldn’t reach the transcription service — check your connection and try again.',
      RATE_LIMIT: 'Shared daily quota reached — try again later, or add your own Groq key in settings.',
    }[whisperFailReason] || 'Transcription failed or no speech captured — try re-recording.';
    setStatus('', message);
    showBtn('btn-rerecord', true);
    showBtn('btn-skip',     true);
    setIsChecking(false);
    return;
  }

  setStatus('', 'Transcript ready. Review it, then click Check Answer.');
  showBtn('btn-check', true);
  showBtn('btn-edit-transcript', true);
  showBtn('btn-rerecord', true);
  showBtn('btn-skip', true);
  setIsChecking(false);

  // A Whisper request consumed shared quota — keep the start-screen chip fresh.
  updateQuotaDisplay();
}

// ─────────────────────────────────────────────
// TRANSCRIPT EDITING — fixes STT/Whisper mis-transcriptions that a
// re-recording can't (the spoken answer was already correct, the
// recognizer just misheard it). Only available during the post-recording
// review step, before Check Answer is pressed.
// ─────────────────────────────────────────────

export function editTranscript() {
  const ct = document.getElementById('transcript-content');
  const ph = document.getElementById('transcript-placeholder');
  if (!ct) return;

  const textarea = document.createElement('textarea');
  textarea.id = 'transcript-edit-input';
  textarea.className = 'transcript-edit-input';
  textarea.value = getLiveTranscript();
  ct.replaceChildren(textarea);
  ct.classList.remove('hidden');
  if (ph) ph.classList.add('hidden');
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  showBtn('btn-check', false);
  showBtn('btn-rerecord', false);
  showBtn('btn-skip', false);
  showBtn('btn-edit-transcript', false);
  showBtn('btn-save-edit', true);
  showBtn('btn-cancel-edit', true);
}

export function saveEditedTranscript() {
  const textarea = /** @type {HTMLTextAreaElement} */ (document.getElementById('transcript-edit-input'));
  if (!textarea) return;

  const edited = textarea.value.trim();
  if (!edited) {
    alert('Please enter your answer, or press Cancel to keep the original transcription.');
    return;
  }
  setLiveTranscript(edited);
  exitEditMode(edited);
}

export function cancelEditTranscript() {
  exitEditMode(getLiveTranscript());
}

function exitEditMode(text) {
  showTranscript(text, true);
  showBtn('btn-save-edit', false);
  showBtn('btn-cancel-edit', false);
  showBtn('btn-edit-transcript', true);
  showBtn('btn-check', true);
  showBtn('btn-rerecord', true);
  showBtn('btn-skip', true);
}

export async function checkAnswer() {
  if (getIsChecking()) return;
  setIsChecking(true);

  showBtn('btn-check', false);
  showBtn('btn-edit-transcript', false);
  showBtn('btn-rerecord', false);
  showBtn('btn-skip', false);

  const item = session.qa[session.current];
  const raw = getLiveTranscript().trim();

  const furiganaReading = await import('./parser.js').then(m =>
    session.jlptLevel === 'N5' ? m.transcriptToFurigana(raw) : m.transcriptToFuriganaForGrading(raw, item.a)
  );
  showCheckedTranscript(raw, furiganaReading, formatLiveTranscript);

  setStatus('checking', '🤖 AI is checking your answer…');

  /** @type {Awaited<ReturnType<typeof gradeWithAI>> | Awaited<ReturnType<typeof isCorrectLocal>>} */
  let gradeResult = await gradeWithAI(item.q, item.a, raw, session.jlptLevel);
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

  // Romaji: prefer the deck's own stored reading (free, instant — only the
  // built-in Sample deck has one) and only fall back to an AI call for
  // decks that don't. Skipped entirely when the aid is toggled off, both to
  // respect the setting and to avoid burning API quota on a hidden element.
  if (get(KEYS.SHOW_ROMAJI) !== '0') {
    if (item.r) {
      updateCheckedTranslation('expected-ans-romaji', item.r);
    } else if (hasAIAccess()) {
      updateCheckedTranslation('expected-ans-romaji', 'Loading romaji…');
      getRomajiWithAI(item.a)
        .then(romaji => updateCheckedTranslation('expected-ans-romaji', romaji || ''))
        .catch(() => updateCheckedTranslation('expected-ans-romaji', ''));
    }
  }

  if (get(KEYS.SHOW_EN_HINTS) !== '0') {
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
          const reasonText = translationFailureReasonText();
          updateCheckedTranslation('user-ans-trans', `⚠️ ${reasonText || 'AI Translation failed.'} <a href="${url}" target="_blank" style="color: var(--teal); text-decoration: underline;">Translate on Google ↗</a>`);
        }

        let expTrans = null;
        try {
          expTrans = await translateWithAI(item.a, item.q);
        } catch (e) {}

        if (expTrans) {
          updateCheckedTranslation('expected-ans-trans', expTrans);
        } else {
          const expectedUrl = `https://translate.google.com/?sl=ja&tl=en&text=${encodeURIComponent(item.a)}&op=translate`;
          const reasonText = translationFailureReasonText();
          updateCheckedTranslation('expected-ans-trans', `⚠️ ${reasonText || 'AI Translation failed.'} <a href="${expectedUrl}" target="_blank" style="color: var(--teal); text-decoration: underline;">Translate on Google ↗</a>`);
        }
      })();
    } else {
      const query = encodeURIComponent(raw);
      const url = `https://translate.google.com/?sl=ja&tl=en&text=${query}&op=translate`;
      updateCheckedTranslation('user-ans-trans', `🌐 <a href="${url}" target="_blank" style="color: var(--teal); text-decoration: underline;">Translate what you said on Google Translate ↗</a>`);

      const expectedUrl = `https://translate.google.com/?sl=ja&tl=en&text=${encodeURIComponent(item.a)}&op=translate`;
      updateCheckedTranslation('expected-ans-trans', `🌐 <a href="${expectedUrl}" target="_blank" style="color: var(--teal); text-decoration: underline;">Translate expected answer on Google Translate ↗</a>`);
    }
  }

  cancelSpeech('practice');
  setStatus('checking', '🔊 Speaking result feedback…');
  speakFeedback(feedbackText, () => {
    setStatus('', gradeResult.correct ? 'Correct! 🎉' : 'Incorrect. Review the feedback.');
  });

  showBtn('btn-next', true); // labelled "Finish Practice" on the last question
  showBtn('btn-rerecord', false);
  showBtn('btn-check',    false);
  showBtn('btn-skip',     false);
  setIsChecking(false);

  // A grading request consumed shared quota — keep the start-screen chip fresh.
  updateQuotaDisplay();
}

export async function rerecordAnswer() {
  clearHintTimer();
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
  showBtn('btn-edit-transcript', false);
  showBtn('btn-save-edit', false);
  showBtn('btn-cancel-edit', false);
  speakThenListen(item);
}

/** Leave the Results screen for the start screen (✕ and "もう一度 · Again"). */
export function restartApp() {
  abortRecognition();
  releaseMic();
  assistantHistory.splice(0, assistantHistory.length);
  showStartScreen();
  updateQuotaDisplay();
}

export async function nextQuestion() {
  clearHintTimer();
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
  clearHintTimer();
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
  clearHintTimer();
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
    recordSession({ score: session.score, total, jlpt: session.jlptLevel, deckId });
    saveSessionResult({
      jlpt_level: session.jlptLevel,
      score: session.score,
      total,
      results: session.results,
      deckId,
    });
  }
}

function showFinalOverlay(pct, choice) {
  const passed = pct >= 75;
  openFinalOverlay({
    score: session.score,
    total: session.qa.length,
    passed,
    message: choice?.en || (passed ? 'Great job!' : 'Keep practicing!'),
  });

  // Fade out 2s after the spoken feedback ends, or after 3s with no audio.
  const choiceJp = choice?.jp || '';
  if (choiceJp) {
    speakFeedback(choiceJp, () => scheduleFinalOverlayFade(2000), true);
  } else {
    scheduleFinalOverlayFade(3000);
  }
}
