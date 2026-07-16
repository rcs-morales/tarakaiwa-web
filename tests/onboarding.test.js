import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent, waitFor } from '@testing-library/dom';

// session.svelte.js drags in the whole practice stack (tts/stt/avatar) — stub
// the state object the sheet reads. auth.js would construct a supabase client.
vi.mock('$lib/session.svelte.js', () => ({
  session: { qa: [{ q: 'こんにちは', a: 'こんにちは' }], isDefaultDeck: true },
}));

const signInWithEmail = vi.fn(async () => ({ error: null }));
vi.mock('$lib/auth.js', () => ({
  signInWithEmail: (...args) => signInWithEmail(...args),
  signInWithGoogle: vi.fn(async () => ({ error: null })),
  onAuthChange: vi.fn(),
  getCurrentUser: vi.fn(() => null),
}));

import Onboarding from '../src/lib/components/Onboarding.svelte';
import { KEYS } from '../src/lib/settings.js';

/** Advance past the new welcome/level step to the deck step. */
async function passWelcome() {
  await fireEvent.click(screen.getByRole('button', { name: /Get started/ }));
}

describe('Onboarding sheet', () => {
  beforeEach(() => {
    localStorage.clear();
    signInWithEmail.mockClear();
  });

  it('shows on first run and hides once setup was completed before', () => {
    const first = render(Onboarding);
    expect(first.container.querySelector('.onboarding-sheet')).not.toBeNull();
    first.unmount();

    localStorage.setItem(KEYS.SETUP_COMPLETE, '1');
    const second = render(Onboarding);
    expect(second.container.querySelector('.onboarding-sheet')).toBeNull();
  });

  it('walks welcome → deck → sign-in → finish, persisting the flag', async () => {
    const { container } = render(Onboarding);

    // step 1: welcome hero + level picker, N5 preselected
    expect(container.textContent).toContain('ようこそ！');
    expect(container.querySelector('.level-card.selected').textContent).toContain('N5');
    expect(container.querySelectorAll('.sheet-dot')).toHaveLength(3);

    await passWelcome();

    // step 2: sample deck detected from session state
    expect(container.textContent).toContain('Pick your deck');
    expect(container.textContent).toContain('Sample deck');

    await fireEvent.click(screen.getByRole('button', { name: /Continue →/ }));
    expect(container.textContent).toContain('Sync across devices?');

    await fireEvent.click(screen.getByRole('button', { name: /start practicing/i }));
    expect(localStorage.getItem(KEYS.SETUP_COMPLETE)).toBe('1');
    expect(container.querySelector('.onboarding-sheet')).toBeNull();
  });

  it('persists the picked JLPT level as the default for new decks', async () => {
    const { container } = render(Onboarding);

    await fireEvent.click(screen.getByRole('button', { name: /N4/ }));
    expect(container.querySelector('.level-card.selected').textContent).toContain('N4');

    await passWelcome();
    expect(localStorage.getItem(KEYS.JLPT_LEVEL)).toBe('N4');
  });

  it('sends a magic link from the sign-in step and reports success', async () => {
    const { container } = render(Onboarding);
    await passWelcome();
    await fireEvent.click(screen.getByRole('button', { name: /Continue →/ }));

    const email = container.querySelector('input[type="email"]');
    await fireEvent.input(email, { target: { value: 'me@example.com' } });
    await fireEvent.click(screen.getByRole('button', { name: /Send Magic Link/ }));

    expect(signInWithEmail).toHaveBeenCalledWith('me@example.com');
    await waitFor(() => expect(container.textContent).toContain('Check your inbox'));
  });

  it('refuses to send a magic link without an email address', async () => {
    const { container } = render(Onboarding);
    await passWelcome();
    await fireEvent.click(screen.getByRole('button', { name: /Continue →/ }));
    await fireEvent.click(screen.getByRole('button', { name: /Send Magic Link/ }));

    expect(signInWithEmail).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Please enter your email address.');
  });
});
