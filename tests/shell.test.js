import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent, waitFor } from '@testing-library/dom';

const mockGetCurrentUser = vi.fn(() => null);
vi.mock('$lib/auth.js', () => ({
  onAuthChange: vi.fn(),
  getCurrentUser: (...args) => mockGetCurrentUser(...args),
}));

vi.mock('$lib/avatarUpload.js', () => ({
  fetchAvatarUrl: vi.fn(async () => null),
}));

import Shell from '../src/lib/components/Shell.svelte';
import { shell, setTab, TABS } from '../src/lib/shell.svelte.js';
import { fetchAvatarUrl } from '$lib/avatarUpload.js';

describe('App Shell', () => {
  beforeEach(() => {
    // module-level state persists between tests — reset it
    setTab('practice');
    mockGetCurrentUser.mockReturnValue(null);
    fetchAvatarUrl.mockReset().mockResolvedValue(null);
  });

  it('renders all four tabs in both the top nav and the bottom bar', () => {
    render(Shell);
    for (const t of TABS) {
      // one desktop nav button + one mobile bottom-bar button each
      expect(screen.getAllByRole('button', { name: new RegExp(t.label) })).toHaveLength(2);
    }
  });

  it('switches the active tab on click without touching the DOM tree', async () => {
    render(Shell);
    const [decksBtn] = screen.getAllByRole('button', { name: /Decks/ });
    await fireEvent.click(decksBtn);
    expect(shell.tab).toBe('decks');
    expect(decksBtn.getAttribute('aria-current')).toBe('page');
  });

  it('setTab ignores unknown tab ids', () => {
    setTab('nonsense');
    expect(shell.tab).toBe('practice');
  });

  it('always renders the account status and quota nodes for imperative updates', () => {
    const { container } = render(Shell);
    // app.js (updateAccountUI) and quota.js (updateQuotaDisplay) write to
    // these by id — they must exist even while the menu is closed.
    expect(container.querySelector('#account-bar-status')).not.toBeNull();
    expect(container.querySelector('#quota-chip')).not.toBeNull();
    expect(container.querySelector('#quota-text')).not.toBeNull();
    expect(container.querySelector('#btn-theme-toggle')).not.toBeNull();
  });

  it('opens the account menu and jumps to Settings from it', async () => {
    const { container } = render(Shell);
    const menu = container.querySelector('.account-menu');
    expect(menu.classList.contains('open')).toBe(false);

    await fireEvent.click(container.querySelector('#btn-account-menu'));
    expect(menu.classList.contains('open')).toBe(true);

    await fireEvent.click(container.querySelector('#btn-account-open'));
    expect(shell.tab).toBe('settings');
    expect(menu.classList.contains('open')).toBe(false);
  });

  it('shows the emoji account icon while signed out', () => {
    const { container } = render(Shell);
    expect(container.querySelector('#btn-account-menu').textContent).toContain('👤');
    expect(container.querySelector('.account-avatar')).toBeNull();
  });

  it('shows the default avatar image when signed in with no stored picture', async () => {
    mockGetCurrentUser.mockReturnValue({ id: 'u1', email: 'me@example.com' });
    const { container } = render(Shell);
    await waitFor(() => expect(container.querySelector('.account-avatar')).not.toBeNull());
    expect(container.querySelector('.account-avatar').src).toContain('/assets/zundamon.png');
  });

  it('shows the stored avatar image when signed in with one set', async () => {
    mockGetCurrentUser.mockReturnValue({ id: 'u1', email: 'me@example.com' });
    fetchAvatarUrl.mockResolvedValue('https://x/avatars/u1/avatar.jpg');
    const { container } = render(Shell);
    await waitFor(() => {
      const img = container.querySelector('.account-avatar');
      expect(img?.src).toContain('avatars/u1/avatar.jpg');
    });
  });

  it('still opens the account menu when signed in with an avatar', async () => {
    mockGetCurrentUser.mockReturnValue({ id: 'u1', email: 'me@example.com' });
    const { container } = render(Shell);
    await waitFor(() => expect(container.querySelector('.account-avatar')).not.toBeNull());

    const menu = container.querySelector('.account-menu');
    await fireEvent.click(container.querySelector('#btn-account-menu'));
    expect(menu.classList.contains('open')).toBe(true);
  });
});
