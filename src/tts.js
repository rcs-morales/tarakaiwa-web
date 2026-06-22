import { setStatus } from './ui.js';
import { toggleSpeaking } from './avatar.js';
import { AVATAR_MODELS } from './data.js';
import { get, set, KEYS } from './settings.js';
import { getAudio, saveAudio } from './db.js';

let channels = {
  practice: { audio: null, url: null, onEnd: null },
  tool: { audio: null, url: null, onEnd: null }
};
const prefetchCache = {};
const inFlightVoicevoxRequests = new Map();

/**
 * Must be called synchronously from within a user-gesture handler (tap/click)
 * BEFORE any await. This "unlocks" audio playback on mobile browsers (iOS Safari,
 * Chrome Android) so that later, async-initiated .play() / .speak() calls work.
 */
export function unlockAudioForMobile() {
  // 1. Unlock HTML5 Audio by playing a tiny silent WAV
  try {
    // Minimal valid WAV: 44-byte header + 1 sample of silence
    const silentWav = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    const a = new Audio(silentWav);
    a.volume = 0;
    a.play().catch(() => {});
  } catch (_) { /* ignore */ }

  // 2. Unlock Web Speech API by speaking an empty utterance
  try {
    const synth = window.speechSynthesis;
    if (synth) {
      const utter = new SpeechSynthesisUtterance('');
      utter.volume = 0;
      utter.rate = 10; // finish instantly
      synth.speak(utter);
    }
  } catch (_) { /* ignore */ }
}

export function toggleTTSVoicePanels(mode) {
  const vvSettings = document.getElementById('voicevox-settings-section');
  const avatarSettings = document.getElementById('avatar-settings-section');

  if (vvSettings) vvSettings.style.display = (mode === 'voicevox') ? 'block' : 'none';
  if (avatarSettings) avatarSettings.style.display = (mode === 'browser') ? 'block' : 'none';
}

export async function preloadVoicevoxAudio(text) {
  const speakerId = parseInt(get(KEYS.VOICEVOX_SPEAKER), 10) || 3;
  const cacheKey = `${speakerId}:${text}`;

  if (prefetchCache[cacheKey]) return prefetchCache[cacheKey];
  if (inFlightVoicevoxRequests.has(cacheKey)) return inFlightVoicevoxRequests.get(cacheKey);

  const promise = (async () => {
    try {
      // ── Check offline cache first ──
      const cachedBlob = await getAudio(cacheKey);
      if (cachedBlob) {
        if (cachedBlob.size > 0 && !cachedBlob.type.includes('json') && !cachedBlob.type.includes('html') && !cachedBlob.type.includes('text')) {
          return cachedBlob;
        } else {
          console.warn('Cached audio blob is invalid. Ignoring cache and re-downloading.');
        }
      }

      // ── Fallback to network ──
      const apiUrl = `https://api.tts.quest/v3/voicevox/synthesis?text=${encodeURIComponent(text)}&speaker=${speakerId}`;
      let res;
      res = await fetch(apiUrl);
      if (res.status === 429) {
        console.warn('TTS Quest API Rate Limited (429).');
        throw new Error('429 Too Many Requests');
      }
      if (!res.ok) throw new Error(`TTS Quest API failed: ${res.status}`);

      const data = await res.json();

      const statusUrl = data.audioStatusUrl;
      const audioUrl = data.wavDownloadUrl || data.mp3DownloadUrl;

      if (!statusUrl || !audioUrl) throw new Error("No download URL in response");

      while (true) {
        const statusRes = await fetch(statusUrl);
        const statusData = await statusRes.json();
        if (statusData.isAudioReady) break;
        if (statusData.isAudioError) throw new Error('Audio generation failed on server');
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) throw new Error('Failed to download audio blob');
      
      const audioResBlob = await audioRes.blob();
      
      if (audioResBlob.size === 0) throw new Error('Downloaded audio blob is empty');
      if (audioResBlob.type.includes('json') || audioResBlob.type.includes('html') || audioResBlob.type.includes('text')) {
        const text = await audioResBlob.text();
        throw new Error('Downloaded audio blob is not audio: ' + text.slice(0, 100));
      }
      
      // ── Save to offline cache ──
      await saveAudio(cacheKey, audioResBlob);
      
      return audioResBlob;
    } catch (err) {
      console.error("Voicevox Prefetch failed:", err);
      delete prefetchCache[cacheKey];
      return null;
    }
  })();

  inFlightVoicevoxRequests.set(cacheKey, promise);
  prefetchCache[cacheKey] = promise;
  try {
    return await promise;
  } finally {
    inFlightVoicevoxRequests.delete(cacheKey);
  }
}

/**
 * Batch-preload an array of text strings for Voicevox TTS.
 * Uses a concurrency limit to avoid 429 rate limiting from api.tts.quest.
 * @param {string[]} texts - Array of text strings to preload
 * @param {(completed: number, total: number) => void} onProgress - Progress callback
 * @param {{ cancelled: boolean }} signal - Cancellation signal (set .cancelled = true to stop)
 * @returns {Promise<void>}
 */
