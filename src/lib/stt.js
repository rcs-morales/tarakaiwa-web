import { setStatus, showTranscript, showTranscriptIndicator, showBtn } from './ui.js';
import { practiceView } from './practiceView.svelte.js';
import { hasAIAccess } from './ai/index.js';
import { getIsChecking } from './sessionFlags.js';

/** @typedef {(message: string) => void} ErrorHandler */

/** @type {any} A SpeechRecognition (the Web Speech API isn't in TS's DOM lib). */
let recog = null;
let listening = false;
let liveTranscript = '';
let finalTranscript = '';
let intentionalStop = false;
/** @type {MediaStream | null} */
let micStream = null;
/** @type {MediaRecorder | null} */
let mediaRecorder = null;
/** @type {Blob[]} */
let audioChunks = [];
let permissionPromptInFlight = false;

/** Ask for (or reuse) microphone access. @param {ErrorHandler} [onError] */
export async function ensureMicAccess(onError) {
  if (micStream && micStream.active) return true;

  if (micStream && !micStream.active) {
    try {
      micStream.getTracks().forEach(track => track.stop());
    } catch (_) {}
    micStream = null;
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    if (onError) onError('Microphone access is not available in this browser.');
    return false;
  }

  try {
    permissionPromptInFlight = true;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    setMicStream(stream);
    permissionPromptInFlight = false;
    return true;
  } catch (e) {
    permissionPromptInFlight = false;
    if (onError) onError('Microphone not available. Please allow microphone access in your browser settings and try again.');
    return false;
  }
}

export function isSpeechRecognitionSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function abortRecognition() {
  intentionalStop = true;
  listening = false;
  if (recog) {
    try { recog.abort(); } catch (e) {}
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.stop(); } catch (e) {}
  }
}

export function initRecognizer() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return false;
  recog = new SpeechRecognition();
  recog.lang            = 'ja-JP';
  recog.continuous      = true;
  recog.interimResults  = true;
  recog.maxAlternatives = 5;
  return true;
}

/**
 * Start browser speech recognition, streaming the live transcript.
 * @param {ErrorHandler} onError
 * @param {(raw: string) => string} formatLiveTranscript
 */
export async function startListening(onError, formatLiveTranscript) {
  if (!recog) {
    onError('SpeechRecognition not supported in this browser. Use Chrome.');
    return;
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    onError('Microphone access is not available in this browser.');
    return;
  }

  if (permissionPromptInFlight) {
    return false;
  }

  const micReady = await ensureMicAccess(onError);
  if (!micReady) {
    return false;
  }

  // Release the manual mic stream before starting native SpeechRecognition 
  // to avoid hardware access conflicts on mobile iOS Safari.
  releaseMic();

  liveTranscript = '';
  finalTranscript = '';
  intentionalStop = false;

  recog.onstart = () => {
    listening = true;
    setStatus('listening', '🎤 Recording… click Submit or Re-record when done');
    showTranscript(formatLiveTranscript(liveTranscript) || '', true);
    showBtn('btn-submit', true);
    showBtn('btn-rerecord', true);
    showBtn('btn-skip', false);
  };
  
  recog.onend = () => {
    if (!intentionalStop) {
      // Browser stopped listening due to silence. Save what we have and restart.
      finalTranscript = liveTranscript;
      try { 
        recog.start(); 
      } catch(e) { 
        listening = false; 
      }
    } else {
      listening = false;
      const isSubmitting = getIsChecking();
      if (liveTranscript && !practiceView.buttons.next && !isSubmitting) {
        showBtn('btn-submit', true);
        showBtn('btn-rerecord', true);
      }
    }
  };
  
  recog.onresult = (/** @type {any} */ e) => {
    let accumulated = '';
    let interimRaw  = '';
    for (let i = 0; i < e.results.length; i++) {
      if (e.results[i].isFinal) accumulated += e.results[i][0].transcript;
      else                      interimRaw  += e.results[i][0].transcript;
    }

    const transcript = finalTranscript + accumulated + interimRaw;
    liveTranscript = transcript;
    showTranscript(formatLiveTranscript(transcript), true);
  };
  
  recog.onerror = (/** @type {any} */ e) => {
    if (e.error === 'no-speech') return; // Ignore silence errors, onend will restart it
    
    // Some browsers use 'aborted' when we call recog.abort(). 
    if (e.error === 'aborted') return;

    intentionalStop = true; // Stop restarting if there's a real error
    listening = false;
    const msg = e.error === 'not-allowed'
      ? 'Microphone permission denied.'
      : 'Recognition error: ' + e.error;
    onError(msg);
  };

  try {
    recog.start();
    return true;
  } catch(e) {
    permissionPromptInFlight = false;
    onError('Speech recognition could not start. Try again after granting microphone access.');
    return false;
  }
}

/** Start recording audio for Whisper. @param {ErrorHandler} onError */
export async function startAIRecording(onError) {
  const micReady = await ensureMicAccess(onError);
  if (!micReady) {
    return false;
  }

  if (!micStream) {
    onError('Microphone not available.');
    return false;
  }

  if (!hasAIAccess()) {
    onError('AI Whisper requires signing in or a Groq API key. Save a key in settings, sign in, or use Browser speech recognition.');
    return false;
  }

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.stop(); } catch (e) {}
  }

  liveTranscript = '';
  audioChunks = [];

  const preferredMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : '';

  /** @type {MediaRecorder} */
  let recorder;
  try {
    recorder = preferredMimeType
      ? new MediaRecorder(micStream, {
          mimeType: preferredMimeType,
          audioBitsPerSecond: 64000
        })
      : new MediaRecorder(micStream);
  } catch (e) {
    onError('MediaRecorder not supported: ' + (e instanceof Error ? e.message : String(e)));
    return;
  }
  mediaRecorder = recorder;

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };

  recorder.onstart = () => {
    listening = true;
    setStatus('listening', '🤖 AI Recording… speak clearly then click Finish Recording');

    showTranscriptIndicator('recording');

    showBtn('btn-submit', true);
    showBtn('btn-rerecord', true);
    showBtn('btn-skip', false);
  };

  recorder.onerror = (/** @type {any} */ e) => {
    listening = false;
    onError('Recording error: ' + e.error);
  };

  recorder.start(250);
  return true;
}

/** Stop the Whisper recording. @returns {Promise<Blob | null>} the audio, or null if none */
export function stopAIRecording() {
  return new Promise((resolve) => {
    const recorder = mediaRecorder;
    if (!recorder || recorder.state === 'inactive') {
      resolve(null);
      return;
    }

    recorder.onstop = () => {
      listening = false;
      const mimeType = (recorder.mimeType || 'audio/webm').split(';')[0].trim();
      const blob = new Blob(audioChunks, { type: mimeType });
      resolve(blob);
    };

    try {
      recorder.stop();
    } catch (e) {
      resolve(null);
    }
  });
}

export function getLiveTranscript() {
  return liveTranscript;
}

/** @param {string} val */
export function setLiveTranscript(val) {
  liveTranscript = val;
}

export function getMicStream() {
  return micStream;
}

/** @param {MediaStream | null} stream */
export function setMicStream(stream) {
  micStream = stream;
}

export function releaseMic() {
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }
}
