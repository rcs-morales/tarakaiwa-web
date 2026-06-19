export function showAnswerTranslation(text) {
  const el = document.getElementById('answer-translation');
  if (el) el.innerHTML = text;
}

export function setStatus(state, text) {
  const dot  = document.getElementById('pulse');
  const stxt = document.getElementById('status-text');
  if (dot) dot.className  = 'pulse-dot ' + (state || '');
  if (stxt) stxt.textContent = text;
}

export function showTranscript(text, active) {
  const box = document.getElementById('transcript-box');
  const ph  = document.getElementById('transcript-placeholder');
  const ct  = document.getElementById('transcript-content');
  if (!box || !ph || !ct) return;
  if (text) {
    ph.classList.add('hidden');
    ct.classList.remove('hidden');
    ct.textContent = text;
  } else {
    ph.classList.remove('hidden');
    ct.classList.add('hidden');
    ct.replaceChildren();
  }
  box.classList.toggle('active', !!active);
}

export function showCheckedTranscript(raw, furiganaReading, formatLiveTranscript) {
  const ph  = document.getElementById('transcript-placeholder');
  const ct  = document.getElementById('transcript-content');
  const box = document.getElementById('transcript-box');
  if (!ph || !ct || !box) return;
  ph.classList.add('hidden');
  ct.classList.remove('hidden');
  box.classList.remove('active');

  const heard = document.createElement('div');
  heard.textContent = formatLiveTranscript(raw);

  const userTrans = document.createElement('div');
  userTrans.id = 'user-ans-trans';
  userTrans.className = 'trans-small';

  const checked = document.createElement('div');
  checked.className = 'transcript-furigana';

  const readingLine = document.createElement('div');
  readingLine.textContent = 'Checked (reading): ' + furiganaReading;

  const expTrans = document.createElement('div');
  expTrans.id = 'exp-ans-trans';
  expTrans.className = 'trans-small';

  checked.append(readingLine, expTrans);
  ct.replaceChildren(heard, userTrans, checked);
}

export function updateCheckedTranslation(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = text;
}

export function showResultPanel(visible) {
  const badge = document.getElementById('result-badge');
  if (badge) badge.classList.toggle('hidden', !visible);
}

export function showResult(gradeResult, answer) {
  const badge = document.getElementById('result-badge');
  const icon  = document.getElementById('result-icon');
  const msg   = document.getElementById('result-msg');
  const rev   = document.getElementById('answer-reveal');
  const aiFb  = document.getElementById('ai-feedback');
  if (!badge || !icon || !msg || !rev || !aiFb) return;
  const correct = gradeResult.correct;

  badge.className = 'result-badge ' + (correct ? 'correct' : 'wrong');
  icon.textContent = correct ? '✅' : '❌';
  msg.textContent  = correct ? '正解！ Correct!' : '不正解。 Incorrect.';

  if (!correct && gradeResult.suggestedAnswer) {
    rev.replaceChildren();
    const strong = document.createElement('strong');
    strong.textContent = 'Expected answer: ';
    const text = document.createTextNode(gradeResult.suggestedAnswer || answer);
    const link = document.createElement('a');
    link.href = `https://translate.google.com/?sl=ja&tl=en&text=${encodeURIComponent(gradeResult.suggestedAnswer || answer)}&op=translate`;
    link.target = '_blank';
    link.textContent = ' 🌐 Translate';
    link.title = 'Translate answer';
    link.className = 'translate-link';
    rev.append(strong, text, link);
  } else {
    rev.replaceChildren();
    const strong = document.createElement('strong');
    strong.textContent = correct ? 'Expected answer: ' : 'Expected: ';
    const text = document.createTextNode(answer);
    const link = document.createElement('a');
    link.href = `https://translate.google.com/?sl=ja&tl=en&text=${encodeURIComponent(answer)}&op=translate`;
    link.target = '_blank';
    link.textContent = ' 🌐 Translate';
    link.title = 'Translate answer';
    link.className = 'translate-link';
    rev.append(strong, text, link);
  }

  aiFb.replaceChildren();
  if (gradeResult.source !== 'local' && gradeResult.feedback) {
    const fbText = document.createElement('div');
    fbText.className = 'ai-feedback-text';
    fbText.textContent = '🤖 ' + gradeResult.feedback;
    aiFb.appendChild(fbText);

    const notes = document.createElement('div');
    notes.className = 'ai-feedback-notes';

    const noteTypes = [
      { label: 'Grammar', text: gradeResult.grammarNotes },
      { label: 'Particles', text: gradeResult.particleNotes },
      { label: 'Vocab', text: gradeResult.vocabularyNotes },
    ];

    for (const nt of noteTypes) {
      if (nt.text && nt.text.toLowerCase() !== 'none' && nt.text.trim()) {
        const note = document.createElement('div');
        note.className = 'ai-note';
        const lbl = document.createElement('span');
        lbl.className = 'ai-note-label';
        lbl.textContent = nt.label;
        const txt = document.createElement('span');
        txt.className = 'ai-note-text';
        txt.textContent = nt.text;
        note.append(lbl, txt);
        notes.appendChild(note);
      }
    }

    if (notes.children.length > 0) {
      aiFb.appendChild(notes);
    }
  } else if (gradeResult.source === 'local') {
    const fbText = document.createElement('div');
    fbText.className = 'ai-feedback-text';
    fbText.textContent = '⚙️ ' + gradeResult.feedback + ' (AI unavailable — used local matching)';
    aiFb.appendChild(fbText);
  }
}