export async function preloadAllVoicevoxAudio(texts, onProgress, signal) {
  const CONCURRENCY = 1; // Strict limit to avoid 429s on tts.quest
  let completed = 0;
  const total = texts.length;
  let index = 0;

  async function worker() {
    while (index < total) {
      if (signal && signal.cancelled) return;
      const i = index; // Do not increment yet
      try {
        const startTime = Date.now();
        const result = await preloadVoicevoxAudio(texts[i]);
        const elapsed = Date.now() - startTime;

        if (!result) {
          // Fetch failed (likely 429 or network error).
          // As requested, we wait and retry rather than aborting, keeping the modal active.
          // The user can use the 'Skip' button if they don't want to wait.
          console.warn(`Fetch failed for item ${i}. Retrying in 5 seconds...`);
          if (onProgress) onProgress(completed, total, `API rate limit hit. Pausing 5s before retrying (${completed}/${total})…`);
          await new Promise(r => setTimeout(r, 5000));
          if (onProgress) onProgress(completed, total); // Restore normal text
          continue; // Retry the same item
        }
        
        // Success
        index++;
        completed++;
        if (onProgress) onProgress(completed, total);

        // Wait 1 second between successful requests to be polite to the API
        // Only if it actually hit the network (takes time)
        if (elapsed > 100) {
          await new Promise(r => setTimeout(r, 1000));
        }
      } catch (_) {
        // Individual failures
      }
    }
  }

  const workers = [];
  for (let w = 0; w < Math.min(CONCURRENCY, total); w++) {
    workers.push(worker());
  }
  await Promise.all(workers);
}

