import { setStatus } from './ui.js';
import { toggleSpeaking } from './avatar.js';

let currentAudio = null;
let currentAudioUrl = null;

const VOICEVOX_SERVER_URL = () => localStorage.getItem('voicevox_server_url') || 'http://localhost:50021';



export function toggleTTSVoicePanels(mode) {
  const browserContainer = document.getElementById('browser-voice-container');
  const vvSettings = document.getElementById('voicevox-settings-section');
  if (browserContainer) browserContainer.style.display = (mode === 'browser') ? 'flex' : 'none';
  if (vvSettings) vvSettings.style.display = (mode === 'voicevox') ? 'block' : 'none';
}

async function fetchVoicevoxAudio(text, speakerId = 1) {
  const url = VOICEVOX_SERVER_URL();
  try {
    // VOICEVOX expects text & speaker as URL query parameters, not JSON body
    const queryParams = new URLSearchParams({ text, speaker: speakerId });
    console.log('VOICEVOX audio_query params:', queryParams.toString());
    const queryResponse = await fetch(`${url}/audio_query?${queryParams}`, {
      method: 'POST',
    });

    if (!queryResponse.ok) throw new Error(`Query failed: ${queryResponse.status}`);
    const queryData = await queryResponse.json();

    // /synthesis expects speaker as URL param, and the full query object as the JSON body
    const synthParams = new URLSearchParams({ speaker: speakerId });
    const synthResponse = await fetch(`${url}/synthesis?${synthParams}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'audio/wav',
      },
      body: JSON.stringify(queryData),
    });

    if (!synthResponse.ok) throw new Error(`Synthesis failed: ${synthResponse.status}`);
    return synthResponse.blob();
  } catch (err) {
    console.error('Voicevox fetch error:', err);
    throw err;
  }
}

async function speakWithVoicevox(text, onEnd) {
  try {
    const speakerId = parseInt(localStorage.getItem('voicevox_speaker')) || 1;
    const blob = await fetchVoicevoxAudio(text, speakerId);

    if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = URL.createObjectURL(blob);
    currentAudio = new Audio(currentAudioUrl);

    const speed = parseFloat(localStorage.getItem('tts_speed') || '0.85');
    currentAudio.playbackRate = speed;

    currentAudio.onplay = () => {
      toggleSpeaking(true);
    };

    currentAudio.onended = () => {
      if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
      currentAudioUrl = null;
      currentAudio = null;
      if (onEnd) onEnd();
    };
    currentAudio.onerror = () => {
      if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
      currentAudioUrl = null;
      currentAudio = null;
      if (onEnd) onEnd();
    };
    currentAudio.play();
  } catch (err) {
    console.error('Voicevox TTS failed, falling back to browser TTS:', err);
    speakWithBrowser(text, onEnd);
  }
}

export async function testVoicevoxConnection() {
  const statusDiv = document.getElementById('voicevox-status');
  const badge = document.getElementById('voicevox-connection-badge');
  const badgeText = document.getElementById('voicevox-connection-text');
  const speakerSelect = document.getElementById('voicevox-speaker-select');
  
  const showStatus = (msg, isError) => {
    if (statusDiv) {
      statusDiv.textContent = msg;
      statusDiv.style.display = 'block';
      statusDiv.className = 'import-status ' + (isError ? 'error' : 'success');
    }
  };

  showStatus('Testing connection...', false);

  try {
    const url = VOICEVOX_SERVER_URL();
    const res = await fetch(`${url}/speakers`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const speakers = await res.json();

    if (badge) {
      badge.className = 'vv-connection-badge connected';
      badgeText.textContent = 'Connected to VOICEVOX';
    }
    
    if (speakerSelect) {
      speakerSelect.replaceChildren();
      let hasSavedSpeaker = false;
      const savedSpeaker = localStorage.getItem('voicevox_speaker') || '1';

      speakers.forEach(speaker => {
        speaker.styles.forEach(style => {
          const opt = document.createElement('option');
          opt.value = style.id;
          opt.textContent = `${speaker.name} (${style.name})`;
          speakerSelect.appendChild(opt);
          if (String(style.id) === String(savedSpeaker)) {
            hasSavedSpeaker = true;
          }
        });
      });
      
      if (hasSavedSpeaker) {
        speakerSelect.value = savedSpeaker;
      } else if (speakerSelect.options.length > 0) {
        speakerSelect.selectedIndex = 0;
        localStorage.setItem('voicevox_speaker', speakerSelect.value);
      }
    }
    showStatus('Connected successfully! Found ' + speakers.length + ' speakers.', false);
  } catch (err) {
    console.error(err);
    if (badge) {
      badge.className = 'vv-connection-badge disconnected';
      badgeText.textContent = 'Not connected';
    }
    let errMsg = 'Could not connect. Is VOICEVOX running?';
    if (err.message.includes('Failed to fetch') || err.name === 'TypeError') {
      errMsg += ' (Check CORS settings)';
    }
    showStatus(errMsg, true);
  }
}

export function saveVoicevoxSpeaker() {
  const select = document.getElementById('voicevox-speaker-select');
  const input = document.getElementById('voicevox-speaker-input');
  if (select && select.value) {
    localStorage.setItem('voicevox_speaker', select.value);
    if (input) input.value = select.value;
  }
}



function speakWithBrowser(text, onEnd) {
  const synth = window.speechSynthesis;
  if (!synth) {
    if (onEnd) onEnd();
    return;
  }

  if (synth.speaking) synth.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'ja-JP';
  utter.rate = 0.85;
  utter.pitch = 1.0;

  const jpVoice = pickJapaneseBrowserVoice();
  if (jpVoice) utter.voice = jpVoice;

  utter.onstart = () => {
    toggleSpeaking(true);
  };
  utter.onend = onEnd;
  utter.onerror = onEnd;
  synth.speak(utter);
}

export function cancelCurrentSpeech() {
  const synth = window.speechSynthesis;
  if (synth && synth.speaking) synth.cancel();

  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio = null;
  }

  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
  }

  try {
    toggleSpeaking(false);
  } catch (_) {}
}

export function speakQuestion(text, onEnd) {
  setStatus('speaking', 'Speaking question…');

  const mode = localStorage.getItem('tts_mode') || 'browser';

  const wrapOnEnd = () => {
    toggleSpeaking(false);
    if (onEnd) onEnd();
  };

  if (mode === 'voicevox') {
    speakWithVoicevox(text, wrapOnEnd);
    return;
  }

  speakWithBrowser(text, wrapOnEnd);
}

function getJapaneseVoices() {
  const synth = window.speechSynthesis;
  return synth ? synth.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith('ja')) : [];
}

function scoreJapaneseBrowserVoice(voice) {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();
  let score = lang === 'ja-jp' ? 20 : 10;
  const preferred = [
    'google 日本語', 'google japanese', 'haruka', 'nanami', 'ichiro', 'ayumi',
    'kyoko', 'otoya', 'sakura', 'japanese', '日本語', 'microsoft',
  ];
  for (const hint of preferred) {
    if (name.includes(hint)) score += 15;
  }
  if (name.includes('english') || name.includes(' us ') || name.includes('uk ')) score -= 100;
  if (name.includes('male') && !name.includes('female')) score += 2;
  return score;
}

function pickJapaneseBrowserVoice() {
  const voices = getJapaneseVoices();
  if (!voices.length) return null;

  const savedUri = localStorage.getItem('browser_tts_voice');
  if (savedUri) {
    const chosen = voices.find(v => v.voiceURI === savedUri);
    if (chosen) return chosen;
  }

  return voices.reduce((best, v) => {
    const score = scoreJapaneseBrowserVoice(v);
    const bestScore = best ? scoreJapaneseBrowserVoice(best) : -1;
    return score > bestScore ? v : best;
  }, null);
}

export function populateBrowserVoiceSelect() {
  const select = document.getElementById('browser-voice-select');
  if (!select) return;

  const synth = window.speechSynthesis;
  if (synth && !select.dataset.voicesBound) {
    synth.getVoices();
    synth.addEventListener('voiceschanged', populateBrowserVoiceSelect, { once: false });
    select.dataset.voicesBound = '1';
  }

  const savedUri = localStorage.getItem('browser_tts_voice') || '';
  const voices = getJapaneseVoices().sort((a, b) => {
    return scoreJapaneseBrowserVoice(b) - scoreJapaneseBrowserVoice(a);
  });

  select.replaceChildren();
  const autoOpt = document.createElement('option');
  autoOpt.value = '';
  autoOpt.textContent = 'Auto — best Japanese voice';
  select.appendChild(autoOpt);

  for (const v of voices) {
    const opt = document.createElement('option');
    opt.value = v.voiceURI;
    opt.textContent = v.name + ' (' + v.lang + ')';
    select.appendChild(opt);
  }

  if (savedUri && voices.some(v => v.voiceURI === savedUri)) {
    select.value = savedUri;
  } else {
    select.value = '';
  }
}
