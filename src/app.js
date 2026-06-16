import { DEFAULT_QA } from './data.js';
import {
  parseJSON, parseCSV, parseExcel, ensureXLSXLoaded,
  formatLiveTranscript
} from './parser.js';
import {
  setStatus, showTranscript, showCheckedTranscript,
  showResult, showResultPanel, showBtn, updateQACount, updateStartButton,
  showImportStatus, showApiKeyStatus, toggleKeyVisibility,
  showAnswerTranslation, updateCheckedTranslation
} from './ui.js';
import {
  getGradingModel, saveGradingModel, updateAIStatusChip,
  saveApiKeyFromInput, clearApiKey, hasGroqApiKey,
  testApiConnection, gradeWithAI, transcribeWithWhisper, isCorrectLocal,
  translateWithAI, askStudyAssistant
} from './ai.js';
import { bugReporter } from './bugReporter.js';
import {
  initAvatar, clearAvatarMotionLoop, startAvatarMotionLoop,
  toggleSpeaking, getAvatarModelName, saveAvatarModel,
  getAvatarModelConfig
} from './avatar.js';
import {
  speakQuestion, speakFeedback, cancelCurrentSpeech,
  toggleTTSVoicePanels, saveVoicevoxSpeaker, preloadVoicevoxAudio
} from './tts.js';
import {
  initRecognizer, startListening, abortRecognition,
  startAIRecording, stopAIRecording, getLiveTranscript,
  setLiveTranscript, getMicStream, setMicStream, releaseMic
} from './stt.js';

// ─────────────────────────────────────────────
// GLOBAL EXPORTS (Immediate Registration)
// ─────────────────────────────────────────────


window.saveTTSMode = () => {
  const select = document.getElementById('tts-mode-select');
  if (select) {
    const mode = select.value;
    localStorage.setItem('tts_mode', mode);
    
    if (mode === 'voicevox') {
      localStorage.setItem('voicevox_speaker', '3');
      const vvSelect = document.getElementById('voicevox-speaker-select');
      if (vvSelect) vvSelect.value = '3';
    }
    
    toggleTTSVoicePanels(mode);
    initAvatar();
  }
};

window.saveSTTMode = () => {
  const select = document.getElementById('stt-mode-select');
  if (select) localStorage.setItem('stt_mode', select.value);
};

window.saveJLPTLevel = () => {
  const select = document.getElementById('jlpt-level-select');
  if (select) localStorage.setItem('jlpt_level', select.value);
};


window.saveGradingModel = saveGradingModel;
window.testApiConnection = testApiConnection;
window.saveApiKeyFromInput = saveApiKeyFromInput;
window.clearApiKey = clearApiKey;
window.toggleKeyVisibility = toggleKeyVisibility;
window.saveAvatarModel = saveAvatarModel;
window.initAvatar = initAvatar;
window.saveVoicevoxSpeaker = saveVoicevoxSpeaker;


// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let QA = [];
let current   = 0;
let score     = 0;
let results   = [];
const assistantHistory = [];
export { assistantHistory };
let synth         = window.speechSynthesis;
let isChecking    = false;
window.isChecking = false;
function playSound(type) {
  const sounds = { correct: 'assets/sounds/correct.wav', incorrect: 'assets/sounds/incorrect.wav' };
  const audio = new Audio(sounds[type]);
  audio.play().catch(e => console.warn('Audio playback failed:', e));
}



// ─────────────────────────────────────────────
// SETUP FLOW
// ─────────────────────────────────────────────

window.startSetupFlow = () => {
  document.getElementById('setup-entry-point').classList.add('hidden');
  nextSetupStep('setup-step-api-key');
};

window.nextSetupStep = (stepId) => {
  // Hide all potential steps
  const steps = ['import-section', 'setup-step-api-key', 'setup-step-settings'];
  steps.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  // Show the target step
  const target = document.getElementById(stepId);
  if (target) {
    target.classList.remove('hidden');
    // If the target is inside the ai-settings-section, make sure that section is visible
    const section = document.getElementById('ai-settings-section');
    if (section && (stepId === 'setup-step-api-key' || stepId === 'setup-step-settings')) {
      section.classList.remove('hidden');
    }
  }
};

