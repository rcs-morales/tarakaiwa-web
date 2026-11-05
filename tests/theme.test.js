import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { theme, applyTheme, toggleTheme, initTheme } from '../src/lib/theme.svelte.js';
import { get, KEYS } from '../src/lib/settings.js';
import Shell from '../src/lib/components/Shell.svelte';

vi.mock('../src/lib/auth.js', () => ({
  getCurrentUser: vi.fn(() => null),
  onAuthChange: vi.fn(() => () => {}),
}));

/** @type {((e: any) => void)[]} */
let systemListeners = [];
let systemDark = false;

beforeEach(() => {
  localStorage.clear();
  systemListeners = [];
  systemDark = false;
  window.matchMedia = /** @type {any} */ (vi.fn(() => ({
    get matches() { return systemDark; },
    addEventListener: (/** @type {string} */ _type, /** @type {any} */ fn) => systemListeners.push(fn),
  })));
});

describe('theme', () => {
  it('follows the system preference until a theme is picked', () => {
    systemDark = true;
    applyTheme();
    expect(theme.current).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('toggles and remembers the choice', () => {
    applyTheme();
    expect(theme.current).toBe('light');
    toggleTheme();
    expect(theme.current).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(get(KEYS.THEME)).toBe('dark');
    toggleTheme();
    expect(theme.current).toBe('light');
    expect(get(KEYS.THEME)).toBe('light');
  });

  it('tracks OS changes only while no theme is saved, with one listener however often it boots', () => {
    initTheme();
    initTheme();
    expect(systemListeners).toHaveLength(1);

    systemDark = true;
    systemListeners[0]({});
    expect(theme.current).toBe('dark');

    toggleTheme(); // saves 'light'
    systemDark = true;
    systemListeners[0]({});
    expect(theme.current).toBe('light');
  });

  it('Shell toggle button shows the theme and flips it', async () => {
    applyTheme();
    const { container } = render(Shell);
    const btn = /** @type {HTMLButtonElement} */ (container.querySelector('#btn-theme-toggle'));
    expect(btn.textContent).toBe('🌙');
    expect(btn.title).toBe('Switch to dark theme');
    await fireEvent.click(btn);
    expect(btn.textContent).toBe('☀️');
    expect(btn.title).toBe('Switch to light theme');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
