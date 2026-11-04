// VOICEVOX voice pack: which phrases a session will speak, the background
// warmup, the "N/M phrases cached" indicator and the "Download all" flow.
// Rendered in Settings.svelte (Voice & Avatar).

import {
  startVoicevoxWarmup, cancelVoicevoxWarmup, getVoicePackStatus,
  preloadAllVoicevoxAudio, VOICEVOX_STOCK_PHRASES,
} from './tts.js';
import { clearAudioCache } from './db.js';
import { get, KEYS } from './settings.js';
import { session } from './session.svelte.js';

export const voicePack = $state({
  /** e.g. "12/40 phrases cached", or a progress / rate-limit message while downloading. */
  status: '—',
  downloading: false,
  /** Download progress, 0–100. */
  progress: 0,
});

// The first two stock phrases are the pass/fail feedback lines spoken after
// every single answer — everything past that is end-of-session praise, only
// needed once. See checkAnswer() in session.svelte.js.
const FEEDBACK_PHRASE_COUNT = 2;

/**
 * All phrases a full session can speak: deck questions + stock phrases,
 * ordered so whatever the learner is about to hear next is warmed first.
 * Voice can be swapped mid-session (Settings is its own always-mounted tab),
 * so this starts from session.current rather than the deck's original
 * order — otherwise the background warmup wastes its one-at-a-time queue
 * re-caching already-answered questions before ever reaching upcoming ones.
 * The pass/fail feedback lines are pulled to right after the current
 * question (instead of after the whole remaining deck) since they're needed
 * on the very next "Check Answer" — leaving them queued behind a long deck
 * is what causes a cold, delayed feedback line right after a voice swap.
 */
export function voicePackTexts() {
  const upcoming = session.qa.slice(session.current).map(q => q.q);
  const answered = session.qa.slice(0, session.current).map(q => q.q);
  const feedback = VOICEVOX_STOCK_PHRASES.slice(0, FEEDBACK_PHRASE_COUNT);
  const praise = VOICEVOX_STOCK_PHRASES.slice(FEEDBACK_PHRASE_COUNT);
  return [...upcoming.slice(0, 1), ...feedback, ...upcoming.slice(1), ...praise, ...answered];
}

/** Kick off a quiet background download of any uncached audio (voicevox only). */
export function warmVoicesIfNeeded() {
  if (get(KEYS.TTS_MODE) !== 'voicevox' || session.qa.length === 0) return;
  startVoicevoxWarmup(voicePackTexts());
}

/** Refresh the "N/M phrases cached" indicator (skipped while a download reports progress). */
export async function refreshVoicePackStatus() {
  if (voicePack.downloading) return;
  const { cached, total } = await getVoicePackStatus(voicePackTexts());
  if (!voicePack.downloading) voicePack.status = `${cached}/${total} phrases cached`;
}

/** "Download all": fetch every phrase now, showing progress. */
export async function downloadVoicePack() {
  if (voicePack.downloading) return;
  voicePack.downloading = true;
  voicePack.progress = 0;
  cancelVoicevoxWarmup(); // don't race the background warmup for the same files
  try {
    await preloadAllVoicevoxAudio(
      voicePackTexts(),
      (done, total, msg) => {
        voicePack.status = msg || `downloading ${done}/${total}…`;
        if (total) voicePack.progress = Math.round((done / total) * 100);
      },
      { cancelled: false }
    );
  } finally {
    voicePack.downloading = false;
    refreshVoicePackStatus();
  }
}

/** "Clear Audio Cache": drop every cached clip. */
export async function clearVoicePackCache() {
  await clearAudioCache();
  await refreshVoicePackStatus();
  alert('Voicevox audio cache cleared successfully.');
}
