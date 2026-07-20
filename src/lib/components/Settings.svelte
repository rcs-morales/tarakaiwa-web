<script>
  // Settings tab (Phase 5f) — beginner-friendly grouped preferences per the
  // Kaiwa Quest handoff: profile card, learning-aid toggles, practice card
  // (speed slider + daily-goal stepper + shuffle), with every pre-existing
  // control tucked into the Advanced disclosure. CRITICAL: app.js, quota.js,
  // tts.js, avatar.js and groqClient.js drive the advanced controls
  // imperatively by id at mount, so the disclosure hides with CSS only —
  // its contents are always in the DOM, never behind an {#if}.
  import { history } from '$lib/history.svelte.js';
  import { computeXP } from '$lib/gamification.svelte.js';
  import { prefs, setAid, setDailyGoal, DAILY_GOAL_MIN, DAILY_GOAL_MAX } from '$lib/prefs.svelte.js';
  import { profile, DEFAULT_AVATAR, avatarSrc, applyAvatarChange } from '$lib/profile.svelte.js';
  import AvatarModal from './AvatarModal.svelte';

  const xp = $derived(computeXP(history.entries));

  let advancedOpen = $state(false);
  let avatarModalOpen = $state(false);

  // Only signed-in users with an actual stored photo get a remove option —
  // nothing to remove for a guest or a user already on the placeholder.
  const canRemoveAvatar = $derived(!!profile.user && !!profile.avatarUrl);

  const displayName = $derived(profile.user?.email ? profile.user.email.split('@')[0] : 'ゲスト · Guest');

  // "Edit" opens the Advanced disclosure and brings the account card into view.
  function editProfile() {
    advancedOpen = true;
    requestAnimationFrame(() =>
      document.getElementById('setup-step-account')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  // Tapping the avatar opens the change-avatar modal for signed-in users;
  // signed-out users get the same nudge toward Account as the Edit button
  // (a modal that could only fail isn't useful to them).
  function pickAvatar() {
    if (!profile.user) { editProfile(); return; }
    avatarModalOpen = true;
  }

  // Single source of truth for signing out is the handler app.js bound to
  // #btn-sign-out (sign out + sync teardown + status message).
  function signOut() {
    document.getElementById('btn-sign-out')?.click();
  }

  const AIDS = [
    { name: 'furigana', jp: 'ふりがな', en: 'Furigana', hint: 'Kana readings above kanji' },
    { name: 'romaji', jp: 'ローマ字', en: 'Romaji', hint: 'Latin letters under the target answer' },
    { name: 'enHints', jp: '英語ヒント', en: 'English hints', hint: 'Translate links and answer translations' },
  ];
</script>

<div class="settings-screen">
  <h2 class="settings-title">設定 <span class="settings-title-en">· Settings</span></h2>
  <p class="settings-subtitle">Tune your practice — the essentials up top, everything else under Advanced.</p>

  <!-- ── Profile ── -->
  <div class="settings-card profile-card">
    <button type="button" class="avatar-btn" onclick={pickAvatar} aria-label="Change profile picture">
      <img class="profile-avatar" src={avatarSrc()} alt="" />
    </button>
    <div class="profile-info">
      <div class="profile-name">{displayName}</div>
      <div class="profile-meta">Lv {xp.level} · {xp.title} · {xp.totalXP} XP</div>
    </div>
    <button class="profile-edit-pill" onclick={editProfile}>Edit</button>
  </div>
  {#if avatarModalOpen}
    <AvatarModal
      initialSrc={avatarSrc()}
      hasAvatar={canRemoveAvatar}
      defaultAvatar={DEFAULT_AVATAR}
      onchange={applyAvatarChange}
      onclose={() => (avatarModalOpen = false)}
    />
  {/if}

  <!-- ── Learning aids ── -->
  <div class="settings-card">
    <div class="settings-card-label">Learning aids</div>
    {#each AIDS as aid (aid.name)}
      <div class="setting-row">
        <div class="setting-row-text">
          <div class="setting-row-name">{aid.jp} <span class="setting-row-en">· {aid.en}</span></div>
          <div class="setting-row-hint">{aid.hint}</div>
        </div>
        <label class="switch">
          <input
            type="checkbox"
            checked={prefs[aid.name]}
            onchange={(e) => setAid(aid.name, e.currentTarget.checked)}
          />
          <span class="switch-track" aria-hidden="true"></span>
        </label>
      </div>
    {/each}
  </div>

  <!-- ── Practice ── -->
  <div class="settings-card">
    <div class="settings-card-label">Practice</div>

    <div class="setting-row setting-row-stack">
      <div class="setting-row-text">
        <div class="setting-row-name">🐢 Speaking speed <span class="speed-value" id="tts-speed-value">0.85×</span></div>
        <div class="setting-row-hint">How fast questions are spoken — 1.0× is natural speed. Feedback always plays at natural speed.</div>
      </div>
      <input type="range" class="speed-slider" id="tts-speed-slider" min="0.5" max="1.5" step="0.05" value="0.85" />
    </div>

    <div class="setting-row">
      <div class="setting-row-text">
        <div class="setting-row-name">⭐ Daily goal</div>
        <div class="setting-row-hint">Sessions per day to fill your goal stars</div>
      </div>
      <div class="stepper">
        <button class="stepper-btn" aria-label="Decrease daily goal"
          disabled={prefs.dailyGoal <= DAILY_GOAL_MIN}
          onclick={() => setDailyGoal(prefs.dailyGoal - 1)}>−</button>
        <span class="stepper-value">{prefs.dailyGoal}</span>
        <button class="stepper-btn stepper-btn-up" aria-label="Increase daily goal"
          disabled={prefs.dailyGoal >= DAILY_GOAL_MAX}
          onclick={() => setDailyGoal(prefs.dailyGoal + 1)}>＋</button>
      </div>
    </div>

  </div>

  <!-- ── Advanced disclosure ── -->
  <button class="advanced-toggle" aria-expanded={advancedOpen} onclick={() => (advancedOpen = !advancedOpen)}>
    <span class="advanced-toggle-text">
      <span class="setting-row-name">詳細設定 <span class="setting-row-en">· Advanced</span></span>
      <span class="setting-row-hint">Account, AI model, voice &amp; quotas</span>
    </span>
    <span class="advanced-chevron" class:open={advancedOpen} aria-hidden="true">▾</span>
  </button>

  <div class="advanced-body" class:open={advancedOpen}>

    <!-- Account & Sync -->
    <div class="settings-section" id="setup-step-account">
      <h3>👤 Account &amp; Sync</h3>
      <p style="font-size: 0.85rem; color: var(--muted);">
        Sign in to sync your settings, decks and scores across devices. Optional —
        the app works fully offline without an account.
      </p>

      <div id="account-signed-out">
        <form class="api-key-row" id="magic-link-form" style="margin-top: 8px;">
          <input type="email" id="account-email-input" class="api-key-input"
            placeholder="you@example.com" autocomplete="email" />
        </form>
        <div class="import-buttons" style="margin-top: 8px;">
          <button class="btn btn-import" id="btn-send-magic-link">📧 Send Magic Link</button>
          <button class="btn btn-secondary" id="btn-google-signin">Continue with Google</button>
        </div>
        <p style="font-size: 0.72rem; color: var(--muted); margin-top: 6px;">
          We'll email you a one-time sign-in link — no password required.
        </p>
      </div>

      <div id="account-signed-in" class="hidden" style="margin-top: 8px;">
        <p style="font-size: 0.9rem;">Signed in as <strong id="account-email-display">—</strong></p>
        <button class="btn btn-secondary" id="btn-sign-out" style="margin-top: 8px;">Sign Out</button>
      </div>

      <div class="import-status" id="account-status-msg"></div>
    </div>

    <!-- AI Grading (Groq) -->
    <div class="settings-section" id="setup-step-api-key">
      <h3>🧠 AI Answer Grading (Groq)</h3>
      <p><strong>Optional — the app works signed in without a key.</strong> Add your own Groq API key to
        bypass the shared daily quota and use your own allowance. Signed-in users without a key
        share a daily limit (200 chat requests, 600 Whisper-seconds).</p>
      <p style="font-size: 0.75rem; color: var(--muted); margin-bottom: 8px;">
        Get a free API key at <a href="https://console.groq.com/keys" target="_blank" style="color: var(--teal);">Groq
          Console</a> or <a href="groq-guide.html" style="color: var(--teal); text-decoration: underline;">follow our setup guide</a>.
      </p>
      <form class="api-key-row" id="api-key-form">
        <input type="password" id="api-key-input" class="api-key-input" placeholder="Paste your API key here…"
          autocomplete="off" />
        <button type="button" class="btn btn-secondary btn-sm" id="btn-toggle-key"
          title="Show/hide key">👁</button>
      </form>
      <div class="import-buttons" style="margin-top: 8px;">
        <button class="btn btn-import" id="btn-save-api">Save Key</button>
        <button class="btn btn-secondary" id="btn-test-api">Test Connection</button>
        <button class="btn btn-secondary" id="btn-clear-api">Clear Key</button>
      </div>
      <div class="import-status" id="api-key-status"></div>

      <!-- Shared daily quota — shown only when signed in without a BYO key;
           populated by quota.js updateQuotaDisplay(). -->
      <div id="quota-panel" class="quota-panel hidden">
        <div class="quota-panel-head">
          <span class="quota-panel-title">📊 Today's shared quota</span>
          <span class="quota-panel-note">resets daily</span>
        </div>
        <div class="quota-meter">
          <div class="quota-meter-label">
            <span>💬 Chat requests</span>
            <span id="quota-chat-count" class="quota-meter-count">—</span>
          </div>
          <div class="quota-bar-track"><div id="quota-chat-fill" class="quota-bar-fill"></div></div>
        </div>
        <div class="quota-meter">
          <div class="quota-meter-label">
            <span>🎤 Speech seconds</span>
            <span id="quota-whisper-count" class="quota-meter-count">—</span>
          </div>
          <div class="quota-bar-track"><div id="quota-whisper-fill" class="quota-bar-fill"></div></div>
        </div>
        <p class="quota-panel-hint">
          Shared allowance for signed-in users without a key. Add your own Groq key above to use your personal allowance instead.
        </p>
      </div>

      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
        <label for="jlpt-level-select" style="font-size: 0.85rem; font-weight: bold; margin-right: 8px;">Default Level for New Decks:</label>
        <select id="jlpt-level-select"
          style="padding: 4px; border-radius: 4px; border: 1px solid var(--border); background: var(--paper-2); color: var(--text);">
          <option value="N5">N5 (Beginner)</option>
          <option value="N4">N4 (Upper beginner)</option>
          <option value="N3">N3 (Intermediate)</option>
        </select>
        <p style="font-size: 0.72rem; color: var(--muted); margin-top: 6px;">
          Pre-fills the level when you create a new deck. Grading strictness always follows
          each deck's own level instead — change it per-deck from the Decks tab.
        </p>
      </div>
      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
        <label for="grading-model-select" style="font-size: 0.85rem; font-weight: bold; margin-right: 8px;">Grading Speed:</label>
        <select id="grading-model-select"
          style="padding: 4px; border-radius: 4px; border: 1px solid var(--border); background: var(--paper-2); color: var(--text);">
          <option value="openai/gpt-oss-120b">Balanced — Better accuracy (GPT OSS 120B)</option>
          <option value="openai/gpt-oss-20b">Fast — Quicker feedback (GPT OSS 20B)</option>
        </select>
        <p style="font-size: 0.72rem; color: var(--muted); margin-top: 4px;">
          Fast mode returns grading results sooner; Balanced mode is more reliable for nuanced answers.
        </p>
      </div>
    </div>

    <!-- Voice & Avatar -->
    <div class="settings-section" id="setup-step-settings">
      <h3>🔊 Voice &amp; Avatar</h3>
      <div style="margin-bottom: 12px;">
        <label for="stt-mode-select" style="font-size: 0.85rem; font-weight: bold; margin-right: 8px;">Speech Recognition:</label>
        <select id="stt-mode-select"
          style="padding: 4px; border-radius: 4px; border: 1px solid var(--border); background: var(--paper-2); color: var(--text);">
          <option value="ai">🧠 AI (Groq Whisper) — Best accuracy</option>
          <option value="browser">🌐 Browser Built-in — Live preview</option>
        </select>
        <p style="font-size: 0.72rem; color: var(--muted); margin-top: 4px;">
          AI mode uses Groq Whisper for Japanese recognition. Requires a Groq API key above.
        </p>
      </div>
      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
        <label for="tts-mode-select" style="font-size: 0.85rem; font-weight: bold; margin-right: 8px;">Text-to-Speech (TTS):</label>
        <select id="tts-mode-select"
          style="padding: 4px; border-radius: 4px; border: 1px solid var(--border); background: var(--paper-2); color: var(--text);">
          <option value="browser" selected>🌐 Browser Built-in — Local, instant</option>
          <option value="voicevox">🎙️ VOICEVOX — Cloud, High Quality</option>
        </select>
      </div>
      <div id="voicevox-settings-section"
        style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
        <label for="voicevox-speaker-select" style="font-size: 0.85rem; font-weight: bold; margin-right: 8px;">Cloud Voice:</label>
        <select id="voicevox-speaker-select"
          style="padding: 4px; border-radius: 4px; border: 1px solid var(--border); background: var(--paper-2); color: var(--text); max-width: 100%;">
          <optgroup label="Clear Female Voices">
            <option value="3">Zundamon (Neutral & Clear)</option>
            <option value="2">Shikoku Metan (Bright & Friendly)</option>
            <option value="8">Kasukabe Tsumugi (Calm)</option>
            <option value="46">Sayo (Standard Announcer)</option>
          </optgroup>
          <optgroup label="Clear Male Voices">
            <option value="13">Aoyama Ryusei (Standard Young Male)</option>
            <option value="12">Shirakami Kotarou (Friendly & Energetic)</option>
            <option value="11">Takehiro (Mature Male)</option>
          </optgroup>
        </select>
        <input type="hidden" id="voicevox-speaker-input" />
        <p style="font-size: 0.72rem; color: var(--muted); margin-top: 4px; line-height: 1.4;">
          Audio is generated instantly via the free community <strong>api.tts.quest</strong> service.
        </p>
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border);">
          <div class="voicepack-row">
            <span style="font-size: 0.82rem;">📦 Voice pack: <span id="voicepack-status">—</span></span>
            <button id="btn-download-voicepack" class="btn btn-secondary btn-sm" style="font-size: 0.75rem;">⬇ Download all</button>
          </div>
          <div id="voicepack-progress" class="voicepack-progress hidden">
            <div class="voicepack-progress-track">
              <div id="voicepack-progress-fill" class="voicepack-progress-fill"></div>
            </div>
          </div>
          <p style="font-size: 0.72rem; color: var(--muted); margin-top: 4px; line-height: 1.4;">
            Download once on good wifi to practice without waiting on cloud audio (audio also downloads quietly in the background during practice).
          </p>
        </div>
        <button id="btn-clear-audio-cache" class="btn btn-secondary" style="margin-top: 8px; font-size: 0.75rem;">🗑️ Clear Audio Cache</button>
      </div>
      <div id="avatar-settings-section" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
        <label for="avatar-model-select" style="font-size: 0.85rem; font-weight: bold; margin-right: 8px;">Avatar model:</label>
        <select id="avatar-model-select"
          style="padding: 4px; border-radius: 4px; border: 1px solid var(--border); background: var(--paper-2); color: var(--text);">
          <option value="simple">Simple (Female)</option>
          <option value="chitose">Chitose (Male)</option>
          <option value="epsilon">Epsilon (Female)</option>
          <option value="haru">Haru Greeter (Female)</option>
        </select>
        <p style="font-size: 0.72rem; color: var(--muted); margin-top: 4px;">
          Choose the Live2D avatar you want to use when practice starts.
        </p>
      </div>
    </div>

    <!-- Reset Progress (Danger Zone) -->
    <div class="settings-section settings-danger-zone" id="setup-step-reset">
      <h3>🔄 Reset Progress</h3>
      <p style="font-size: 0.85rem; color: var(--muted);">
        Erase all session history, XP, level, streak, daily goals, and score
        stats. Your settings, deck, and account are <strong>not</strong> affected.
      </p>
      <button class="btn btn-danger" id="btn-reset-progress">Reset All Progress</button>
      <div class="import-status" id="reset-progress-status"></div>
    </div>

  </div>

  {#if profile.user}
    <button class="btn btn-secondary signout-btn" onclick={signOut}>サインアウト · Sign out</button>
  {/if}
</div>

<style>
  .settings-title {
    font-size: 1.35rem;
    font-weight: 800;
    margin: 2px 0 2px;
  }

  .settings-title-en {
    color: var(--muted);
    font-weight: 700;
    font-size: 1rem;
  }

  .settings-subtitle {
    color: var(--muted);
    font-size: 0.85rem;
    margin: 0 0 14px;
  }

  .settings-card {
    background: var(--surface);
    border: 2px solid var(--card-border);
    border-radius: 20px;
    padding: 14px 16px;
    margin-bottom: 14px;
  }

  .settings-card-label {
    font-size: 0.69rem;
    letter-spacing: 0.14em;
    font-weight: 800;
    color: var(--primary);
    text-transform: uppercase;
    margin-bottom: 2px;
  }

  /* ── Profile card ── */
  .profile-card {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .avatar-btn {
    padding: 0;
    border: none;
    background: none;
    border-radius: 50%;
    cursor: pointer;
    line-height: 0;
    flex: 0 0 auto;
  }

  .profile-avatar {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    object-fit: cover;
    object-position: top;
    background: var(--primary-tint);
    border: 2px solid var(--card-border);
  }

  .profile-info {
    min-width: 0;
    flex: 1;
  }

  .profile-name {
    font-weight: 800;
    font-size: 0.98rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-meta {
    font-size: 0.76rem;
    color: var(--muted-2);
    margin-top: 2px;
  }

  .profile-edit-pill {
    flex: 0 0 auto;
    padding: 7px 14px;
    min-height: 32px;
    border: 1.5px solid var(--card-border);
    border-radius: 999px;
    background: var(--surface-alt);
    color: var(--ink-mid);
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
  }

  .profile-edit-pill:hover {
    background: var(--surface-hover);
  }

  /* ── Setting rows (dashed dividers) ── */
  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 0;
  }

  .setting-row + .setting-row {
    border-top: 1.5px dashed var(--faint);
  }

  .setting-row-stack {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .setting-row-text {
    min-width: 0;
  }

  .setting-row-name {
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--text);
  }

  .setting-row-en {
    color: var(--muted);
    font-weight: 700;
    font-size: 0.8rem;
  }

  .setting-row-hint {
    font-size: 0.72rem;
    color: var(--muted);
    margin-top: 2px;
    line-height: 1.4;
  }

  /* ── Toggle switch (46×27 pill per the handoff) ── */
  .switch {
    position: relative;
    flex: 0 0 auto;
    display: inline-block;
    width: 46px;
    height: 27px;
    cursor: pointer;
  }

  .switch input {
    position: absolute;
    opacity: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    cursor: pointer;
  }

  .switch-track {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    background: var(--toggle-off);
    transition: background 0.15s ease;
    pointer-events: none;
  }

  .switch-track::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 21px;
    height: 21px;
    border-radius: 50%;
    background: var(--surface);
    box-shadow: 0 1px 2px rgba(61, 46, 38, 0.25);
    transition: transform 0.15s ease;
  }

  .switch input:checked + .switch-track {
    background: var(--primary);
  }

  .switch input:checked + .switch-track::after {
    transform: translateX(19px);
  }

  .switch input:focus-visible + .switch-track {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  /* ── Speaking speed slider ── */
  .speed-value {
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 0.82rem;
    color: var(--primary);
    margin-left: 6px;
  }

  .speed-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 24px;
    background: transparent;
  }

  .speed-slider::-webkit-slider-runnable-track {
    height: 8px;
    border-radius: 999px;
    background: var(--faint);
  }

  .speed-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 22px;
    height: 22px;
    margin-top: -7px;
    border-radius: 50%;
    background: var(--surface);
    border: 5px solid var(--primary);
    box-shadow: 0 1px 3px rgba(61, 46, 38, 0.3);
    cursor: pointer;
  }

  .speed-slider::-moz-range-track {
    height: 8px;
    border-radius: 999px;
    background: var(--faint);
  }

  .speed-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--surface);
    border: 5px solid var(--primary);
    box-shadow: 0 1px 3px rgba(61, 46, 38, 0.3);
    cursor: pointer;
  }

  /* ── Daily goal stepper ── */
  .stepper {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: 0 0 auto;
    border: 1.5px solid var(--card-border);
    border-radius: 999px;
    background: var(--surface-alt);
    padding: 2px;
  }

  .stepper-btn {
    width: 34px;
    height: 34px;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--muted);
    font-size: 1.05rem;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
  }

  .stepper-btn-up {
    color: var(--primary);
  }

  .stepper-btn:hover:not(:disabled) {
    background: var(--surface-hover);
  }

  .stepper-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .stepper-value {
    min-width: 2ch;
    text-align: center;
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 0.95rem;
  }

  /* ── Advanced disclosure ── */
  .advanced-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    text-align: left;
    background: var(--surface);
    border: 2px solid var(--card-border);
    border-radius: 20px;
    padding: 14px 16px;
    margin-bottom: 14px;
    cursor: pointer;
  }

  .advanced-toggle:hover {
    background: var(--surface-alt);
  }

  .advanced-toggle-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .advanced-chevron {
    color: var(--muted);
    font-size: 1rem;
    transition: transform 0.15s ease;
  }

  .advanced-chevron.open {
    transform: rotate(180deg);
  }

  /* CSS-only hide — the imperative modules need these nodes in the DOM at
     mount, and quota.js keeps writing to them while collapsed. */
  .advanced-body {
    display: none;
  }

  .advanced-body.open {
    display: block;
  }

  /* ── Voice pack download row ── */
  .voicepack-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Push the Download-all button to the right of the status label. */
  .voicepack-row :global(#btn-download-voicepack) {
    margin-left: auto;
  }

  .voicepack-progress {
    margin-top: 8px;
  }

  .voicepack-progress-track {
    height: 8px;
    background: var(--faint);
    border-radius: 999px;
    overflow: hidden;
  }

  .voicepack-progress-fill {
    height: 100%;
    width: 0%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--xp-grad-1), var(--xp-grad-2));
    transition: width 0.3s ease;
  }

  /* ── Shared quota usage bars ── */
  .quota-panel {
    margin-top: 12px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface-alt);
  }

  .quota-panel-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .quota-panel-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text);
  }

  .quota-panel-note {
    font-size: 0.66rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .quota-meter + .quota-meter {
    margin-top: 10px;
  }

  .quota-meter-label {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    font-size: 0.76rem;
    color: var(--ink-mid);
    margin-bottom: 4px;
  }

  .quota-meter-count {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--muted);
  }

  .quota-bar-track {
    height: 8px;
    background: var(--faint);
    border-radius: 999px;
    overflow: hidden;
  }

  .quota-bar-fill {
    height: 100%;
    width: 0%;
    border-radius: 999px;
    background: var(--success);
    transition: width 0.3s ease, background-color 0.3s ease;
  }

  .quota-panel-hint {
    font-size: 0.7rem;
    color: var(--muted);
    line-height: 1.4;
    margin-top: 10px;
  }

  /* ── Sign out ── */
  .signout-btn {
    display: block;
    width: 100%;
    color: var(--red);
    font-weight: 800;
  }
</style>