window.finishSetup = () => {
  document.getElementById('ai-settings-section').classList.add('hidden');
  document.getElementById('setup-entry-point').classList.remove('hidden');
  // Optionally, hide the setup button if they are fully configured
  if (hasGroqApiKey() && QA.length > 0) {
    document.getElementById('setup-entry-point').classList.add('hidden');
  }
};

// Modified handleFileImport to include "Next" button logic if in setup flow
async function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  const fileName = file.name.toLowerCase();
  const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

  reader.onload = async (e) => {
    try {
      let qa;

      if (isExcel) {
        await ensureXLSXLoaded();
        qa = parseExcel(e.target.result);
      } else {
        const content = e.target.result;
        if (fileName.endsWith('.json')) {
          qa = parseJSON(content);
        } else if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
          qa = parseCSV(content);
        } else {
          throw new Error('Unsupported file format. Use JSON, CSV, or Excel.');
        }
      }

      if (!Array.isArray(qa) || qa.length === 0) {
        throw new Error('No valid Q&A data found in file');
      }

      QA = qa;
      localStorage.setItem('jlpt_qa_data', JSON.stringify(qa));
      updateQACount(QA.length);
      updateStartButton(QA.length);
      showImportStatus('✅ Successfully imported ' + qa.length + ' question' + (qa.length !== 1 ? 's' : '') + ' from ' + file.name, 'success');

      // If we are in the setup flow, show the "Next" button
      const importSection = document.getElementById('import-section');
      if (importSection && !importSection.classList.contains('hidden')) {
        const btnContainer = document.createElement('div');
        btnContainer.id = 'setup-next-import-container';
        btnContainer.style.marginTop = '20px';
        btnContainer.style.textAlign = 'right';
        btnContainer.innerHTML = `<button class="btn btn-primary" onclick="nextSetupStep('setup-step-api-key')">Next: AI Settings →</button>`;

        // Remove existing one if it exists
        const existing = document.getElementById('setup-next-import-container');
        if (existing) existing.remove();

        importSection.appendChild(btnContainer);
      }
    } catch (error) {
      showImportStatus('❌ Import failed: ' + error.message, 'error');
    }
  };

  reader.onerror = () => {
    showImportStatus('❌ Error reading file', 'error');
  };

  if (isExcel) {
    reader.readAsArrayBuffer(file);
  } else {
    reader.readAsText(file);
  }

  event.target.value = '';
}

function clearDatabase() {
  localStorage.removeItem('jlpt_qa_data');
  QA = [];
  updateQACount(QA.length);
  updateStartButton(QA.length);
  showImportStatus('🗑 Database cleared. Import a Q&A file to begin practice.', 'info');
  document.getElementById('file-input').value = '';
}