function showVoicevoxLoading() {
  if (document.getElementById('vv-loading-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'vv-loading-overlay';
  overlay.className = 'vv-loading-overlay';
  overlay.innerHTML = `
    <div class="vv-loading-card">
      <div class="vv-spinner"></div>
      <h3>☁️ Loading Cloud Voice…</h3>
      <p>Preparing audio from Voicevox. This may take a few seconds.</p>
    </div>
  `;
  document.body.appendChild(overlay);
}

function hideVoicevoxLoading() {
  const overlay = document.getElementById('vv-loading-overlay');
  if (overlay) overlay.remove();
}

async function speakWithVoicevox(text, onEnd, context) {
  const chan = channels[context];
  // Only show the loading overlay if the fetch takes longer than 2.5s
  const loadingTimer = setTimeout(() => showVoicevoxLoading(), 2500);
  try {
    const blob = await preloadVoicevoxAudio(text);
    clearTimeout(loadingTimer);
    hideVoicevoxLoading();
    if (!blob) throw new Error("Could not fetch Voicevox audio");

    if (chan.url) URL.revokeObjectURL(chan.url);
    chan.url = URL.createObjectURL(blob);
    chan.audio = new Audio(chan.url);

    const speed = parseFloat(get(KEYS.TTS_SPEED));
    chan.audio.playbackRate = speed;

    chan.audio.onplay = () => {
      if (context === 'practice') {
        toggleSpeaking(true);
        setStatus('speaking', 'Speaking question…');
      }
    };

    chan.audio.onended = () => {
      if (chan.url) URL.revokeObjectURL(chan.url);
      chan.url = null;
      chan.audio = null;
      if (onEnd) onEnd();
    };
    chan.audio.onerror = () => {
      if (chan.url) URL.revokeObjectURL(chan.url);
      chan.url = null;
      chan.audio = null;
      if (onEnd) onEnd();
    };
    chan.audio.play().catch(err => {
      console.warn(`[${context}] Audio play caught error:`, err);
      // onerror usually fires too, but just in case:
      if (chan.url) URL.revokeObjectURL(chan.url);
      chan.url = null;
      chan.audio = null;
      if (onEnd) onEnd();
    });
  } catch (err) {
    clearTimeout(loadingTimer);
    hideVoicevoxLoading();
    console.error(`Voicevox TTS failed [${context}]:`, err);
    if (onEnd) onEnd();
  }
}

export function saveVoicevoxSpeaker() {
  const select = document.getElementById('voicevox-speaker-select');
  const input = document.getElementById('voicevox-speaker-input');
  if (select && select.value) {
    set(KEYS.VOICEVOX_SPEAKER, select.value);
    if (input) input.value = select.value;
  }
}

function speakWithBrowser(text, onEnd, context) {
  const synth = window.speechSynthesis;
  if (!synth) {
    if (onEnd) onEnd();
    return;
  }

  // Browser TTS is a singleton. If we speak, it will interrupt everything.
  // However, we only call cancel() if we explicitly want to clear the queue.
  if (synth.speaking) synth.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'ja-JP';
  utter.rate = 0.85;
  utter.pitch = 1.0;

  const jpVoice = pickJapaneseBrowserVoice();
  if (jpVoice) utter.voice = jpVoice;

  utter.onstart = () => {
    if (context === 'practice') {
      toggleSpeaking(true);
    }
  };
  utter.onend = onEnd;
  utter.onerror = onEnd;
  synth.speak(utter);
}

export function cancelSpeech(context = 'practice') {
  const chan = channels[context];

  // Browser TTS: Always cancels everything (API limitation)
  const synth = window.speechSynthesis;
  if (synth && synth.speaking) synth.cancel();

  if (chan.audio) {
    chan.audio.pause();
    chan.audio.currentTime = 0;
    chan.audio.onended = null;
    chan.audio.onerror = null;
    chan.audio = null;
  }

  if (chan.url) {
    URL.revokeObjectURL(chan.url);
    chan.url = null;
  }

  try {
    const otherContext = context === 'practice' ? 'tool' : 'practice';
    const otherAudio = channels[otherContext].audio;
    if (otherAudio && !otherAudio.paused && !otherAudio.ended) {
      toggleSpeaking(true);
    } else {
      toggleSpeaking(false);
    }
  } catch (_) { }
}

export async function speakQuestion(text, onEnd, context = 'practice') {
  const mode = get(KEYS.TTS_MODE);
  if (context === 'practice') {
    setStatus('speaking', 'Preparing audio…');
  }

  const wrapOnEnd = () => {
    const otherContext = context === 'practice' ? 'tool' : 'practice';
    const otherAudio = channels[otherContext].audio;
    if (otherAudio && !otherAudio.paused && !otherAudio.ended) {
      toggleSpeaking(true);
    } else {
      toggleSpeaking(false);
    }
    if (onEnd) onEnd();
  };

  if (mode === 'voicevox') {
    await speakWithVoicevox(text, wrapOnEnd, context);
    return;
  }

  speakWithBrowser(text, wrapOnEnd, context);
}

export async function speakFeedback(text, onEnd, silent = false, context = 'practice') {
  if (!silent && context === 'practice') setStatus('speaking', 'Speaking feedback…');
  const wrapOnEnd = () => {
    const otherContext = context === 'practice' ? 'tool' : 'practice';
    const otherAudio = channels[otherContext].audio;
    if (otherAudio && !otherAudio.paused && !otherAudio.ended) {
      toggleSpeaking(true);
    } else {
      toggleSpeaking(false);
    }
    if (onEnd) onEnd();
  };

  // Result feedback should use the configured Voicevox path only.
  const mode = get(KEYS.TTS_MODE);
  if (mode === 'voicevox') {
    await speakWithVoicevox(text, wrapOnEnd, context);
    return;
  }

  // Browser TTS is kept only as a last-resort fallback for non-Voicevox sessions.
  speakWithBrowser(text, wrapOnEnd, context);
}

function getJapaneseVoices() {
  const synth = window.speechSynthesis;
  return synth ? synth.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith('ja')) : [];
}

function voiceMatchesHint(voice, hint) {
  const normalizedHint = String(hint || '').toLowerCase();
  const name = voice.name.toLowerCase();
  const uri = voice.voiceURI.toLowerCase();
  return name.includes(normalizedHint) || uri.includes(normalizedHint);
}

function pickAvatarMappedVoice(voices) {
  const avatarModel = get(KEYS.AVATAR_MODEL);
  const avatarConfig = AVATAR_MODELS[avatarModel] || AVATAR_MODELS.simple;
  const hints = avatarConfig.browserVoiceHints || [];

  for (const hint of hints) {
    const match = voices.find(v => voiceMatchesHint(v, hint));
    if (match) return match;
  }

  return null;
}

function scoreJapaneseBrowserVoice(voice) {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();
  let score = lang === 'ja-jp' ? 20 : 10;
  
  const preferred = [
    'google 日本語', 'google japanese', 'haruka', 'nanami', 'ichiro', 'keita', 'ayumi',
    'kyoko', 'otoya', 'sakura', 'japanese', '日本語', 'microsoft',
  ];
  for (const hint of preferred) {
    if (name.includes(hint)) score += 15;
  }
  
  if (name.includes('english') || name.includes(' us ') || name.includes('uk ')) score -= 100;

  const avatarModel = get(KEYS.AVATAR_MODEL);
  const voiceProfile = (AVATAR_MODELS[avatarModel] || AVATAR_MODELS.simple).voiceProfile || 'female';
  if (voiceProfile === 'male') {
    if (name.includes('male') && !name.includes('female')) score += 50;
    if (name.includes('ichiro') || name.includes('keita')) score += 50;
    if (name.includes('female') || name.includes('haruka') || name.includes('nanami')) score -= 50;
  } else {
    if (name.includes('female')) score += 50;
    if (name.includes('haruka') || name.includes('nanami') || name.includes('ayumi') || name.includes('kyoko')) score += 50;
    if (name.includes('male') && !name.includes('female')) score -= 50;
  }

  return score;
}

function pickJapaneseBrowserVoice() {
  const voices = getJapaneseVoices();
  if (!voices.length) return null;

  const mappedVoice = pickAvatarMappedVoice(voices);
  if (mappedVoice) return mappedVoice;

  return voices.reduce((best, v) => {
    const score = scoreJapaneseBrowserVoice(v);
    const bestScore = best ? scoreJapaneseBrowserVoice(best) : -1;
    return score > bestScore ? v : best;
  }, null);
}
