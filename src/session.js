import {
  setStatus, showTranscript, showCheckedTranscript,
  showResult, showResultPanel, showBtn, updateQACount, updateStartButton,
  showAnswerTranslation, updateCheckedTranslation,
  showPracticeScreen, showResultsScreen,
  showVoicevoxPreloadModal, updateVoicevoxPreloadProgress, hideVoicevoxPreloadModal
} from './ui.js';
import {
  getGradingModel, hasGroqApiKey, getGroqApiKey,
  gradeWithAI, transcribeWithWhisper, isCorrectLocal,
  translateWithAI
} from './ai/index.js';
import { get, set, KEYS } from './settings.js';
import { getIsChecking, setIsChecking } from './sessionFlags.js';
import { speakQuestion, speakFeedback, cancelCurrentSpeech, preloadVoicevoxAudio, preloadAllVoicevoxAudio } from './tts.js';
import {
  initRecognizer, startListening, abortRecognition,
  startAIRecording, stopAIRecording, getLiveTranscript,
  setLiveTranscript, releaseMic
} from './stt.js';
import { formatLiveTranscript } from './parser.js';

// ─────────────────────────────────────────────
// SESSION STATE
// ─────────────────────────────────────────────
export let QA = [];
export let current   = 0;
export let score     = 0;
export let results   = [];

export function setQA(newData) {
  QA = newData;
}
export function setCurrent(val) {
  current = val;
}
export function setScore(val) {
  score = val;
}
export function setResults(val) {
  results = val;
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
  if (QA.length === 0) {
    alert('Please import a Q&A database before starting practice.');
    return;
  }
  if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
    alert('Voice recognition requires Chrome or Microsoft Edge. Safari and Firefox are not supported.');
    return;
  }
  // Shuffle questions
  for (let i = QA.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [QA[i], QA[j]] = [QA[j], QA[i]];
  }
  current = 0; score = 0; results = [];

  // ── Batch preload Voicevox audio ──
  if (get(KEYS.TTS_MODE) === 'voicevox') {
    const feedbackPhrases = ['正解です！', '不正解です。'];
    const endSessionPhrases = [
      'おめでとう！', 'すごい！', '完璧です！', 'やったね！', '素晴らしい！',
      'あともう少し！', '諦めないで！', 'ゆっくり頑張ろう！', '次はきっとできる！'
    ];
    const allTexts = [
      ...QA.map(q => q.q),
      ...feedbackPhrases,
      ...endSessionPhrases
    ];

    const signal = { cancelled: false };
    const skipPromise = showVoicevoxPreloadModal(allTexts.length);

    const preloadPromise = preloadAllVoicevoxAudio(
      allTexts,
      (completed, total, msg) => updateVoicevoxPreloadProgress(completed, total, msg),
      signal
    );

    const result = await Promise.race([skipPromise, preloadPromise]);
    if (result === 'skipped') {
      signal.cancelled = true;
    }
    hideVoicevoxPreloadModal();
  }

  showPracticeScreen();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const m = await import('./stt.js');
    m.setMicStream(stream);
    if (!initRecognizer()) {
      setStatus('', 'SpeechRecognition not supported. Use Chrome.');
    }
  } catch (e) {
    initRecognizer();
  }
  loadQuestion();
}

export async function loadQuestion() {
  const item = QA[current];
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

  const pct = (current / QA.length) * 100;
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-label').textContent =
    'Question ' + (current + 1) + ' / ' + QA.length;

  cancelCurrentSpeech();
  setStatus('speaking', 'Preparing…');
  try {
    const { resetAvatarPose } = await import('./avatar.js?' + Date.now());
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
  const item = QA[current];
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

  if (!hasGroqApiKey()) {
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
    if (QA[current] !== item) return;
    setStatus('', 'Starting microphone…');
    setTimeout(() => {
      if (QA[current] !== item) return;
      beginListen();
    }, 800);
  });
}

