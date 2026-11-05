<script>
  // AI Study Assistant: the 📚 float button and its draggable, resizable chat
  // panel. State and the ask flow live in assistant.svelte.js. IDs and classes
  // match the old hand-built markup so the global styles still apply.
  import { onMount, tick } from 'svelte';
  import { assistant, askAssistant } from '#lib/assistant.svelte.js';
  import { makeDraggable, makeResizable, positionPanelAboveButton } from '#lib/panel.js';

  /** @type {HTMLButtonElement} */ let floatBtn;
  /** @type {HTMLDivElement} */ let panel;
  /** @type {HTMLDivElement} */ let header;
  /** @type {HTMLDivElement} */ let resizer;
  /** @type {HTMLDivElement} */ let historyBox;

  let input = $state('');
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let transitionTimer;

  onMount(() => {
    const cleanups = [
      makeDraggable(floatBtn, floatBtn),
      makeDraggable(panel, header),
      makeResizable(panel, resizer),
    ];
    return () => {
      clearTimeout(transitionTimer);
      cleanups.forEach((fn) => fn());
    };
  });

  async function toggle() {
    if (assistant.open) {
      assistant.open = false;
      return;
    }
    assistant.open = true;
    await tick();
    // Position once visible so the real size is used and the on-screen clamp works.
    const el = panel;
    if (!el) return;
    positionPanelAboveButton(el, floatBtn, { width: 360, height: 500 });
    // Re-enable the open/close transition once the jump to the new spot has painted.
    clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => { el.style.transition = ''; }, 10);
  }

  function send() {
    const query = input.trim();
    if (!query || assistant.busy) return;
    input = '';
    askAssistant(query);
  }

  /** @param {KeyboardEvent} e */
  function onKeydown(e) {
    // Enter while an IME is composing confirms the kana/kanji conversion, not the message.
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      send();
    }
  }

  // Keep the newest message in view.
  $effect(() => {
    // Track the message list and the last message's content.
    const last = assistant.messages[assistant.messages.length - 1];
    void last?.text, void last?.html, void assistant.messages.length;
    if (historyBox) historyBox.scrollTop = historyBox.scrollHeight;
  });
</script>

<button
  bind:this={floatBtn}
  id="btn-ai-assistant"
  class="btn-ai-float"
  title="AI Study Assistant"
  onclick={toggle}
>📚</button>

<div bind:this={panel} id="ai-assistant-panel" class="ai-panel" class:hidden={!assistant.open}>
  <div bind:this={header} class="ai-panel-header">
    <span>🤖 AI Study Assistant</span>
    <button id="btn-close-ai" class="btn-close-ai" onclick={() => (assistant.open = false)}>✕</button>
  </div>
  <div bind:this={historyBox} id="ai-chat-history" class="ai-chat-history">
    {#each assistant.messages as msg}
      <div class="ai-msg {msg.role}">
        {#if msg.html != null}
          <!-- Sanitized in formatAssistantReply: allowlisted tags only, no attributes. -->
          {@html msg.html}
        {:else}
          {msg.text}
        {/if}
      </div>
    {/each}
  </div>
  <div class="ai-panel-input">
    <input
      type="text"
      id="ai-chat-input"
      placeholder="Ask about grammar, vocab..."
      autocomplete="off"
      bind:value={input}
      onkeydown={onKeydown}
    />
    <button id="btn-ai-send" class="btn-ai-send" disabled={assistant.busy} onclick={send}>Send</button>
  </div>
  <div bind:this={resizer} class="ai-panel-resizer"></div>
</div>
