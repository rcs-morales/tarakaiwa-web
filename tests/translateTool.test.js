import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';

vi.mock('../src/lib/ai/index.js', () => ({
  translateToJapaneseWithAI: vi.fn(),
  transcribeForTool: vi.fn(),
  hasAIAccess: vi.fn(() => true),
}));
vi.mock('../src/lib/tts.js', () => ({
  speakQuestion: vi.fn((_text, onEnd) => { onEnd?.(); return Promise.resolve(); }),
  cancelSpeech: vi.fn(),
}));

import { translateToJapaneseWithAI } from '../src/lib/ai/index.js';
import { translate } from '../src/lib/translate.svelte.js';
import TranslateTool from '../src/lib/components/TranslateTool.svelte';

describe('TranslateTool panel', () => {
  beforeEach(() => {
    vi.mocked(translateToJapaneseWithAI).mockReset();
    localStorage.clear();
    Object.assign(translate, {
      open: false, input: '', sourceLang: 'English', status: { message: '', type: '' },
      result: null, recording: false, speaking: false,
    });
  });

  it('opens and closes from the float button and the close button', async () => {
    const { container } = render(TranslateTool);
    const panel = container.querySelector('#translate-tool-panel');
    expect(panel.classList.contains('hidden')).toBe(true);

    await fireEvent.click(container.querySelector('#btn-translate-tool'));
    expect(panel.classList.contains('hidden')).toBe(false);

    await fireEvent.click(container.querySelector('#btn-close-translate'));
    expect(panel.classList.contains('hidden')).toBe(true);
  });

  it('loads and saves the source language', async () => {
    localStorage.setItem('source_language', 'Spanish');
    const { container } = render(TranslateTool);
    const select = container.querySelector('#translate-source-lang');
    expect(select.value).toBe('Spanish');

    await fireEvent.change(select, { target: { value: 'Korean' } });
    expect(localStorage.getItem('source_language')).toBe('Korean');
    expect(translate.sourceLang).toBe('Korean');
  });

  it('translates on Enter and renders furigana, romaji and the English gloss', async () => {
    vi.mocked(translateToJapaneseWithAI).mockResolvedValue({
      japanese: '元気{げんき}ですか？', romaji: 'genki desu ka?', english: 'Are you well?',
    });
    const { container } = render(TranslateTool);
    const input = container.querySelector('#translate-input');

    await fireEvent.input(input, { target: { value: 'How are you?' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    await vi.waitFor(() => expect(translate.speaking).toBe(false));
    await tick();

    const area = container.querySelector('#translate-result-area');
    expect(area.classList.contains('hidden')).toBe(false);
    expect(container.querySelector('#translate-result-text ruby rt').textContent).toBe('げんき');
    expect(container.querySelector('.romaji-text').textContent).toBe('genki desu ka?');
    expect(container.querySelector('#translate-result-en').textContent).toBe('Are you well?');
    expect(container.querySelector('#translate-status').className).toContain('success');
  });

  it('does not translate on Shift+Enter or while an IME is composing', async () => {
    const { container } = render(TranslateTool);
    const input = container.querySelector('#translate-input');
    await fireEvent.input(input, { target: { value: '你好' } });

    await fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    await fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

    expect(translateToJapaneseWithAI).not.toHaveBeenCalled();
  });

  it('renders model output as text, keeping only ruby markup', async () => {
    vi.mocked(translateToJapaneseWithAI).mockResolvedValue({
      japanese: '元気{げんき}<img src=x onerror="alert(1)">',
      romaji: '<b>genki</b>',
      english: '<img src=y onerror="alert(2)">',
    });
    const { container } = render(TranslateTool);
    const input = container.querySelector('#translate-input');

    await fireEvent.input(input, { target: { value: 'hi' } });
    await fireEvent.click(container.querySelector('#btn-translate-speak'));
    await vi.waitFor(() => expect(translate.speaking).toBe(false));
    await tick();

    const result = container.querySelector('#translate-result-text');
    expect(result.querySelector('img')).toBeNull();
    expect(result.querySelector('b')).toBeNull();
    expect(result.querySelector('ruby')).not.toBeNull();
    expect(container.querySelector('.romaji-text').textContent).toBe('<b>genki</b>');
  });
});