function beginListen() {
  const item = QA[current];
  const targetBox = document.getElementById('target-answer-box');
  if (targetBox) {
    if (item.r && current < 3) {
      const label = document.getElementById('target-label');
      if (label) label.textContent = '🎯 Tutorial Mode (' + (current + 1) + '/3) Please say the sample answer clearly:';
      document.getElementById('target-answer-text').textContent = item.a;
      document.getElementById('target-romaji-text').textContent = item.r;
      targetBox.style.display = 'block';
    } else if (current >= 3 && !hasGroqApiKey()) {
      const label = document.getElementById('target-label');
      if (label) {
        label.innerHTML = '⚠️ AI Grading Not Configured<br><span style="font-size:0.75rem; font-weight:normal; color:var(--teal);">Showing answer key. Enable AI grading in settings for flexible answers and feedback!</span>';
      }
      document.getElementById('target-answer-text').textContent = item.a;
      document.getElementById('target-romaji-text').textContent = item.r || '';
      targetBox.style.display = 'block';
    }
  }

  if (current < 3) {
    const toggleBtn = document.getElementById('btn-toggle-question');
    if (toggleBtn) toggleBtn.classList.add('highlight-pulse');
  }

  const sttMode = get(KEYS.STT_MODE) || 'ai';
  const useWhisper = sttMode === 'ai' && hasGroqApiKey();

  if (useWhisper) {
    startAIRecording((err) => {
      setStatus('', 'Error: ' + err);
      if (err.includes('permission')) {
        document.getElementById('warning-box').style.display = 'block';
      }
      showBtn('btn-rerecord', true);
      showBtn('btn-skip',     true);
    });
  } else {
    if (sttMode === 'ai' && !hasGroqApiKey()) {
      setStatus('listening', '🌐 Browser recognition (save a Groq key for AI Whisper)');
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
  const item = QA[current];

  if (sttMode === 'ai' && hasGroqApiKey()) {
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
}

export async function checkAnswer() {
  if (getIsChecking()) return;
  setIsChecking(true);

  showBtn('btn-check', false);
  showBtn('btn-rerecord', false);
  showBtn('btn-skip', false);

  const item = QA[current];
  const raw = getLiveTranscript().trim();

  const level = get(KEYS.JLPT_LEVEL) || 'N5';
  const furiganaReading = await import('./parser.js').then(m =>
    level === 'N5' ? m.transcriptToFurigana(raw) : m.transcriptToFuriganaForGrading(raw, item.a)
  );
  showCheckedTranscript(raw, furiganaReading, formatLiveTranscript);

  setStatus('checking', '🤖 AI is checking your answer…');

  let gradeResult = await gradeWithAI(item.q, item.a, raw);
  if (!gradeResult) {
    setStatus('checking', '⚙️ AI unavailable — using local grading…');
    gradeResult = await isCorrectLocal(raw, item.a, item.q);
  }

  if (gradeResult.correct) { score++; playSound("correct"); } else { playSound("incorrect"); }
  const feedbackText = gradeResult.correct ? '正解です！' : '不正解です。';
  results.push({
    q: item.q, a: item.a, transcript: raw, furigana: furiganaReading,
    correct: gradeResult.correct, gradeResult: gradeResult
  });

  showResultPanel(false);

  showResult(gradeResult, item.a);
  showResultPanel(true);

  if (hasGroqApiKey()) {
    updateCheckedTranslation('user-ans-trans', 'Translating your answer...');
    translateWithAI(raw).then(trans => {
      updateCheckedTranslation('user-ans-trans', trans ? 'You said: ' + trans : '');
    }).catch(() => {
      updateCheckedTranslation('user-ans-trans', '');
    });
  } else {
    const query = encodeURIComponent(raw);
    const url = `https://translate.google.com/?sl=ja&tl=en&text=${query}&op=translate`;
    updateCheckedTranslation('user-ans-trans', `🌐 <a href="${url}" target="_blank" style="color: var(--teal); text-decoration: underline;">Translate what you said on Google Translate ↗</a>`);
  }

  cancelCurrentSpeech();
  setStatus('checking', '🔊 Speaking result feedback…');
  speakFeedback(feedbackText, () => {
    setStatus('', gradeResult.correct ? 'Correct! 🎉' : 'Incorrect. Review the feedback.');
  });

  const btnNext = document.getElementById('btn-next');
  if (btnNext) {
    showBtn('btn-next', true);
    if (current === QA.length - 1) {
      btnNext.textContent = 'Finish Practice';
    }
  }
  showBtn('btn-rerecord', false);
  showBtn('btn-check',    false);
  showBtn('btn-skip',     false);
  setIsChecking(false);
}

export function rerecordAnswer() {
  const item = QA[current];
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

export function nextQuestion() {
  cancelCurrentSpeech();
  if (current === QA.length - 1) {
    handleFinishPractice();
    return;
  }
  current++;
  loadQuestion();
}

export function skipQuestion() {
  cancelCurrentSpeech();
  abortRecognition();
  results.push({ q: QA[current].q, a: QA[current].a, transcript: '(skipped)', correct: false });
  if (current === QA.length - 1) {
    handleFinishPractice();
    return;
  }
  current++;
  loadQuestion();
}

export function endSession() {
  cancelCurrentSpeech();
  abortRecognition();
  releaseMic();
  while (results.length < QA.length) {
    const i = results.length;
    results.push({ q: QA[i].q, a: QA[i].a, transcript: '(not reached)', correct: false });
  }
  showResults();
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

  const total = results.length;
  const scoreVal = score;
  const pct = total ? Math.round((scoreVal / total) * 100) : 0;
  const passed = pct >= 75;
  const choice = responses[passed ? 'pass' : 'fail'][Math.floor(Math.random() * (passed ? responses.pass.length : responses.fail.length))];

  if (get(KEYS.TTS_MODE) === 'voicevox') {
    await preloadVoicevoxAudio(choice.jp);
  }

  showResults(choice);
}

async function showResults(choice) {
  const synth = window.speechSynthesis;
  if (synth.speaking) synth.cancel();
  showResultsScreen();

  const total = results.length;
  const pct   = total ? Math.round((score / total) * 100) : 0;

  document.getElementById('score-display').textContent = score + ' / ' + total;
  document.getElementById('score-bar').style.width = pct + '%';

  const msg = pct === 100 ? '🏆 Perfect score! Excellent work!' :
              pct >= 75   ? '✨ Great job! Almost there.' :
              pct >= 50   ? '👍 Good effort. Keep practicing!' :
                            '📚 Keep studying, you\'ll improve!';
  document.getElementById('score-message').textContent = msg;

  showFinalOverlay(pct, choice);

  const list = document.getElementById('results-list');
  if (list) list.replaceChildren();
  results.forEach((r, i) => {
    const div = document.createElement('div');
    div.className = 'result-row ' + (r.correct ? 'c' : 'w');
    const tag = document.createElement('span');
    tag.className = 'tag ' + (r.correct ? 'tag-ok' : 'tag-ng');
    tag.textContent = (i + 1) + '. ' + (r.correct ? '✓ Correct' : '✗ Incorrect');
    const rq = document.createElement('div');
    rq.className = 'rq';
    rq.textContent = r.q;
    const ans = document.createElement('div');
    ans.className = r.correct ? 'rc' : 'rw';
    ans.textContent = 'Heard: ' + r.transcript;
    div.append(tag, rq, ans);
    const expected = document.createElement('div');
    expected.className = 'ra';
    expected.textContent = (r.correct ? '📝 Expected: ' : '✔ Expected: ') + r.a;
    div.appendChild(expected);
    if (r.gradeResult) {
      const fbDiv = document.createElement('div');
      fbDiv.className = 'ai-result-feedback';
      const src = r.gradeResult.source === 'groq' ? '🤖' : '⚙️';

      const generalFb = document.createElement('div');
      generalFb.className = 'ai-feedback-main';
      generalFb.textContent = src + ' ' + (r.gradeResult.general_feedback || r.gradeResult.feedback || '');
      fbDiv.appendChild(generalFb);

      const breakdown = r.gradeResult.breakdown || [];
      if (breakdown.length > 0) {
        const bdCont = document.createElement('div');
        bdCont.className = 'ai-breakdown-container';

        breakdown.forEach(item => {
          const row = document.createElement('div');
          row.className = 'breakdown-row';

          const main = document.createElement('div');
          main.className = 'breakdown-main';
          main.innerHTML = `<span class="breakdown-original">${item.original}</span> <span class="breakdown-arrow">→</span> <span class="breakdown-corrected">${item.corrected}</span>`;

          const details = document.createElement('div');
          details.className = 'breakdown-details';
          details.innerHTML = `<span class="breakdown-category">${item.category}</span> <span class="breakdown-explanation">${item.explanation}</span>`;

          row.append(main, details);
          bdCont.appendChild(row);
        });
        fbDiv.appendChild(bdCont);
      }
      div.appendChild(fbDiv);
    }
    list.appendChild(div);
  });
}

async function showFinalOverlay(pct, choice) {
  const overlay = document.getElementById('final-score-overlay');
  const icon = document.getElementById('final-score-icon');
  const text = document.getElementById('final-score-text');

  if (overlay && icon && text) {
    const passed = pct >= 75;
    icon.textContent = passed ? '🎉' : '💪';

    const choiceEn = choice?.en || (passed ? 'Great job!' : 'Keep practicing!');
    text.innerHTML = `<div style="font-size: 1.5rem; font-weight: bold; margin-bottom: 4px;">${score} / ${QA.length}</div>
                     <div style="font-size: 1.1rem; color: var(--muted);">${choiceEn}</div>`;

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
      }, null, true);
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