// ─────────────────────────────────────────────
// FLOW
// ─────────────────────────────────────────────
export async function handleAssistantQuery(query) {
  if (!query) return;

  const historyBox = document.getElementById('ai-chat-history');
  const inputField = document.getElementById('ai-chat-input');
  const sendBtn = document.getElementById('btn-ai-send');
  // Removed micBtn reference as it no longer exists in HTML

  appendAiMessage('user', query);

  inputField.value = '';
  if (sendBtn) sendBtn.disabled = true;

  const assistantMsgDiv = appendAiMessage('assistant', 'Thinking...');

  const result = await askStudyAssistant(query, assistantHistory);

  if (result && result.response) {
    // Remove furigana processing for the chatbot to avoid clutter and mismatched readings.
    // Instead, highlight the readings provided in parentheses by the AI.
    const formattedResponse = result.response.replace(/(\([a-zA-Z\s-]+\))/g, '<span class="ai-reading-highlight">$1</span>');
    assistantMsgDiv.innerHTML = formattedResponse;

    assistantHistory.push({ role: 'user', content: query });
    assistantHistory.push({ role: 'assistant', content: result.response });

    if (assistantHistory.length > 20) {
      assistantHistory.splice(0, assistantHistory.length - 20);
    }
  } else {
    let errorMsg = '❌ Sorry, I encountered an error.';
    if (result?.error === 'MISSING_KEY') {
      errorMsg = '❌ No API key found. Please add one in settings.';
    } else if (result?.error === 'INVALID_KEY') {
      errorMsg = '❌ Invalid API key. Please check your key in settings.';
    } else if (result?.error === 'RATE_LIMIT') {
      errorMsg = '⚠️ Rate limit exceeded. Please wait a moment and try again.';
    } else if (result?.error === 'NETWORK_ERROR') {
      errorMsg = '🌐 Network error. Please check your connection.';
    } else {
      errorMsg = `❌ API Error (${result?.error || 'Unknown'}). Please try again.`;
    }
    assistantMsgDiv.textContent = errorMsg;
  }

  if (sendBtn) sendBtn.disabled = false;
  historyBox.scrollTop = historyBox.scrollHeight;
}

export function appendAiMessage(role, text) {
  const historyBox = document.getElementById('ai-chat-history');
  if (!historyBox) return null;

  const msgDiv = document.createElement('div');
  msgDiv.className = `ai-msg ${role}`;
  msgDiv.innerHTML = text;
  historyBox.appendChild(msgDiv);
  historyBox.scrollTop = historyBox.scrollHeight;
  return msgDiv;
}

function startPractice() {
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
  document.getElementById('screen-start').classList.add('hidden');
  document.getElementById('screen-practice').classList.remove('hidden');

  initAvatar();

  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      setMicStream(stream);
      if (!initRecognizer()) {
        setStatus('', 'SpeechRecognition not supported. Use Chrome.');
        return;
      }
      loadQuestion();
    })
    .catch(() => {
      initRecognizer();
      loadQuestion();
    });
}

async function loadQuestion() {
  const item = QA[current];
  const qText = document.getElementById('question-text');
  qText.textContent = item.q;
  qText.style.display = 'none';
  const toggleBtn = document.getElementById('btn-toggle-question');
  if (toggleBtn) {
    toggleBtn.textContent = '👁 Show Text';
    toggleBtn.classList.remove('highlight-pulse');
  }

  // Reset translate UI
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

  // ... (rest of the function)

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

  if (synth.getVoices().length === 0) {
    synth.addEventListener('voiceschanged', () => speakThenListen(item), { once: true });
  } else {
    speakThenListen(item);
  }
}

