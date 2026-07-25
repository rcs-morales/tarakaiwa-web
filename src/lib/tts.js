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

export function unlockAudioForMobile() {
  // 1. Unlock HTML5 Audio by playing a tiny silent WAV on our persistent players
  try {
    // Minimal valid WAV: 44-byte header + 1 sample of silence
    const silentWav = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    
    if (!channels.practice.audio) channels.practice.audio = new Audio();
    if (!channels.tool.audio) channels.tool.audio = new Audio();

    [channels.practice.audio, channels.tool.audio].forEach(a => {
      a.src = silentWav;
      a.volume = 0;
      a.play().catch(() => {});
    });
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

// Stock phrases spoken during every session (feedback + end-of-session praise)
// — included in warmups and the voice pack alongside the deck's questions.
export const VOICEVOX_STOCK_PHRASES = [
  '正解です！', '不正解です。',
  'おめでとう！', 'すごい！', '完璧です！', 'やったね！', '素晴らしい！',
  'あともう少し！', '諦めないで！', 'ゆっくり頑張ろう！', '次はきっとできる！',
];

// Only one background warmup runs at a time — starting a new one (new deck,
// new speaker, session start) cancels the previous.
let warmupSignal = null;

// ── Shared 429 cooldown ──
// api.tts.quest rate-limits aggressively. Any 429 (from the warmup, the
// voice-pack download, or live playback) freezes the batch loops for a full
// cooldown window instead of hammering the API with per-item retries. Live
// playback is never gated — the user is waiting on that audio.
const RATE_LIMIT_COOLDOWN_MS = 60_000;
let rateLimitedUntil = 0;

function noteRateLimited() {
  rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
}

export function isVoicevoxRateLimited() {
  return Date.now() < rateLimitedUntil;
}

/**
 * Fire-and-forget cache warmup. Downloads whatever isn't cached yet, in the
 * given order, at the API-polite pace of preloadAllVoicevoxAudio. Never
 * blocks the caller; playback fetches on demand (deduped in-flight) if it
 * gets ahead of the warmup.
 */
export function startVoicevoxWarmup(texts) {
  cancelVoicevoxWarmup();
  const signal = { cancelled: false };
  warmupSignal = signal;
  preloadAllVoicevoxAudio(texts, null, signal).catch(() => {});
  return signal;
}

/** Stop the background warmup, e.g. before a user-driven full download. */
export function cancelVoicevoxWarmup() {
  if (warmupSignal) warmupSignal.cancelled = true;
  warmupSignal = null;
}

/**
 * How much of the given phrase list is already cached for the current
 * speaker. Drives the "voice pack" indicator in settings.
 * @returns {Promise<{ cached: number, total: number }>}
 */
export async function getVoicePackStatus(texts) {
  const speakerId = parseInt(get(KEYS.VOICEVOX_SPEAKER), 10) || 3;
  let cached = 0;
  for (const text of texts) {
    try {
      const blob = await getAudio(`${speakerId}:${text}`);
      if (blob && blob.size > 0 && !blob.type.includes('json') && !blob.type.includes('html') && !blob.type.includes('text')) {
        cached++;
      }
    } catch (e) { /* count as uncached */ }
  }
  return { cached, total: texts.length };
}

/** Playback rate from settings, clamped to the slider's 0.5–1.5 range. */
function getTTSSpeed() {
  const speed = parseFloat(get(KEYS.TTS_SPEED));
  if (Number.isNaN(speed)) return 0.85;
  return Math.min(1.5, Math.max(0.5, speed));
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
        noteRateLimited();
        console.warn(`TTS Quest API rate limited (429) — pausing background downloads for ${RATE_LIMIT_COOLDOWN_MS / 1000}s.`);
        throw new Error('429 Too Many Requests');
      }
      if (!res.ok) throw new Error(`TTS Quest API failed: ${res.status}`);

      const data = await res.json();

      const statusUrl = data.audioStatusUrl;
      const audioUrl = data.wavDownloadUrl || data.mp3DownloadUrl;

      if (!statusUrl || !audioUrl) throw new Error("No download URL in response");

      // Poll for readiness, but never forever — a stuck job would otherwise
      // pin the (deduped) in-flight slot for this phrase permanently.
      for (let poll = 0; ; poll++) {
        if (poll >= 60) throw new Error('Audio generation timed out');
        const statusRes = await fetch(statusUrl);
        if (statusRes.status === 429) {
          noteRateLimited();
          throw new Error('429 Too Many Requests');
        }
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
      // 429s already logged a single concise warning above — a full
      // console.error per phrase turns a rate-limited warmup into log spam.
      if (!String(err?.message).includes('429')) {
        console.error("Voicevox Prefetch failed:", err);
      }
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
  const MAX_RATE_LIMIT_STRIKES = 3; // give up after this many cooldown cycles
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  let completed = 0;
  const total = texts.length;
  let index = 0;

  async function worker() {
    let retryCount = 0;
    let rateLimitStrikes = 0;
    while (index < total) {
      if (signal && signal.cancelled) return;

      // Hold while the tab is backgrounded — downloading (and erroring) in a
      // hidden tab burns the shared API quota with nobody watching.
      if (typeof document !== 'undefined' && document.hidden) {
        await sleep(1000);
        continue;
      }

      // Hold while a 429 cooldown is active instead of hammering the API.
      if (isVoicevoxRateLimited()) {
        if (onProgress) onProgress(completed, total, `API rate limit hit — waiting to resume (${completed}/${total})…`);
        await sleep(5000);
        continue;
      }

      const i = index; // Do not increment yet
      try {
        const startTime = Date.now();
        const result = await preloadVoicevoxAudio(texts[i]);
        const elapsed = Date.now() - startTime;

        if (!result) {
          if (isVoicevoxRateLimited()) {
            // The fetch just tripped a 429. Wait out the cooldown (loop top);
            // after a few full cycles the API clearly wants us gone — stop
            // the batch entirely (the next warmup trigger starts it fresh).
            rateLimitStrikes++;
            if (rateLimitStrikes >= MAX_RATE_LIMIT_STRIKES) {
              console.warn(`Voicevox batch stopped after ${rateLimitStrikes} rate-limit cooldowns (${completed}/${total} cached).`);
              if (onProgress) onProgress(completed, total, `API is rate limiting — stopped at ${completed}/${total}. Try again later.`);
              return;
            }
            continue;
          }
          retryCount++;
          if (retryCount >= 2) {
            console.warn(`Fetch failed twice for item ${i}. Skipping item to prevent hang...`);
            retryCount = 0;
            index++;
            completed++;
            if (onProgress) onProgress(completed, total);
            continue;
          }
          console.warn(`Fetch failed for item ${i}. Retrying in 5 seconds...`);
          await sleep(5000);
          continue; // Retry the same item
        }

        // Success
        retryCount = 0;
        rateLimitStrikes = 0;
        index++;
        completed++;
        if (onProgress) onProgress(completed, total);

        // Wait 1 second between successful requests to be polite to the API
        // Only if it actually hit the network (takes time)
        if (elapsed > 100) {
          await sleep(1000);
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

async function speakWithVoicevox(text, onEnd, context, rate = 1) {
  const chan = channels[context];
  // Only show the loading overlay if the fetch takes longer than 2.5s
  const loadingTimer = setTimeout(() => showVoicevoxLoading(), 2500);
  try {
    const blob = await preloadVoicevoxAudio(text);
    clearTimeout(loadingTimer);
    hideVoicevoxLoading();
    if (!blob) throw new Error("Could not fetch Voicevox audio");

    // A previous call on this channel that cancelSpeech() cut short may
    // still have a watchdog pending (see below) — disarm it now, before it
    // can fire later and revoke *this* call's URL / toggle speaking off the
    // back of stale state.
    if (chan.cancelWatchdog) { chan.cancelWatchdog(); chan.cancelWatchdog = null; }

    if (chan.url) URL.revokeObjectURL(chan.url);
    chan.url = URL.createObjectURL(blob);

    if (!chan.audio) chan.audio = new Audio();
    chan.audio.src = chan.url;
    chan.audio.volume = 1; // restore volume in case it was muted by unlockAudioForMobile
    chan.audio.playbackRate = rate;

    let finished = false;
    let watchdogTimer = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (watchdogTimer) clearTimeout(watchdogTimer);
      chan.cancelWatchdog = null;
      // Force .paused/.ended to a known state even when the watchdog (not a
      // real 'ended'/'error' event) is what triggered this — otherwise the
      // cross-context "is the other channel still speaking?" checks below
      // and in cancelSpeech() keep seeing a stuck audio element as playing.
      try { chan.audio?.pause(); } catch (_) { }
      if (chan.url) URL.revokeObjectURL(chan.url);
      chan.url = null;
      if (onEnd) onEnd();
    };
    // cancelSpeech() can't see this call's local `finished`/`watchdogTimer` —
    // expose a way to silently disarm the watchdog (no onEnd, no URL
    // revocation — cancelSpeech() already handles both itself) so a stale
    // timer from an interrupted call can never fire after the fact.
    chan.cancelWatchdog = () => {
      finished = true;
      if (watchdogTimer) clearTimeout(watchdogTimer);
    };

    // Safety net: mobile browsers can silently drop the `ended`/`error`
    // events (backgrounded tab, OS media-session interruption), leaving the
    // avatar stuck mid-bounce forever since nothing ever calls toggleSpeaking
    // (false). Fall back to a hard timeout sized to the clip's own duration
    // (once known) so a missed event still resolves.
    const armWatchdog = () => {
      if (finished || watchdogTimer) return;
      const knownMs = Number.isFinite(chan.audio.duration) && chan.audio.duration > 0
        ? chan.audio.duration * 1000
        : 20000;
      watchdogTimer = setTimeout(finish, knownMs / Math.max(rate, 0.1) + 3000);
    };

    chan.audio.onloadedmetadata = armWatchdog;

    chan.audio.onplay = () => {
      if (context === 'practice') {
        toggleSpeaking(true);
        setStatus('speaking', 'Speaking question…');
      }
      armWatchdog();
    };

    chan.audio.onended = finish;
    chan.audio.onerror = finish;
    chan.audio.play().catch(err => {
      console.warn(`[${context}] Audio play caught error:`, err);
      finish();
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

function speakWithBrowser(text, onEnd, context, rate = 1) {
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
  utter.rate = rate;
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

  // Disarm any pending Voicevox watchdog for this channel — otherwise it
  // can fire later (after this cancellation) against a since-replaced
  // audio/url, based on this call's now-stale closure state.
  if (chan.cancelWatchdog) { chan.cancelWatchdog(); chan.cancelWatchdog = null; }

  // Browser TTS: Always cancels everything (API limitation)
  const synth = window.speechSynthesis;
  if (synth && synth.speaking) synth.cancel();

  if (chan.audio) {
    chan.audio.pause();
    chan.audio.currentTime = 0;
    chan.audio.onended = null;
    chan.audio.onerror = null;
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

  // Only questions follow the speech-speed slider — it's a listening-
  // comprehension aid. Feedback/praise (speakFeedback) plays at natural speed.
  if (mode === 'voicevox') {
    await speakWithVoicevox(text, wrapOnEnd, context, getTTSSpeed());
    return;
  }

  speakWithBrowser(text, wrapOnEnd, context, getTTSSpeed());
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
