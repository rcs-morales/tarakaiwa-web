import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { fireEvent, waitFor } from '@testing-library/dom';

vi.mock('$lib/avatarUpload.js', () => ({
  uploadAvatar: vi.fn(),
  removeAvatar: vi.fn(),
}));

import AvatarModal from '../src/lib/components/AvatarModal.svelte';
import { uploadAvatar, removeAvatar } from '$lib/avatarUpload.js';

const DEFAULT_AVATAR = '/assets/zundamon.png';

function renderModal(props = {}) {
  return render(AvatarModal, {
    props: {
      initialSrc: 'https://x/avatars/u1/avatar.jpg',
      hasAvatar: true,
      defaultAvatar: DEFAULT_AVATAR,
      onchange: vi.fn(),
      onclose: vi.fn(),
      ...props,
    },
  });
}

describe('AvatarModal', () => {
  beforeEach(() => {
    uploadAvatar.mockReset();
    removeAvatar.mockReset();
  });

  it('renders the current avatar, restrictions text, and a Remove button when hasAvatar is true', () => {
    const { container, getByText } = renderModal();
    expect(container.querySelector('.avm-preview').src).toContain('avatars/u1/avatar.jpg');
    expect(getByText(/125x125 image size/)).toBeTruthy();
    expect(getByText(/32kb filesize/)).toBeTruthy();
    expect(container.querySelector('.avm-remove')).not.toBeNull();
  });

  it('hides the Remove button when hasAvatar is false', () => {
    const { container } = renderModal({ hasAvatar: false, initialSrc: DEFAULT_AVATAR });
    expect(container.querySelector('.avm-remove')).toBeNull();
  });

  it('clicking Cancel calls onclose', async () => {
    const onclose = vi.fn();
    const { container } = renderModal({ onclose });
    await fireEvent.click(container.querySelector('.avm-cancel'));
    expect(onclose).toHaveBeenCalled();
  });

  it('clicking the X calls onclose', async () => {
    const onclose = vi.fn();
    const { container } = renderModal({ onclose });
    await fireEvent.click(container.querySelector('.avm-close'));
    expect(onclose).toHaveBeenCalled();
  });

  it('picking a file uploads immediately, updates the preview, shows success, and reports the new URL — modal stays open', async () => {
    uploadAvatar.mockResolvedValue('https://x/avatars/u1/avatar.jpg?v=42');
    const onchange = vi.fn();
    const onclose = vi.fn();
    const { container } = renderModal({ onchange, onclose });

    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const input = container.querySelector('input[type="file"]');
    await fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(uploadAvatar).toHaveBeenCalledWith(file));
    await waitFor(() => expect(container.querySelector('.avm-preview').src).toContain('?v=42'));
    expect(container.querySelector('.import-status.success').textContent).toContain('updated');
    expect(onchange).toHaveBeenCalledWith('https://x/avatars/u1/avatar.jpg?v=42');
    expect(onclose).not.toHaveBeenCalled();
  });

  it('a failed upload shows an error status and keeps the previous preview', async () => {
    uploadAvatar.mockRejectedValue(new Error('Upload failed.'));
    const { container } = renderModal();

    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const input = container.querySelector('input[type="file"]');
    await fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(container.querySelector('.import-status.error')).not.toBeNull());
    expect(container.querySelector('.import-status.error').textContent).toContain('Upload failed.');
    expect(container.querySelector('.avm-preview').src).toContain('avatars/u1/avatar.jpg');
  });

  it('clicking Remove calls removeAvatar directly with no confirm dialog, reverts to the default avatar, and reports onchange(null)', async () => {
    const confirmSpy = vi.fn();
    vi.stubGlobal('confirm', confirmSpy);
    removeAvatar.mockResolvedValue(undefined);
    const onchange = vi.fn();
    const { container } = renderModal({ onchange });

    await fireEvent.click(container.querySelector('.avm-remove'));

    await waitFor(() => expect(removeAvatar).toHaveBeenCalled());
    expect(confirmSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(container.querySelector('.avm-preview').src).toContain(DEFAULT_AVATAR));
    expect(container.querySelector('.avm-remove')).toBeNull();
    expect(onchange).toHaveBeenCalledWith(null);
    vi.unstubAllGlobals();
  });

  it('a failed removal shows an error status and keeps the Remove button', async () => {
    removeAvatar.mockRejectedValue(new Error('Remove failed.'));
    const { container } = renderModal();

    await fireEvent.click(container.querySelector('.avm-remove'));

    await waitFor(() => expect(container.querySelector('.import-status.error')).not.toBeNull());
    expect(container.querySelector('.import-status.error').textContent).toContain('Remove failed.');
    expect(container.querySelector('.avm-remove')).not.toBeNull();
  });

  it('disables Cancel and the X while an upload is in flight', async () => {
    let resolveUpload;
    uploadAvatar.mockReturnValue(new Promise((resolve) => { resolveUpload = resolve; }));
    const { container } = renderModal();

    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const input = container.querySelector('input[type="file"]');
    await fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(container.querySelector('.avm-cancel').disabled).toBe(true));
    expect(container.querySelector('.avm-close').disabled).toBe(true);

    resolveUpload('https://x/avatars/u1/avatar.jpg?v=1');
    await waitFor(() => expect(container.querySelector('.avm-cancel').disabled).toBe(false));
  });
});