function toggleQuestionText() {
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

async function translateQuestion() {
  const item = QA[current];
  if (!item) return;

  const link = document.getElementById('btn-translate');
  const result = document.getElementById('translate-result');
  if (!link || !result) return;

  // Prevent multiple concurrent translation requests
  if (link.classList.contains('loading')) return;

  // If already showing, toggle hide
  if (result.classList.contains('visible')) {
    result.classList.remove('visible');
    link.textContent = '🌐 Translate';
    return;
  }

  // Check cache first
  if (translationCache.has(item.q)) {
    result.textContent = translationCache.get(item.q);
    result.classList.add('visible');
    link.textContent = '🌐 Hide Translation';
    return;
  }

  // Attempt AI translation
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

  const sttMode = localStorage.getItem('stt_mode') || 'ai';
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

async function finishRecording() {
  if (isChecking) return;
  isChecking = true;
  window.isChecking = true;

  showBtn('btn-submit', false);
  showBtn('btn-rerecord', false);
  showBtn('btn-skip', false);

  const sttMode = localStorage.getItem('stt_mode') || 'ai';
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
    // Small delay to simulate processing and allow UI to update
    await new Promise(resolve => setTimeout(resolve, 600));
  }

  const raw = getLiveTranscript().trim();

  if (!raw || raw.startsWith('Transcribing')) {
    setStatus('', 'Transcription failed or no speech captured — try re-recording.');
    showBtn('btn-rerecord', true);
    showBtn('btn-skip',     true);
    isChecking = false;
    window.isChecking = false;

    return;
  }

  setStatus('', 'Transcript ready. Review it, then click Check Answer.');
  showBtn('btn-check', true);
  showBtn('btn-rerecord', true);
  showBtn('btn-skip', true);
  isChecking = false;
  window.isChecking = false;
}

async function checkAnswer() {
  if (isChecking) return;
  isChecking = true;
  window.isChecking = true;

  showBtn('btn-check', false);
  showBtn('btn-rerecord', false);
  showBtn('btn-skip', false);

  const item = QA[current];
  const raw = getLiveTranscript().trim();

  const level = localStorage.getItem('jlpt_level') || 'N5';
  const furiganaReading = await import('./parser.js').then(m =>
    level === 'N5' ? m.transcriptToFurigana(raw) : m.transcriptToFuriganaForGrading(raw, item.a)
  );
  showCheckedTranscript(raw, furiganaReading, formatLiveTranscript);

  setStatus('checking', '🤖 AI is checking your answer…');

  // Do not prefetch result feedback audio during grading; it creates unnecessary cloud TTS traffic.
  // The result audio will be prepared only after the answer has been graded.

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
  if (localStorage.getItem('tts_mode') === 'voicevox') {
    setStatus('checking', '🔄 Preparing result voice…');
    const blob = await preloadVoicevoxAudio(feedbackText);
    if (!blob) {
      setStatus('checking', '⚠️ Voice response unavailable — showing result without audio.');
    }
  }

  showResult(gradeResult, item.a);
  showResultPanel(true);

  // Translate the user's spoken answer for feedback
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
  isChecking = false;
  window.isChecking = false;
}

function rerecordAnswer() {
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

function nextQuestion() {
  cancelCurrentSpeech();
  if (current === QA.length - 1) {
    handleFinishPractice();
    return;
  }
  current++;
  loadQuestion();
}

function skipQuestion() {
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

function endSession() {
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

  if (localStorage.getItem('tts_mode') === 'voicevox') {
    await preloadVoicevoxAudio(choice.jp);
  }

  showResults(choice);
}

async function showResults(choice) {
  if (synth.speaking) synth.cancel();
  document.getElementById('screen-practice').classList.add('hidden');
  const rs = document.getElementById('screen-results');
  if (rs) rs.style.display = 'block';

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
      const src = r.gradeResult.source === 'gemini' ? '🤖' : '⚙️';

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

function makeDraggable(element, handle) {
  let isDragging = false;
  let offsetX = 0, offsetY = 0;

  handle.addEventListener('mousedown', (e) => {
    isDragging = true;
    const rect = element.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    element.style.transition = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (isDragging) {
      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;
      element.style.left = x + 'px';
      element.style.top = y + 'px';
      element.style.bottom = 'auto';
      element.style.right = 'auto';
    }
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      element.style.transition = '';
    }
    isDragging = false;
  });
}

function initAiPanelInteractivity() {
  const panel = document.getElementById('ai-assistant-panel');
  const header = panel?.querySelector('.ai-panel-header');
  const resizer = panel?.querySelector('.ai-panel-resizer');
  if (!panel || !header || !resizer) return;

  makeDraggable(panel, header);

  // ── Resizing Logic ──
  let isResizing = false;
  let startWidth = 0, startHeight = 0, startX = 0, startY = 0;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    e.preventDefault();
    e.stopPropagation();
    startWidth = panel.offsetWidth;
    startHeight = panel.offsetHeight;
    startX = e.clientX;
    startY = e.clientY;
    panel.style.transition = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (isResizing) {
      const width = startWidth + (e.clientX - startX);
      const height = startHeight + (e.clientY - startY);
      if (width > 280) panel.style.width = width + 'px';
      if (height > 300) panel.style.height = height + 'px';
    }
  });

  window.addEventListener('mouseup', () => {
    if (isResizing) {
      panel.style.transition = '';
    }
    isResizing = false;
  });
}

async function showFinalOverlay(pct, choice) {
  const overlay = document.getElementById('final-score-overlay');
  const icon = document.getElementById('final-score-icon');
  const text = document.getElementById('final-score-text');

  if (overlay && icon && text) {
    // Set the appropriate message and icon based on the score
    const passed = pct >= 75;
    icon.textContent = passed ? '🎉' : '💪';

    // Display score and the English message in the overlay
    text.innerHTML = `<div style="font-size: 1.5rem; font-weight: bold; margin-bottom: 4px;">${score} / ${QA.length}</div>
                     <div style="font-size: 1.1rem; color: var(--muted);">${choice.en}</div>`;

    // Show the overlay immediately
    overlay.classList.remove('hidden');
    overlay.style.opacity = '1';

    // Speak only the Japanese message (silently update status)
    speakFeedback(choice.jp, () => {
      // Hide overlay after the message is spoken
      setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => {
          overlay.classList.add('hidden');
        }, 1000);
      }, 2000);
    }, null, true); // silent = true
  }
}

