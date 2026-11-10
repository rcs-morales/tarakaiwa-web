import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';

vi.mock('../src/lib/ai/index.js', () => ({ askStudyAssistant: vi.fn() }));

import { askStudyAssistant } from '../src/lib/ai/index.js';
import { assistant, assistantHistory } from '../src/lib/assistant.svelte.js';
import StudyAssistant from '../src/lib/components/StudyAssistant.svelte';
import { q } from './helpers.js';

describe('StudyAssistant panel', () => {
  beforeEach(() => {
    vi.mocked(askStudyAssistant).mockReset();
    assistant.messages.length = 0;
    assistant.busy = false;
    assistant.open = false;
    assistantHistory.length = 0;
  });

  it('opens and closes from the float button and the close button', async () => {
    const { container } = render(StudyAssistant);
    const panel = container.querySelector('#ai-assistant-panel');
    expect(panel.classList.contains('hidden')).toBe(true);

    await fireEvent.click(container.querySelector('#btn-ai-assistant'));
    expect(panel.classList.contains('hidden')).toBe(false);

    await fireEvent.click(container.querySelector('#btn-close-ai'));
    expect(panel.classList.contains('hidden')).toBe(true);
  });

  it('sends on Enter, clears the input and renders the reply', async () => {
    vi.mocked(askStudyAssistant).mockResolvedValue({ response: '<p><strong>時</strong> (toki)</p>' });
    const { container } = render(StudyAssistant);
    const input = q(container, '#ai-chat-input');

    await fireEvent.input(input, { target: { value: 'What is 時?' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    await vi.waitFor(() => expect(assistant.busy).toBe(false));
    await tick();

    expect(input.value).toBe('');
    const msgs = container.querySelectorAll('.ai-msg');
    expect(msgs).toHaveLength(2);
    expect(msgs[0].classList.contains('user')).toBe(true);
    expect(msgs[1].querySelector('strong').textContent).toBe('時');
    expect(msgs[1].querySelector('.ai-reading-highlight').textContent).toBe('(toki)');
  });

  it('does not send on Enter while an IME is composing', async () => {
    const { container } = render(StudyAssistant);
    const input = q(container, '#ai-chat-input');

    await fireEvent.input(input, { target: { value: 'じかん' } });
    await fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

    expect(askStudyAssistant).not.toHaveBeenCalled();
    expect(input.value).toBe('じかん');
  });

  it('shows the user question as text, never as markup', async () => {
    vi.mocked(askStudyAssistant).mockResolvedValue({ response: 'ok' });
    const { container } = render(StudyAssistant);
    const input = container.querySelector('#ai-chat-input');

    await fireEvent.input(input, { target: { value: '<img src=x onerror=alert(1)>' } });
    await fireEvent.click(container.querySelector('#btn-ai-send'));
    await vi.waitFor(() => expect(assistant.busy).toBe(false));
    await tick();

    const userMsg = container.querySelector('.ai-msg.user');
    expect(userMsg.querySelector('img')).toBeNull();
    expect(userMsg.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('disables Send while waiting for the reply', async () => {
    /** @type {any} */ let resolve;
    vi.mocked(askStudyAssistant).mockImplementation(() => new Promise((r) => { resolve = r; }));
    const { container } = render(StudyAssistant);
    const input = container.querySelector('#ai-chat-input');
    const send = q(container, '#btn-ai-send');

    await fireEvent.input(input, { target: { value: 'Hello' } });
    await fireEvent.click(send);
    expect(send.disabled).toBe(true);
    expect(container.querySelectorAll('.ai-msg')[1].textContent.trim()).toBe('Thinking...');

    resolve({ response: 'Hi!' });
    await vi.waitFor(() => expect(send.disabled).toBe(false));
  });
});
