<script>
  // "Speak in Japanese" tool: the 🔊 float button and its draggable,
  // resizable panel. State and the translate/mic flows live in
  // translate.svelte.js. IDs and classes match the old hand-built markup so
  // the global styles still apply.
  import { onMount, tick } from 'svelte';
  import {
    translate, SOURCE_LANGUAGES, loadSourceLanguage, setSourceLanguage,
    translateAndSpeak, replayJapaneseAudio, toggleMic, closeTranslateTool,
  } from '$lib/translate.svelte.js';
  import { makeDraggable, makeResizable, positionPanelAboveButton } from '$lib/panel.js';
  import { toFuriganaHtml } from '$lib/parser.js';
  import { sanitizeHtml } from '$lib/sanitize.js';

  /** @type {HTMLButtonElement} */ let floatBtn;
  /** @type {HTMLDivElement} */ let panel;
  /** @type {HTMLDivElement} */ let header;
  /** @type {HTMLDivElement} */ let resizer;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let transitionTimer;

  // Furigana markup built from model output: keep only <ruby>/<rt>.
  const japaneseHtml = $derived(
    translate.result
      ? sanitizeHtml(toFuriganaHtml(translate.result.japanese, translate.result.romaji), { allow: ['ruby', 'rt'] })
      : ''
  );

  onMount(() => {
    loadSourceLanguage();
    const cleanups = [
      makeDraggable(floatBtn, floatBtn),
      makeDraggable(panel, header),
      makeResizable(panel, resizer, { minWidth: 280, minHeight: 280 }),
    ];
    return () => {
      clearTimeout(transitionTimer);
      cleanups.forEach((fn) => fn());
    };
  });

  async function toggle() {
    if (translate.open) {
      closeTranslateTool();
      return;
    }
    loadSourceLanguage();
    translate.open = true;
    await tick();
    // Position once visible so the real size is used and the on-screen clamp works.
    const el = panel;
    if (!el) return;
    positionPanelAboveButton(el, floatBtn, { width: 360, height: 420 });
    clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => { el.style.transition = ''; }, 10);
  }

  /** @param {KeyboardEvent} e */
  function onKeydown(e) {
    // Enter translates; Shift+Enter is a newline; Enter while an IME is
    // composing confirms the conversion instead.
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      translateAndSpeak();
    }
  }
</script>

<button
  bind:this={floatBtn}
  id="btn-translate-tool"
  class="btn-translate-float"
  title="Speak in Japanese"
  onclick={toggle}
>🔊</button>

<div bind:this={panel} id="translate-tool-panel" class="ai-panel translate-panel" class:hidden={!translate.open}>
  <div bind:this={header} class="ai-panel-header translate-panel-header">
    <span>🔊 Speak in Japanese</span>
    <button id="btn-close-translate" class="btn-close-ai" onclick={closeTranslateTool}>✕</button>
  </div>
  <div class="translate-tool-body">
    <p class="translate-tool-hint">Type or speak any phrase to hear it in Japanese.</p>
    <div class="translate-source-lang-row" style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
      <label for="translate-source-lang" style="font-size: 0.85rem; font-weight: bold;">Source:</label>
      <select
        id="translate-source-lang"
        style="padding: 2px; border-radius: 4px; background: var(--paper-2); color: var(--text); border: 1px solid var(--border);"
        value={translate.sourceLang}
        onchange={(e) => setSourceLanguage(e.currentTarget.value)}
      >
        {#each SOURCE_LANGUAGES as lang}
          <option value={lang}>{lang}</option>
        {/each}
      </select>
    </div>
    <textarea
      id="translate-input"
      class="translate-input"
      rows="3"
      placeholder="e.g. Hello, how are you?"
      bind:value={translate.input}
      onkeydown={onKeydown}
    ></textarea>
    <div
      id="translate-status"
      class="translate-status"
      class:info={translate.status.type === 'info'}
      class:success={translate.status.type === 'success'}
      class:error={translate.status.type === 'error'}
    >{translate.status.message}</div>
    <div class="translate-tool-actions ai-panel-input">
      <button
        id="btn-translate-mic"
        class="btn-ai-mic"
        class:recording={translate.recording}
        title={translate.recording ? 'Stop recording' : 'Speak your phrase'}
        onclick={toggleMic}
      >🎤</button>
      <button
        id="btn-translate-speak"
        class="btn-ai-send"
        disabled={translate.speaking}
        onclick={translateAndSpeak}
      >Translate &amp; Speak</button>
    </div>
    <div id="translate-result-area" class="translate-result-area" class:hidden={!translate.result}>
      <div class="translate-result-label">Japanese</div>
      <div id="translate-result-text" class="translate-result-text">
        {#if translate.result}
          <!-- Sanitized above: <ruby>/<rt> only, no attributes. -->
          <div class="jp-text">{@html japaneseHtml}</div>
          <div class="romaji-text" style="font-size: 0.9em; color: var(--muted); margin-top: 4px;">{translate.result.romaji}</div>
          {#if translate.result.english}
            <div id="translate-result-en" class="translate-result-en">{translate.result.english}</div>
          {/if}
        {/if}
      </div>
      <button id="btn-translate-replay" class="btn btn-secondary btn-sm" onclick={replayJapaneseAudio}>🔊 Replay</button>
    </div>
  </div>
  <div bind:this={resizer} class="ai-panel-resizer"></div>
</div>