export function showBtn(id, visible) {
  const btn = document.getElementById(id);
  if (btn) btn.classList.toggle('hidden', !visible);
}

export function updateQACount(count) {
  const chip = document.getElementById('qa-count-chip');
  if (!chip) return;
  chip.textContent = count > 0
    ? '🗂 ' + count + ' Question' + (count !== 1 ? 's' : '')
    : '🗂 No Questions Loaded';
}

export function updateStartButton(count) {
  const btn = document.getElementById('btn-start-practice');
  if (!btn) return;
  if (count === 0) {
    btn.disabled = true;
    btn.textContent = '⏳ Import a Q&A database to begin';
    btn.classList.add('btn-disabled');
  } else {
    btn.disabled = false;
    btn.textContent = '▶ Start Practice';
    btn.classList.remove('btn-disabled');
  }
}

export function updateSetupAccess(setupComplete) {
  const entry = document.getElementById('setup-entry-point');
  const reopen = document.getElementById('setup-return-point');
  if (!entry || !reopen) return;

  if (setupComplete) {
    entry.classList.add('hidden');
    reopen.classList.remove('hidden');
  } else {
    entry.classList.remove('hidden');
    reopen.classList.add('hidden');
  }
}

export function showImportStatus(message, type) {
  const statusDiv = document.getElementById('import-status');
  if (!statusDiv) return;
  statusDiv.textContent = message;
  statusDiv.className = 'import-status ' + type;
  if (type !== 'info') {
    setTimeout(() => {
      statusDiv.className = 'import-status';
    }, 5000);
  }
}

export function showApiKeyStatus(message, type) {
  const statusDiv = document.getElementById('api-key-status');
  if (!statusDiv) return;
  statusDiv.textContent = message;
  statusDiv.className = 'import-status ' + type;
  if (type !== 'info') {
    setTimeout(() => { statusDiv.className = 'import-status'; }, 5000);
  }
}
export function toggleKeyVisibility() {
  const input = document.getElementById('api-key-input');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

export function showScreen(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

export function hideScreen(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

export function showStartScreen() {
  hideScreen('screen-practice');
  hideScreen('screen-results');
  showScreen('screen-start');
}

export function showPracticeScreen() {
  hideScreen('screen-start');
  hideScreen('screen-results');
  showScreen('screen-practice');
}

export function showResultsScreen() {
  hideScreen('screen-start');
  hideScreen('screen-practice');
  showScreen('screen-results');
}

// ── Voicevox Batch Preload Modal ──

let _preloadSkipResolve = null;

export function showVoicevoxPreloadModal(total) {
  if (document.getElementById('vv-preload-overlay')) return Promise.resolve();

  const overlay = document.createElement('div');
  overlay.id = 'vv-preload-overlay';
  overlay.className = 'vv-loading-overlay';
  overlay.innerHTML = `
    <div class="vv-loading-card">
      <div class="vv-spinner"></div>
      <h3>☁️ Preparing Cloud Voices…</h3>
      <p>Preloading all audio so practice runs smoothly.</p>
      <div class="vv-preload-progress-track">
        <div class="vv-preload-progress-fill" id="vv-preload-fill"></div>
      </div>
      <div class="vv-preload-count" id="vv-preload-count">Loading voice 0 / ${total}…</div>
      <button class="vv-preload-skip" id="vv-preload-skip">Skip — load per question instead</button>
    </div>
  `;
  document.body.appendChild(overlay);

  return new Promise(resolve => {
    _preloadSkipResolve = resolve;
    document.getElementById('vv-preload-skip').addEventListener('click', () => {
      resolve('skipped');
    });
  });
}

export function updateVoicevoxPreloadProgress(completed, total, message) {
  const fill = document.getElementById('vv-preload-fill');
  const count = document.getElementById('vv-preload-count');
  if (fill) fill.style.width = Math.round((completed / total) * 100) + '%';
  if (count) count.textContent = message || `Loading voice ${completed} / ${total}…`;
}

export function hideVoicevoxPreloadModal() {
  const overlay = document.getElementById('vv-preload-overlay');
  if (overlay) overlay.remove();
  _preloadSkipResolve = null;
}