function restartApp() {
  abortRecognition();
  releaseMic();
  assistantHistory = [];
  document.getElementById('screen-results').style.display = 'none';
  document.getElementById('screen-start').classList.remove('hidden');
  document.getElementById('screen-practice').classList.add('hidden');
  updateQACount(QA.length);
  updateStartButton(QA.length);
}

document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('file-input');
  if (fileInput) {
    fileInput.addEventListener('change', handleFileImport);
  }

  const savedQA = localStorage.getItem('jlpt_qa_data');
  if (savedQA) {
    try {
      const parsed = JSON.parse(savedQA);
      if (Array.isArray(parsed) && parsed.length > 0) {
        QA = parsed;
      }
    } catch (e) {
      console.error('Error loading saved QA data:', e);
    }
  } else {
    QA = DEFAULT_QA.slice(0, 10);
  }
  updateQACount(QA.length);
  updateStartButton(QA.length);

  const savedProvider = localStorage.getItem('api_provider');
  if (savedProvider && savedProvider !== 'groq') {
    localStorage.removeItem('api_provider');
    localStorage.removeItem('api_key');
    showApiKeyStatus('Previous provider removed. Please save a Groq API key (starts with gsk_).', 'info');
  }
  const savedKey = localStorage.getItem('api_key') || localStorage.getItem('gemini_api_key');
  if (savedKey) {
    const input = document.getElementById('api-key-input');
    if (input) input.value = savedKey;
    updateAIStatusChip();
  }

  const gradingModelSelect = document.getElementById('grading-model-select');
  if (gradingModelSelect) gradingModelSelect.value = getGradingModel();

  const savedSTTMode = localStorage.getItem('stt_mode') || 'ai';
  const sttSelect = document.getElementById('stt-mode-select');
  if (sttSelect) sttSelect.value = savedSTTMode;

  const savedJLPTLevel = localStorage.getItem('jlpt_level') || 'N5';
  const jlptSelect = document.getElementById('jlpt-level-select');
  if (jlptSelect) jlptSelect.value = savedJLPTLevel;

  const avatarModelSelect = document.getElementById('avatar-model-select');
  if (avatarModelSelect) avatarModelSelect.value = getAvatarModelName();

  const TTS_DEFAULT = 'browser';
  if (!localStorage.getItem('tts_default_browser_v1')) {
    localStorage.setItem('tts_mode', TTS_DEFAULT);
    localStorage.setItem('tts_default_browser_v1', '1');
  } else if (!localStorage.getItem('tts_mode')) {
    localStorage.setItem('tts_mode', TTS_DEFAULT);
  }
  const savedTTSMode = localStorage.getItem('tts_mode') || TTS_DEFAULT;
  const ttsSelect = document.getElementById('tts-mode-select');
  if (ttsSelect) {
    ttsSelect.value = savedTTSMode;
    toggleTTSVoicePanels(savedTTSMode);
  }

  const savedVvSpeaker = localStorage.getItem('voicevox_speaker') || '3';
  const vvSpeakerSelect = document.getElementById('voicevox-speaker-select');
  if (vvSpeakerSelect) {
    vvSpeakerSelect.value = savedVvSpeaker;
  }

  // ── AI Study Assistant Event Listeners ──
  const btnAiAssistant = document.getElementById('btn-ai-assistant');
  const aiPanel = document.getElementById('ai-assistant-panel');
  const btnCloseAi = document.getElementById('btn-close-ai');
  const btnAiSend = document.getElementById('btn-ai-send');
  const btnAiMic = document.getElementById('btn-ai-mic');
  const aiChatInput = document.getElementById('ai-chat-input');

  if (btnAiAssistant && aiPanel) {
    btnAiAssistant.addEventListener('click', () => {
      if (aiPanel.classList.contains('hidden')) {
        const btnRect = btnAiAssistant.getBoundingClientRect();

        // Disable transitions to prevent "sliding" from the default CSS position
        aiPanel.style.transition = 'none';

        // Align right edge of panel with right edge of button
        aiPanel.style.left = (btnRect.right - (aiPanel.offsetWidth || 360)) + 'px';
        // Position panel above the button
        aiPanel.style.top = (btnRect.top - (aiPanel.offsetHeight || 500)) + 'px';

        // Explicitly clear bottom/right to avoid conflicts with fixed positioning
        aiPanel.style.bottom = 'auto';
        aiPanel.style.right = 'auto';

        // Ensure it doesn't go off-screen (simple boundary check)
        const panelRect = aiPanel.getBoundingClientRect();
        if (panelRect.left < 0) aiPanel.style.left = '10px';
        if (panelRect.top < 0) aiPanel.style.top = '10px';

        aiPanel.classList.remove('hidden');

        // Restore transitions after a short delay to allow positioning to snap
        setTimeout(() => {
          aiPanel.style.transition = '';
        }, 10);
      } else {
        aiPanel.classList.add('hidden');
      }
    });
  }

  if (btnCloseAi && aiPanel) {
    btnCloseAi.addEventListener('click', () => {
      aiPanel.classList.add('hidden');
    });
  }

  initAiPanelInteractivity();

  if (btnAiAssistant) {
    makeDraggable(btnAiAssistant, btnAiAssistant);
  }

  if (btnAiSend && aiChatInput) {
    btnAiSend.addEventListener('click', () => {
      handleAssistantQuery(aiChatInput.value);
    });
  }

  if (aiChatInput) {
    aiChatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleAssistantQuery(aiChatInput.value);
      }
    });
  }

  // Removed btnAiMic listener as the button was removed from HTML
});

// Export functions to window for HTML buttons
window.startPractice = startPractice;
window.toggleQuestionText = toggleQuestionText;
window.translateQuestion = translateQuestion;
window.finishRecording = finishRecording;
window.checkAnswer = checkAnswer;
window.rerecordAnswer = rerecordAnswer;
window.nextQuestion = nextQuestion;
window.skipQuestion = skipQuestion;
window.endSession = endSession;
window.saveApiKeyFromInput = saveApiKeyFromInput;
window.saveGradingModel = saveGradingModel;
window.saveSTTMode = saveSTTMode;
window.saveJLPTLevel = saveJLPTLevel;
window.saveAvatarModel = saveAvatarModel;
window.saveTTSMode = saveTTSMode;
window.saveVoicevoxSpeaker = saveVoicevoxSpeaker;
window.restartApp = restartApp;
window.clearDatabase = clearDatabase;
window.bugReporter = bugReporter;

