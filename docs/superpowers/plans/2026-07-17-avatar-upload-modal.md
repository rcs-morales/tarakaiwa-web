# Avatar Upload Modal & Size Restrictions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink stored avatars to 125×125/32KB (auto quality-reduced), restrict input types to jpg/gif/png, and replace the direct-to-file-picker tap on the Settings avatar with a "Change your avatar" management popup (preview, add, remove, cancel).

**Architecture:** Two-part change. (1) `src/lib/avatarUpload.js` gets a smaller `AVATAR_SIZE`, a MIME allow-list, and a quality-reduction retry loop in `cropResizeToSquare`. (2) A new `src/lib/components/AvatarModal.svelte` owns all upload/remove UI and state (reusing the app's existing global `.modal`/`.modal-card` chrome from `public/assets/style.css`, same pattern as `DeckFormModal.svelte`); `Settings.svelte` is simplified to just open/close it and track the current avatar URL for its own small preview.

**Tech Stack:** Svelte 5 runes (`$state`/`$derived`/`$props`), Vitest + @testing-library/svelte, existing `avatarUpload.js` Supabase Storage client.

## Global Constraints

- Stored avatar size: 125×125px (from spec — `docs/superpowers/specs/2026-07-17-avatar-upload-modal-design.md`).
- Max output filesize: 32KB, enforced by re-encoding at lower JPEG quality, never by rejecting the upload.
- Accepted input MIME types: `image/jpeg`, `image/png`, `image/gif` only.
- GIFs flatten to a static image (no animated-GIF preservation) — this happens for free via `createImageBitmap`, no extra code.
- No `confirm()` dialog before removing an avatar (dropped — the modal itself is the deliberate action).
- Cancel/X in the modal are disabled while an upload or remove is in flight.
- Upload starts immediately on file pick inside the modal; the modal stays open afterward.

---

### Task 1: Shrink avatar size, restrict input types, add quality-reduction loop

**Files:**
- Modify: `src/lib/avatarUpload.js`
- Test: `tests/avatarUpload.test.js`

**Interfaces:**
- Produces: `AVATAR_SIZE` (now `125`), `MAX_OUTPUT_BYTES` (new export, `32 * 1024`), `validateImageFile(file)` (same signature, new allow-list + new rejection message), `cropResizeToSquare(file, size = AVATAR_SIZE)` (same signature and return type `Promise<Blob>`, new internal retry behavior).
- Consumes: nothing new — no other module needs to change for this task.

- [ ] **Step 1: Write the failing tests for the new MIME allow-list**

Replace the existing "throws for a non-image MIME type" test and add two more, in the `describe('validateImageFile', ...)` block of `tests/avatarUpload.test.js`:

```js
describe('validateImageFile', () => {
  it('throws when no file is given', () => {
    expect(() => validateImageFile(null)).toThrow('No file selected.');
  });

  it('throws for a MIME type outside the jpg/png/gif allow-list', () => {
    expect(() => validateImageFile(makeFile({ type: 'text/plain' }))).toThrow('Please choose a JPG, PNG, or GIF image.');
  });

  it('throws for an unsupported image type like webp', () => {
    expect(() => validateImageFile(makeFile({ type: 'image/webp' }))).toThrow('Please choose a JPG, PNG, or GIF image.');
  });

  it('throws for a file over the max size', () => {
    expect(() => validateImageFile(makeFile({ size: MAX_UPLOAD_BYTES + 1 }))).toThrow('too large');
  });

  it('accepts a small, valid jpeg file', () => {
    expect(() => validateImageFile(makeFile({ type: 'image/jpeg', size: 2048 }))).not.toThrow();
  });

  it('accepts png and gif', () => {
    expect(() => validateImageFile(makeFile({ type: 'image/png', size: 2048 }))).not.toThrow();
    expect(() => validateImageFile(makeFile({ type: 'image/gif', size: 2048 }))).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/avatarUpload.test.js`
Expected: FAIL — the webp/allow-list tests fail because `validateImageFile` still accepts anything starting with `image/` and still throws the old message `'Please choose an image file.'`.

- [ ] **Step 3: Update `validateImageFile` in `src/lib/avatarUpload.js`**

Replace the current function body:

```js
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif']);

/** Throws an Error with a user-facing message if the file is unusable. */
export function validateImageFile(file) {
  if (!file) throw new Error('No file selected.');
  if (!ALLOWED_TYPES.has(file.type)) throw new Error('Please choose a JPG, PNG, or GIF image.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Image is too large (max 8 MB).');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/avatarUpload.test.js`
Expected: PASS for the `validateImageFile` block. The nested `uploadAvatar` test `'validates before touching the network'` now FAILS — it still asserts the old message. Fixed in the next step.

- [ ] **Step 5: Fix the stale error-message assertion in the `uploadAvatar` describe block**

In the `describe('uploadAvatar', ...)` block, find:

```js
    it('validates before touching the network', async () => {
      getCurrentUser.mockReturnValue({ id: 'u1', email: 'me@example.com' });
      await expect(uploadAvatar(makeFile({ type: 'text/plain' }))).rejects.toThrow('Please choose an image file.');
      expect(supabaseClient.storage.from).not.toHaveBeenCalled();
    });
```

and change the expected message to match the new allow-list wording:

```js
    it('validates before touching the network', async () => {
      getCurrentUser.mockReturnValue({ id: 'u1', email: 'me@example.com' });
      await expect(uploadAvatar(makeFile({ type: 'text/plain' }))).rejects.toThrow('Please choose a JPG, PNG, or GIF image.');
      expect(supabaseClient.storage.from).not.toHaveBeenCalled();
    });
```

Run: `npx vitest run tests/avatarUpload.test.js`
Expected: PASS for this test now too.

- [ ] **Step 6: Update `AVATAR_SIZE` and check the existing crop test still holds**

In `src/lib/avatarUpload.js`, change:

```js
export const AVATAR_SIZE = 256;
```

to:

```js
export const AVATAR_SIZE = 125;
```

The existing test `'center-crops the shorter side and resizes to AVATAR_SIZE'` already asserts against the `AVATAR_SIZE` import, not a hardcoded number, so it needs no edit — it will assert `[dx, dy, dWidth, dHeight]` equal `[0, 0, 125, 125]` automatically.

- [ ] **Step 7: Write the failing tests for the quality-reduction loop**

Add a new `describe` block in `tests/avatarUpload.test.js`, after the existing `'cropResizeToSquare / uploadAvatar (canvas-stubbed)'` block's `it('rejects when the canvas fails to produce a blob', ...)` test (same `describe`, so it shares the `beforeEach`/`afterEach` canvas stubs — but override `toBlob` per-test as the existing "rejects" test already does):

```js
  it('re-encodes at a lower quality when the first pass exceeds the 32KB cap, and stops at the first pass that fits', async () => {
    const bigBlob = { size: MAX_OUTPUT_BYTES + 1, type: 'image/jpeg' };
    const smallBlob = { size: MAX_OUTPUT_BYTES - 1, type: 'image/jpeg' };
    const qualityCalls = [];
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (cb, type, quality) {
      qualityCalls.push(quality);
      cb(qualityCalls.length === 1 ? bigBlob : smallBlob);
    });

    const blob = await cropResizeToSquare(makeFile());

    expect(blob).toBe(smallBlob);
    expect(qualityCalls).toEqual([0.82, 0.65]);
  });

  it('returns the last (lowest-quality) attempt instead of throwing when nothing fits under 32KB', async () => {
    const oversizedBlob = { size: MAX_OUTPUT_BYTES + 1, type: 'image/jpeg' };
    const qualityCalls = [];
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (cb, type, quality) {
      qualityCalls.push(quality);
      cb(oversizedBlob);
    });

    const blob = await cropResizeToSquare(makeFile());

    expect(blob).toBe(oversizedBlob);
    expect(qualityCalls).toEqual([0.82, 0.65, 0.5, 0.35, 0.2]);
  });
```

Also add `MAX_OUTPUT_BYTES` to the existing import statement at the top of the file:

```js
import {
  validateImageFile,
  cropResizeToSquare,
  fetchAvatarUrl,
  uploadAvatar,
  removeAvatar,
  MAX_UPLOAD_BYTES,
  MAX_OUTPUT_BYTES,
  AVATAR_SIZE,
} from '../src/lib/avatarUpload.js';
```

- [ ] **Step 8: Run the tests to verify they fail**

Run: `npx vitest run tests/avatarUpload.test.js`
Expected: FAIL — `MAX_OUTPUT_BYTES` is not exported yet, and `cropResizeToSquare` still does a single `toBlob` call with no `quality` argument.

- [ ] **Step 9: Implement the quality-reduction loop in `cropResizeToSquare`**

Replace the current `cropResizeToSquare` function in `src/lib/avatarUpload.js`:

```js
export const MAX_OUTPUT_BYTES = 32 * 1024; // 32kb cap on the stored/uploaded blob

const QUALITY_STEPS = [0.82, 0.65, 0.5, 0.35, 0.2];

function encodeAtQuality(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Image processing failed.'))),
      'image/jpeg',
      quality
    );
  });
}

/**
 * Draw `file` to a canvas, center-cropped to a square and downscaled to
 * size×size, returning a JPEG Blob. No interactive cropping — just an
 * automatic center crop of the shorter side. Re-encodes at progressively
 * lower quality until the blob is under MAX_OUTPUT_BYTES; if even the
 * lowest quality step is still over, returns that last attempt rather
 * than failing the upload.
 * @returns {Promise<Blob>}
 */
export async function cropResizeToSquare(file, size = AVATAR_SIZE) {
  const bitmap = await createImageBitmap(file); // decodes + honors EXIF orientation
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close?.();

  let blob;
  for (const quality of QUALITY_STEPS) {
    blob = await encodeAtQuality(canvas, quality);
    if (blob.size <= MAX_OUTPUT_BYTES) return blob;
  }
  return blob;
}
```

This replaces both the old `cropResizeToSquare`'s trailing `canvas.toBlob(...)` promise block and the old standalone `MAX_UPLOAD_BYTES`-adjacent export area — keep `MAX_UPLOAD_BYTES` and `AVATAR_SIZE` exactly where they already are; only add `MAX_OUTPUT_BYTES` and the `QUALITY_STEPS`/`encodeAtQuality` helpers above `cropResizeToSquare`.

- [ ] **Step 10: Run all avatarUpload tests to verify they pass**

Run: `npx vitest run tests/avatarUpload.test.js`
Expected: PASS — all tests in the file, including the two new quality-loop tests and the updated `validateImageFile` tests.

- [ ] **Step 11: Commit**

```bash
git add src/lib/avatarUpload.js tests/avatarUpload.test.js
git commit -m "feat: shrink avatars to 125x125/32kb with auto quality reduction, restrict to jpg/png/gif"
```

---

### Task 2: `AvatarModal.svelte` — the "Change your avatar" popup

**Files:**
- Create: `src/lib/components/AvatarModal.svelte`
- Test: `tests/avatarModal.test.js` (new file)

**Interfaces:**
- Consumes: `uploadAvatar(file)` → `Promise<string>` (resolves to a cache-busted full URL, throws on failure), `removeAvatar()` → `Promise<void>` (throws on failure) — both from `$lib/avatarUpload.js`, imported directly inside this component (not passed as props), matching how `Settings.svelte` imports them today.
- Produces: a component with props `{ initialSrc: string, hasAvatar: boolean, defaultAvatar: string, onchange: (url: string | null) => void, onclose: () => void }`. Calls `onchange(url)` with the new full avatar URL string after a successful upload, or `onchange(null)` after a successful removal. Calls `onclose()` when the user cancels/closes (never called automatically after a successful upload — only after Cancel/X/backdrop-click, or after a successful *removal*, since removal has nothing left to preview — see Step 3 for the exact removal behavior). Task 3 (`Settings.svelte`) is the only consumer.

**Design note on `onclose` after removal:** the spec's reference UI keeps a "Remove" button inside the modal without saying the modal must close afterward — and the spec's flow decision ("modal stays open... so they can try again or hit Cancel/close when happy") is written about *uploads*. Removal is simpler: after a successful remove there is nothing left to remove again, and `hasAvatar` becomes `false` so the Remove button disappears — the modal stays open (consistent with "stays open" being the general modal behavior), showing the default avatar and still offering "Add new avatar". Do not auto-close on remove.

- [ ] **Step 1: Write the failing component tests**

Create `tests/avatarModal.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/avatarModal.test.js`
Expected: FAIL — `src/lib/components/AvatarModal.svelte` does not exist yet.

- [ ] **Step 3: Create `src/lib/components/AvatarModal.svelte`**

```svelte
<script>
  // "Change your avatar" popup — opened by tapping the avatar in Settings.
  // Owns all upload/remove UI and state; reports changes back to the parent
  // via onchange (new URL string, or null after a removal) rather than
  // reaching into Settings' own state directly. Reuses the app's global
  // .modal/.modal-card chrome (see DeckFormModal.svelte for the same pattern).
  import { uploadAvatar, removeAvatar } from '$lib/avatarUpload.js';

  let { initialSrc, hasAvatar: initialHasAvatar, defaultAvatar, onchange, onclose } = $props();

  let previewSrc = $state(initialSrc);
  let hasAvatar = $state(initialHasAvatar);
  let uploading = $state(false);
  let removing = $state(false);
  let status = $state(null); // { text, type: 'success'|'error'|'info' } | null
  let fileInputEl;

  const busy = $derived(uploading || removing);

  function close() {
    if (busy) return;
    onclose();
  }

  function triggerPick() {
    if (busy) return;
    fileInputEl?.click();
  }

  async function onFilePicked(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = ''; // allow re-picking the same file later
    if (!file) return;

    uploading = true;
    status = { text: 'Uploading…', type: 'info' };
    try {
      const url = await uploadAvatar(file);
      previewSrc = url;
      hasAvatar = true;
      status = { text: 'Profile picture updated.', type: 'success' };
      onchange(url);
    } catch (err) {
      console.error('avatar upload failed:', err);
      status = { text: err.message || 'Upload failed.', type: 'error' };
    } finally {
      uploading = false;
    }
  }

  async function remove() {
    if (!hasAvatar || busy) return;
    removing = true;
    try {
      await removeAvatar();
      previewSrc = defaultAvatar;
      hasAvatar = false;
      status = { text: 'Profile picture removed.', type: 'info' };
      onchange(null);
    } catch (err) {
      console.error('avatar remove failed:', err);
      status = { text: err.message || 'Remove failed.', type: 'error' };
    } finally {
      removing = false;
    }
  }
</script>

<div class="modal" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) close(); }}>
  <div class="modal-card avm-card" role="dialog" aria-modal="true" aria-label="Change your avatar">
    <div class="avm-head">
      <img class="avm-thumb" src={previewSrc} alt="" />
      <h3 class="avm-title">Change your avatar</h3>
      <button type="button" class="avm-close" onclick={close} disabled={busy} aria-label="Close">✕</button>
    </div>

    <img class="avm-preview" src={previewSrc} alt="" />

    <input type="file" accept="image/jpeg,image/png,image/gif" class="hidden"
      bind:this={fileInputEl} onchange={onFilePicked} />

    <div class="avm-actions">
      <button type="button" class="btn btn-primary" onclick={triggerPick} disabled={busy}>
        {uploading ? 'Uploading…' : 'Add new avatar'}
      </button>
      <button type="button" class="btn btn-secondary avm-cancel" onclick={close} disabled={busy}>Cancel</button>
    </div>

    {#if status}
      <div class="import-status {status.type}">{status.text}</div>
    {/if}

    <p class="avm-restrictions">
      Restrictions: 125x125 image size (larger images will be resized), 32kb filesize
      (after resizing); image types: jpg, gif, png.
    </p>

    {#if hasAvatar}
      <button type="button" class="btn btn-danger avm-remove" onclick={remove} disabled={busy}>
        {removing ? 'Removing…' : 'Remove'}
      </button>
    {/if}
  </div>
</div>

<style>
  .avm-card {
    max-width: 340px;
  }

  .avm-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
  }

  .avm-thumb {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
    object-position: top;
    background: var(--primary-tint);
    border: 1.5px solid var(--card-border);
    flex: 0 0 auto;
  }

  .avm-title {
    flex: 1;
    font-family: 'Noto Serif JP', serif;
    font-size: 1.05rem;
    margin: 0;
  }

  .avm-close {
    flex: 0 0 auto;
    background: none;
    border: none;
    color: var(--muted);
    font-size: 0.9rem;
    cursor: pointer;
    padding: 4px;
  }

  .avm-close:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .avm-preview {
    display: block;
    width: 125px;
    height: 125px;
    border-radius: 12px;
    object-fit: cover;
    object-position: top;
    background: var(--primary-tint);
    border: 2px solid var(--card-border);
    margin: 0 auto 16px;
  }

  .avm-actions {
    display: flex;
    gap: 10px;
    justify-content: center;
    margin-bottom: 12px;
  }

  .avm-restrictions {
    font-size: 0.72rem;
    color: var(--muted);
    line-height: 1.4;
    margin: 12px 0 0;
  }

  .avm-remove {
    margin-top: 16px;
  }
</style>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/avatarModal.test.js`
Expected: PASS — all tests in the new file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/AvatarModal.svelte tests/avatarModal.test.js
git commit -m "feat: add AvatarModal — change-avatar popup with preview, add, and remove"
```

---

### Task 3: Wire `AvatarModal` into `Settings.svelte`, remove the old inline flow

**Files:**
- Modify: `src/lib/components/Settings.svelte`
- Test: `tests/settingsScreen.test.js`

**Interfaces:**
- Consumes: `AvatarModal` from Task 2 (`src/lib/components/AvatarModal.svelte`), props `{ initialSrc, hasAvatar, defaultAvatar, onchange, onclose }` as defined in Task 2.
- Produces: no new exports — this is the top of the call chain for this feature.

- [ ] **Step 1: Update `tests/settingsScreen.test.js` mocks and imports**

The current file mocks `uploadAvatar`/`removeAvatar` from `$lib/avatarUpload.js` for `Settings.svelte` to call directly — that's no longer how it works (only `fetchAvatarUrl` is still called directly by `Settings.svelte`; `uploadAvatar`/`removeAvatar` are now called by `AvatarModal.svelte`, and since `AvatarModal.svelte` is a real (non-mocked) component in this test file, mocking `$lib/avatarUpload.js` for the whole test module still works — the mock is module-level and `AvatarModal` imports from the same path).

Replace the mock block:

```js
vi.mock('$lib/avatarUpload.js', () => ({
  fetchAvatarUrl: vi.fn(async () => null),
  uploadAvatar: vi.fn(async () => 'https://x/avatars/u1/avatar.jpg?v=1'),
  removeAvatar: vi.fn(async () => undefined),
}));
```

stays exactly as-is (no change needed here — it already covers all three functions `AvatarModal` and `Settings` between them need).

- [ ] **Step 2: Replace the avatar-interaction tests**

Replace these four existing tests:
- `'shows the default avatar with no camera badge while signed out, and tapping it opens Advanced/Account instead of a picker'`
- `'shows the fetched avatar and a camera badge when signed in'`
- `'uploading a new picture updates the avatar and shows a success status'`
- `'a failed upload shows an error status and leaves the previous avatar in place'`
- `'hides the remove badge for guests and for a signed-in user with no custom photo'`
- `'shows the remove badge once signed in with a custom photo, and removing reverts to the placeholder'`
- `'does nothing when the remove confirmation is dismissed'`
- `'shows an error status and keeps the photo when removal fails'`

with:

```js
  it('shows the default avatar while signed out, and tapping it opens Advanced/Account instead of a picker', async () => {
    const { container } = render(Settings);

    expect(container.querySelector('.profile-avatar').src).toContain('/assets/zundamon.png');
    expect(fetchAvatarUrl).not.toHaveBeenCalled();

    await fireEvent.click(container.querySelector('.avatar-btn'));

    expect(container.querySelector('.advanced-body').classList.contains('open')).toBe(true);
    expect(container.querySelector('.modal')).toBeNull();
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it('shows the fetched avatar when signed in', async () => {
    mockGetCurrentUser.mockReturnValue({ id: 'u1', email: 'me@example.com' });
    fetchAvatarUrl.mockResolvedValue('https://x/avatars/u1/avatar.jpg');

    const { container } = render(Settings);

    await waitFor(() => expect(container.querySelector('.profile-avatar').src).toContain('avatars/u1/avatar.jpg'));
  });

  it('tapping the avatar while signed in opens AvatarModal instead of a native picker', async () => {
    mockGetCurrentUser.mockReturnValue({ id: 'u1', email: 'me@example.com' });
    fetchAvatarUrl.mockResolvedValue('https://x/avatars/u1/avatar.jpg');

    const { container } = render(Settings);
    await waitFor(() => expect(fetchAvatarUrl).toHaveBeenCalled());

    await fireEvent.click(container.querySelector('.avatar-btn'));

    expect(container.querySelector('.avm-card')).not.toBeNull();
    expect(container.querySelector('.avm-preview').src).toContain('avatars/u1/avatar.jpg');
  });

  it('uploading inside the modal updates the small Settings avatar and closing the modal removes it', async () => {
    mockGetCurrentUser.mockReturnValue({ id: 'u1', email: 'me@example.com' });
    fetchAvatarUrl.mockResolvedValue('https://x/avatars/u1/avatar.jpg');
    uploadAvatar.mockResolvedValue('https://x/avatars/u1/avatar.jpg?v=42');

    const { container } = render(Settings);
    await waitFor(() => expect(fetchAvatarUrl).toHaveBeenCalled());
    await fireEvent.click(container.querySelector('.avatar-btn'));

    const input = container.querySelector('.avm-card input[type="file"]');
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    await fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(container.querySelector('.profile-avatar').src).toContain('avatars/u1/avatar.jpg?v=42'));

    await fireEvent.click(container.querySelector('.avm-cancel'));
    expect(container.querySelector('.avm-card')).toBeNull();
    // small avatar keeps the uploaded photo after the modal closes
    expect(container.querySelector('.profile-avatar').src).toContain('avatars/u1/avatar.jpg?v=42');
  });

  it('removing inside the modal reverts the small Settings avatar to the placeholder', async () => {
    mockGetCurrentUser.mockReturnValue({ id: 'u1', email: 'me@example.com' });
    fetchAvatarUrl.mockResolvedValue('https://x/avatars/u1/avatar.jpg');
    removeAvatar.mockResolvedValue(undefined);

    const { container } = render(Settings);
    await waitFor(() => expect(fetchAvatarUrl).toHaveBeenCalled());
    await fireEvent.click(container.querySelector('.avatar-btn'));

    await waitFor(() => expect(container.querySelector('.avm-remove')).not.toBeNull());
    await fireEvent.click(container.querySelector('.avm-remove'));

    await waitFor(() => expect(container.querySelector('.profile-avatar').src).toContain('/assets/zundamon.png'));
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/settingsScreen.test.js`
Expected: FAIL — `Settings.svelte` still opens the raw file input on avatar tap; no `.avm-card`/`AvatarModal` exists in the render yet; `.avatar-cam`/`.avatar-remove-btn` classes referenced by the old tests are gone from the test file already (replaced above) so those specific old failures don't apply, but the new modal-opening assertions fail.

- [ ] **Step 4: Update `src/lib/components/Settings.svelte`**

Replace the script section's avatar-related state/handlers (lines currently spanning from `const DEFAULT_AVATAR = ...` through the end of `onRemoveAvatar`) with:

Replace the existing `avatarUpload.js` import line:

```js
  import { uploadAvatar, fetchAvatarUrl, removeAvatar } from '$lib/avatarUpload.js';
```

with:

```js
  import { fetchAvatarUrl } from '$lib/avatarUpload.js';
  import AvatarModal from './AvatarModal.svelte';
```

(`uploadAvatar`/`removeAvatar` are no longer called anywhere in `Settings.svelte` after this change — only `fetchAvatarUrl` is, so drop the other two from this import and add the new `AvatarModal` import.)

Then replace this whole block:

```js
  const DEFAULT_AVATAR = '/assets/zundamon.png';
  let avatarUrl = $state(null);      // stored base URL from profiles, or null
  let avatarBusting = $state('');    // '?v=…' appended right after a fresh upload
  let avatarUploading = $state(false);
  let avatarRemoving = $state(false);
  let avatarStatus = $state(null);   // { text, type: 'success'|'error'|'info' } | null
  let avatarInputEl;

  // Only signed-in users with an actual stored photo get a remove option —
  // nothing to remove for a guest or a user already on the placeholder.
  const canRemoveAvatar = $derived(!!user && !!avatarUrl);

  // Guests (or signed-in with no stored picture yet) fall back to the same
  // default every user saw before this feature existed.
  const avatarSrc = $derived(user && avatarUrl ? avatarUrl + avatarBusting : DEFAULT_AVATAR);

  async function loadAvatar() {
    avatarUrl = user ? await fetchAvatarUrl() : null;
    avatarBusting = '';
  }
```

with:

```js
  const DEFAULT_AVATAR = '/assets/zundamon.png';
  let avatarUrl = $state(null);      // stored base URL from profiles, or null
  let avatarBusting = $state('');    // '?v=…' appended right after a fresh upload
  let avatarModalOpen = $state(false);

  // Only signed-in users with an actual stored photo get a remove option —
  // nothing to remove for a guest or a user already on the placeholder.
  const canRemoveAvatar = $derived(!!user && !!avatarUrl);

  // Guests (or signed-in with no stored picture yet) fall back to the same
  // default every user saw before this feature existed.
  const avatarSrc = $derived(user && avatarUrl ? avatarUrl + avatarBusting : DEFAULT_AVATAR);

  async function loadAvatar() {
    avatarUrl = user ? await fetchAvatarUrl() : null;
    avatarBusting = '';
  }
```

(only the `avatarUploading`/`avatarRemoving`/`avatarStatus`/`avatarInputEl` lines are dropped, replaced by the single `avatarModalOpen` flag — everything else in that block is unchanged.)

Then replace:

```js
  // Tapping the avatar opens the file picker for signed-in users; signed-out
  // users get the same nudge toward Account as the Edit button (a picker that
  // could only fail isn't useful to them).
  function pickAvatar() {
    if (!user) { editProfile(); return; }
    avatarInputEl?.click();
  }

  async function onAvatarPicked(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = ''; // allow re-picking the same file later
    if (!file) return;

    avatarUploading = true;
    avatarStatus = { text: 'Uploading…', type: 'info' };
    try {
      // uploadAvatar() already appends its own cache-buster (the object path
      // is stable across re-uploads) — split it off rather than minting a
      // second, redundant one here.
      const url = await uploadAvatar(file);
      const qIndex = url.indexOf('?');
      avatarUrl = qIndex === -1 ? url : url.slice(0, qIndex);
      avatarBusting = qIndex === -1 ? '' : url.slice(qIndex);
      avatarStatus = { text: 'Profile picture updated.', type: 'success' };
    } catch (err) {
      console.error('avatar upload failed:', err);
      avatarStatus = { text: err.message || 'Upload failed.', type: 'error' };
    } finally {
      avatarUploading = false;
    }
  }

  async function onRemoveAvatar() {
    if (!canRemoveAvatar || avatarRemoving) return;
    if (!confirm('Remove your profile picture?')) return;

    avatarRemoving = true;
    try {
      await removeAvatar();
      avatarUrl = null;
      avatarBusting = '';
      avatarStatus = { text: 'Profile picture removed.', type: 'info' };
    } catch (err) {
      console.error('avatar remove failed:', err);
      avatarStatus = { text: err.message || 'Remove failed.', type: 'error' };
    } finally {
      avatarRemoving = false;
    }
  }
```

with:

```js
  // Tapping the avatar opens the change-avatar modal for signed-in users;
  // signed-out users get the same nudge toward Account as the Edit button
  // (a modal that could only fail isn't useful to them).
  function pickAvatar() {
    if (!user) { editProfile(); return; }
    avatarModalOpen = true;
  }

  // AvatarModal reports the outcome rather than reaching into this
  // component's state directly. url is a full cache-busted URL on a
  // successful upload, or null after a successful removal — the split
  // mirrors the cache-busting logic the old inline handler used to do here.
  function onAvatarModalChange(url) {
    if (url === null) {
      avatarUrl = null;
      avatarBusting = '';
      return;
    }
    const qIndex = url.indexOf('?');
    avatarUrl = qIndex === -1 ? url : url.slice(0, qIndex);
    avatarBusting = qIndex === -1 ? '' : url.slice(qIndex);
  }
```

- [ ] **Step 5: Update the profile-card markup**

Replace:

```svelte
  <!-- ── Profile ── -->
  <div class="settings-card profile-card">
    <div class="avatar-wrap">
      <button type="button" class="avatar-btn" onclick={pickAvatar} disabled={avatarUploading || avatarRemoving}
        aria-label="Change profile picture">
        <img class="profile-avatar" src={avatarSrc} alt="" />
        {#if user}
          <span class="avatar-cam" aria-hidden="true">{avatarUploading ? '…' : '📷'}</span>
        {/if}
      </button>
      {#if canRemoveAvatar}
        <button type="button" class="avatar-remove-btn" onclick={onRemoveAvatar} disabled={avatarRemoving}
          aria-label="Remove profile picture">{avatarRemoving ? '…' : '✕'}</button>
      {/if}
    </div>
    <div class="profile-info">
      <div class="profile-name">{displayName}</div>
      <div class="profile-meta">Lv {xp.level} · {xp.title} · {xp.totalXP} XP</div>
    </div>
    <button class="profile-edit-pill" onclick={editProfile}>Edit</button>
  </div>
  <input type="file" accept="image/*" class="hidden" bind:this={avatarInputEl} onchange={onAvatarPicked} />
  {#if avatarStatus}
    <div class="import-status {avatarStatus.type}">{avatarStatus.text}</div>
  {/if}
```

with:

```svelte
  <!-- ── Profile ── -->
  <div class="settings-card profile-card">
    <button type="button" class="avatar-btn" onclick={pickAvatar} aria-label="Change profile picture">
      <img class="profile-avatar" src={avatarSrc} alt="" />
    </button>
    <div class="profile-info">
      <div class="profile-name">{displayName}</div>
      <div class="profile-meta">Lv {xp.level} · {xp.title} · {xp.totalXP} XP</div>
    </div>
    <button class="profile-edit-pill" onclick={editProfile}>Edit</button>
  </div>
  {#if avatarModalOpen}
    <AvatarModal
      initialSrc={avatarSrc}
      hasAvatar={canRemoveAvatar}
      defaultAvatar={DEFAULT_AVATAR}
      onchange={onAvatarModalChange}
      onclose={() => (avatarModalOpen = false)}
    />
  {/if}
```

- [ ] **Step 6: Remove the now-unused `.avatar-wrap`, `.avatar-cam`, `.avatar-remove-btn` styles**

In the `<style>` block of `src/lib/components/Settings.svelte`, delete these three rule blocks (they no longer have any matching markup):

```css
  .avatar-wrap {
    position: relative;
    flex: 0 0 auto;
  }
```

```css
  .avatar-cam {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--surface);
    border: 1.5px solid var(--card-border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.62rem;
  }
```

```css
  .avatar-remove-btn {
    position: absolute;
    top: -2px;
    right: -2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--wrong);
    color: var(--on-accent);
    border: 1.5px solid var(--surface);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.58rem;
    font-weight: 800;
    line-height: 1;
    padding: 0;
    cursor: pointer;
  }

  .avatar-remove-btn:disabled {
    cursor: default;
    opacity: 0.6;
  }
```

Update `.avatar-btn` to add `flex: 0 0 auto;` (previously provided by the now-deleted `.avatar-wrap` wrapper) and keep its `:disabled` rule but note it's now only ever applied when `AvatarModal` is closed and `pickAvatar` is instant, so `disabled` is no longer set on this button at all — remove the `disabled={...}` binding (done in Step 5) but the CSS rule itself is harmless to leave for now; delete it too for cleanliness:

```css
  .avatar-btn {
    position: relative;
    padding: 0;
    border: none;
    background: none;
    border-radius: 50%;
    cursor: pointer;
    line-height: 0;
    flex: 0 0 auto;
  }
```

(remove the separate `.avatar-btn:disabled { cursor: default; opacity: 0.7; }` rule below it.)

- [ ] **Step 7: Run the full test suite to verify everything passes**

Run: `npx vitest run tests/settingsScreen.test.js tests/avatarUpload.test.js tests/avatarModal.test.js`
Expected: PASS — all three files, including the `'keeps every imperatively wired element id in the DOM while collapsed'` test (unaffected, none of the wired ids touched this feature) and the new modal-based avatar tests from Step 2.

- [ ] **Step 8: Run the entire project test suite as a regression check**

Run: `npx vitest run`
Expected: PASS — no other test file references `.avatar-cam`, `.avatar-remove-btn`, `.avatar-wrap`, or the old file-input-based avatar flow.

- [ ] **Step 9: Commit**

```bash
git add src/lib/components/Settings.svelte tests/settingsScreen.test.js
git commit -m "feat: open AvatarModal on avatar tap instead of a direct file picker"
```

---

### Task 4: Manual verification in the browser

**Files:** none (verification only, using the project's `verify` skill/pattern).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background) — note the actual port from its output.

- [ ] **Step 2: Drive it with the `verify` skill's Edge/playwright-core recipe**

Seed `localStorage` with `setup_complete = '1'` to skip onboarding, navigate to the Settings tab, and as a signed-out guest: confirm tapping the avatar opens Advanced/Account (no modal). Because real avatar upload/remove requires a signed-in Supabase session (magic-link auth, not automatable headlessly per the project's auth model), full upload/remove verification against live Supabase is the user's manual pass — report this limitation rather than claiming it as machine-verified.

- [ ] **Step 3: Ask the user to manually verify the signed-in flow**

Ask the user to sign in in a real browser and confirm: tapping the avatar opens the "Change your avatar" modal matching the reference screenshot, "Add new avatar" → picking a photo uploads and updates the preview immediately, the restrictions caption text is correct, "Remove" works with no confirm dialog, and Cancel/X close the modal (disabled mid-upload).
