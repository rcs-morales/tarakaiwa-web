# Preset Character Avatars & Header Avatar Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users pick one of the 7 existing VOICEVOX character portraits as their profile avatar from `AvatarModal`, and show whichever avatar (custom upload or preset) a signed-in user has set in the top-bar account icon, not just on the Settings screen.

**Architecture:** Picking a preset reuses the existing upload pipeline — fetch the bundled PNG as a blob, resize/re-encode it through the existing `cropResizeToSquare()`, and store it exactly like a custom upload (same `avatars/<uid>/avatar.jpg` storage path, same `profiles.avatar_url` column). No schema changes. Avatar/user state currently duplicated only in `Settings.svelte` moves into a new shared module `src/lib/profile.svelte.js` (module-level `$state`, same pattern as `decks.svelte.js`/`session.svelte.js`/`shell.svelte.js`), loaded once by `Shell.svelte` (the app's single long-lived root) and read reactively by both `Settings.svelte` and `Shell.svelte`.

**Tech Stack:** SvelteKit (Svelte 5 runes), Vitest + `@testing-library/svelte`, Supabase JS client + Storage.

## Global Constraints

- Presets are the 7 existing files in `public/assets/`: `zundamon.png`, `shikoku_metan.png`, `kasukabe_tsumugi.png`, `sayo.png`, `aoyama_ryusei.png`, `shirakami_kotarou.png`, `kurono_takehiro.png`. No new artwork.
- A picked preset is stored via the same pipeline as a custom upload (fetch → `cropResizeToSquare()` → upload to `avatars/<uid>/avatar.jpg` → write `profiles.avatar_url`). `avatar_url` never holds a raw static asset path — always a Supabase storage URL.
- The preset grid renders between the preview image and the Add/Cancel buttons in `AvatarModal`, labeled "Or choose a character". No "currently selected" highlight on the grid.
- Header avatar (`Shell.svelte`'s `#btn-account-menu`) shows the real avatar only when signed in (custom, preset, or the `zundamon.png` default). Signed-out stays the plain 👤 emoji.
- Avatar/user state lives in one shared module (`src/lib/profile.svelte.js`), loaded once via `watchProfile()` called from `Shell.svelte`'s `onMount` — `Settings.svelte` only reads it, it does not load it independently (avoids duplicate `fetchAvatarUrl` calls and duplicate `onAuthChange` subscriptions).
- `npm test` must pass after every task; the app must remain buildable (no broken imports) after every task, not just at the end.

---

### Task 1: `avatarUpload.js` — preset support

**Files:**
- Modify: `src/lib/avatarUpload.js`
- Test: `tests/avatarUpload.test.js`

**Interfaces:**
- Consumes: `getCurrentUser()` (existing, `src/lib/auth.js`), `supabaseClient` (existing, `src/lib/supabase.js`), `cropResizeToSquare(blobOrFile, size?)` (existing, this file), global `fetch` (browser).
- Produces:
  - `AVATAR_PRESETS: Array<{ id: string, name: string, path: string }>` — 7 entries.
  - `selectPresetAvatar(id: string): Promise<string>` — same return convention as `uploadAvatar` (cache-busted URL), throws on failure. Consumed by Task 2's `AvatarModal.svelte`.
  - `uploadAvatar(file)` behavior is unchanged (verified by existing tests, which must still pass after the internal refactor).

- [ ] **Step 1: Write the failing tests in `tests/avatarUpload.test.js`**

Add these imports alongside the existing ones near the top of the file:

```js
import {
  validateImageFile,
  cropResizeToSquare,
  fetchAvatarUrl,
  uploadAvatar,
  removeAvatar,
  selectPresetAvatar,
  AVATAR_PRESETS,
  MAX_UPLOAD_BYTES,
  MAX_OUTPUT_BYTES,
  AVATAR_SIZE,
} from '../src/lib/avatarUpload.js';
```

Add a new `describe('selectPresetAvatar', ...)` block right after the closing `});` of the `describe('cropResizeToSquare / uploadAvatar (canvas-stubbed)', ...)` block (so it's still inside the file, after line 193, and can reuse the same canvas/`createImageBitmap` stubbing by nesting inside that same outer `describe`). Nest it as the last child of that outer describe, right after the existing `describe('uploadAvatar', ...)` block (so it shares the same `beforeEach`/`afterEach` canvas stubs):

```js
  describe('selectPresetAvatar', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    it('exposes exactly the 7 bundled character portraits', () => {
      expect(AVATAR_PRESETS).toHaveLength(7);
      for (const preset of AVATAR_PRESETS) {
        expect(preset.id).toEqual(expect.any(String));
        expect(preset.name).toEqual(expect.any(String));
        expect(preset.path).toMatch(/^\/assets\/.+\.png$/);
      }
    });

    it('throws when logged out, without fetching', async () => {
      getCurrentUser.mockReturnValue(null);
      await expect(selectPresetAvatar('zundamon')).rejects.toThrow('Sign in');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('throws for an unknown preset id', async () => {
      getCurrentUser.mockReturnValue({ id: 'user-123', email: 'me@example.com' });
      await expect(selectPresetAvatar('nope')).rejects.toThrow('Unknown avatar.');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('throws when the preset image fails to load', async () => {
      getCurrentUser.mockReturnValue({ id: 'user-123', email: 'me@example.com' });
      fetch.mockResolvedValue({ ok: false });
      await expect(selectPresetAvatar('zundamon')).rejects.toThrow('Could not load that avatar.');
      expect(supabaseClient.storage.from).not.toHaveBeenCalled();
    });

    it('fetches the preset image, resizes it, and stores it exactly like a normal upload', async () => {
      getCurrentUser.mockReturnValue({ id: 'user-123', email: 'me@example.com' });
      const sourceBlob = new Blob(['fake-png-bytes'], { type: 'image/png' });
      fetch.mockResolvedValue({ ok: true, blob: async () => sourceBlob });

      const upload = vi.fn().mockResolvedValue({ error: null });
      const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: 'https://x.supabase.co/storage/v1/object/public/avatars/user-123/avatar.jpg' } });
      supabaseClient.storage.from.mockReturnValue({ upload, getPublicUrl });
      const eq = vi.fn().mockResolvedValue({ error: null });
      supabaseClient.from.mockReturnValue({ update: vi.fn().mockReturnValue({ eq }) });

      const url = await selectPresetAvatar('zundamon');

      expect(fetch).toHaveBeenCalledWith('/assets/zundamon.png');
      expect(upload).toHaveBeenCalledWith('user-123/avatar.jpg', fakeBlob, expect.objectContaining({ upsert: true, contentType: 'image/jpeg' }));
      expect(url).toMatch(/^https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/avatars\/user-123\/avatar\.jpg\?v=\d+$/);
    });

    it('throws when the storage upload fails, same as uploadAvatar', async () => {
      getCurrentUser.mockReturnValue({ id: 'user-123', email: 'me@example.com' });
      fetch.mockResolvedValue({ ok: true, blob: async () => new Blob(['x'], { type: 'image/png' }) });
      supabaseClient.storage.from.mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: new Error('network down') }), getPublicUrl: vi.fn() });

      await expect(selectPresetAvatar('zundamon')).rejects.toThrow('network down');
      expect(supabaseClient.from).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/avatarUpload.test.js`
Expected: FAIL — `selectPresetAvatar`/`AVATAR_PRESETS` are not exported yet (`SyntaxError` or `undefined` import).

- [ ] **Step 3: Implement in `src/lib/avatarUpload.js`**

Extract the storage/DB tail of `uploadAvatar` into an internal `storeAvatarBlob(blob, user)` helper, add `AVATAR_PRESETS`, and add `selectPresetAvatar`. Replace the existing `uploadAvatar` function (and everything below it) with:

```js
export const AVATAR_PRESETS = [
  { id: 'zundamon', name: 'Zundamon', path: '/assets/zundamon.png' },
  { id: 'shikoku_metan', name: 'Shikoku Metan', path: '/assets/shikoku_metan.png' },
  { id: 'kasukabe_tsumugi', name: 'Kasukabe Tsumugi', path: '/assets/kasukabe_tsumugi.png' },
  { id: 'sayo', name: 'Sayo', path: '/assets/sayo.png' },
  { id: 'aoyama_ryusei', name: 'Aoyama Ryusei', path: '/assets/aoyama_ryusei.png' },
  { id: 'shirakami_kotarou', name: 'Shirakami Kotarou', path: '/assets/shirakami_kotarou.png' },
  { id: 'kurono_takehiro', name: 'Takehiro', path: '/assets/kurono_takehiro.png' },
];

/**
 * Upload `blob` to the signed-in `user`'s storage path (upsert) and write
 * `profiles.avatar_url`. Returns a cache-busted public URL. Throws on
 * failure — shared tail for both a custom upload and a preset pick.
 * @returns {Promise<string>}
 */
async function storeAvatarBlob(blob, user) {
  const path = `${user.id}/avatar.jpg`;

  const { error: uploadError } = await supabaseClient.storage
    .from(BUCKET)
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
  if (uploadError) throw uploadError;

  const { data: pub } = supabaseClient.storage.from(BUCKET).getPublicUrl(path);
  const baseUrl = pub.publicUrl;

  const { error: dbError } = await supabaseClient
    .from('profiles')
    .update({ avatar_url: baseUrl })
    .eq('id', user.id);
  if (dbError) throw dbError;

  // The object path is stable across re-uploads, so bust the cache at render
  // time rather than storing a versioned URL in the database.
  return `${baseUrl}?v=${Date.now()}`;
}

/**
 * Full flow: validate → crop/resize → upload (upsert) → write profiles.avatar_url.
 * Returns a cache-busted public URL to display immediately. Throws on failure —
 * the caller shows the message via its own status UI.
 * @returns {Promise<string>}
 */
export async function uploadAvatar(file) {
  const user = getCurrentUser();
  if (!user) throw new Error('Sign in to set a profile picture.');

  validateImageFile(file);
  const blob = await cropResizeToSquare(file);
  return storeAvatarBlob(blob, user);
}

/**
 * Set one of the bundled character portraits (AVATAR_PRESETS) as the
 * signed-in user's avatar — fetches the bundled asset, resizes it through
 * the same pipeline as a custom upload, and stores it the same way.
 * @returns {Promise<string>}
 */
export async function selectPresetAvatar(id) {
  const user = getCurrentUser();
  if (!user) throw new Error('Sign in to set a profile picture.');

  const preset = AVATAR_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error('Unknown avatar.');

  const response = await fetch(preset.path);
  if (!response.ok) throw new Error('Could not load that avatar.');
  const sourceBlob = await response.blob();

  const blob = await cropResizeToSquare(sourceBlob);
  return storeAvatarBlob(blob, user);
}

/**
 * Delete the signed-in user's stored avatar (storage object + profiles.avatar_url).
 * Throws on failure — the caller shows the message via its own status UI.
 */
export async function removeAvatar() {
  const user = getCurrentUser();
  if (!user) throw new Error('Sign in to manage your profile picture.');

  const path = `${user.id}/avatar.jpg`;

  const { error: removeError } = await supabaseClient.storage.from(BUCKET).remove([path]);
  if (removeError) throw removeError;

  const { error: dbError } = await supabaseClient
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', user.id);
  if (dbError) throw dbError;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/avatarUpload.test.js`
Expected: PASS — all `selectPresetAvatar` cases pass, and every pre-existing `uploadAvatar`/`fetchAvatarUrl`/`removeAvatar`/`cropResizeToSquare`/`validateImageFile` test still passes unchanged (confirms the `storeAvatarBlob` extraction didn't change `uploadAvatar`'s behavior or call sequence).

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/avatarUpload.js tests/avatarUpload.test.js
git commit -m "feat: add selectPresetAvatar — set a bundled character portrait as your avatar"
```

---

### Task 2: `AvatarModal.svelte` — preset picker grid

**Files:**
- Modify: `src/lib/components/AvatarModal.svelte`
- Test: `tests/avatarModal.test.js`

**Interfaces:**
- Consumes: `selectPresetAvatar(id)`, `AVATAR_PRESETS` (Task 1, `src/lib/avatarUpload.js`).
- Produces: no new props — same `{ initialSrc, hasAvatar, defaultAvatar, onchange, onclose }` contract as today.

- [ ] **Step 1: Write the failing tests in `tests/avatarModal.test.js`**

Replace the `vi.mock('$lib/avatarUpload.js', ...)` block at the top with:

```js
const AVATAR_PRESETS = [
  { id: 'a', name: 'Preset A', path: '/assets/a.png' },
  { id: 'b', name: 'Preset B', path: '/assets/b.png' },
];

vi.mock('$lib/avatarUpload.js', () => ({
  uploadAvatar: vi.fn(),
  removeAvatar: vi.fn(),
  selectPresetAvatar: vi.fn(),
  AVATAR_PRESETS,
}));

import AvatarModal from '../src/lib/components/AvatarModal.svelte';
import { uploadAvatar, removeAvatar, selectPresetAvatar } from '$lib/avatarUpload.js';
```

Add `selectPresetAvatar.mockReset();` inside the existing `beforeEach` (alongside `uploadAvatar.mockReset()` and `removeAvatar.mockReset()`).

Add these new test cases inside the `describe('AvatarModal', ...)` block, after the existing "disables Cancel and the X while an upload is in flight" test:

```js
  it('renders a thumbnail button for every preset in AVATAR_PRESETS', () => {
    const { container } = renderModal();
    const buttons = container.querySelectorAll('.avm-preset-btn');
    expect(buttons).toHaveLength(AVATAR_PRESETS.length);
    AVATAR_PRESETS.forEach((preset, i) => {
      const img = buttons[i].querySelector('img');
      expect(img.src).toContain(preset.path);
      expect(img.alt).toBe(preset.name);
    });
  });

  it('tapping a preset selects it, updates the preview, shows success, and reports the new URL', async () => {
    selectPresetAvatar.mockResolvedValue('https://x/avatars/u1/avatar.jpg?v=7');
    const onchange = vi.fn();
    const { container } = renderModal({ onchange });

    await fireEvent.click(container.querySelectorAll('.avm-preset-btn')[0]);

    await waitFor(() => expect(selectPresetAvatar).toHaveBeenCalledWith('a'));
    await waitFor(() => expect(container.querySelector('.avm-preview').src).toContain('?v=7'));
    expect(container.querySelector('.import-status.success').textContent).toContain('updated');
    expect(onchange).toHaveBeenCalledWith('https://x/avatars/u1/avatar.jpg?v=7');
  });

  it('a failed preset selection shows an error status and keeps the previous preview', async () => {
    selectPresetAvatar.mockRejectedValue(new Error('Could not load that avatar.'));
    const { container } = renderModal();

    await fireEvent.click(container.querySelectorAll('.avm-preset-btn')[0]);

    await waitFor(() => expect(container.querySelector('.import-status.error')).not.toBeNull());
    expect(container.querySelector('.import-status.error').textContent).toContain('Could not load that avatar.');
    expect(container.querySelector('.avm-preview').src).toContain('avatars/u1/avatar.jpg');
  });

  it('disables the preset buttons while an upload is in flight', async () => {
    let resolveUpload;
    uploadAvatar.mockReturnValue(new Promise((resolve) => { resolveUpload = resolve; }));
    const { container } = renderModal();

    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const input = container.querySelector('input[type="file"]');
    await fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(container.querySelectorAll('.avm-preset-btn')[0].disabled).toBe(true));
    resolveUpload('https://x/avatars/u1/avatar.jpg?v=1');
    await waitFor(() => expect(container.querySelectorAll('.avm-preset-btn')[0].disabled).toBe(false));
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/avatarModal.test.js`
Expected: FAIL — `.avm-preset-btn` doesn't exist yet.

- [ ] **Step 3: Implement the preset grid in `src/lib/components/AvatarModal.svelte`**

Update the import line:

```js
import { uploadAvatar, removeAvatar, selectPresetAvatar, AVATAR_PRESETS } from '$lib/avatarUpload.js';
```

Add this function after `onFilePicked` (before `async function remove()`):

```js
  async function pickPreset(id) {
    if (busy) return;
    uploading = true;
    status = { text: 'Setting avatar…', type: 'info' };
    try {
      const url = await selectPresetAvatar(id);
      previewSrc = url;
      hasAvatar = true;
      status = { text: 'Profile picture updated.', type: 'success' };
      onchange(url);
    } catch (err) {
      console.error('avatar preset select failed:', err);
      status = { text: err.message || 'Could not set that avatar.', type: 'error' };
    } finally {
      uploading = false;
    }
  }
```

Insert this markup between the `<img class="avm-preview" ... />` line and the hidden file `<input>`:

```svelte
    <div class="avm-presets">
      <div class="avm-presets-label">Or choose a character</div>
      <div class="avm-preset-grid">
        {#each AVATAR_PRESETS as preset (preset.id)}
          <button
            type="button"
            class="avm-preset-btn"
            onclick={() => pickPreset(preset.id)}
            disabled={busy}
            aria-label={preset.name}
          >
            <img class="avm-preset-thumb" src={preset.path} alt={preset.name} />
          </button>
        {/each}
      </div>
    </div>
```

Add this CSS inside the `<style>` block, after the `.avm-preview` rule:

```css
  .avm-presets {
    margin-bottom: 16px;
  }

  .avm-presets-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--muted);
    text-align: center;
    margin-bottom: 8px;
  }

  .avm-preset-grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }

  .avm-preset-btn {
    padding: 0;
    border: 1.5px solid var(--card-border);
    border-radius: 50%;
    background: none;
    cursor: pointer;
    line-height: 0;
  }

  .avm-preset-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .avm-preset-thumb {
    display: block;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
    object-position: top;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/avatarModal.test.js`
Expected: PASS

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/AvatarModal.svelte tests/avatarModal.test.js
git commit -m "feat: add character preset picker to AvatarModal"
```

---

### Task 3: `src/lib/profile.svelte.js` — shared avatar/user state

**Files:**
- Create: `src/lib/profile.svelte.js`
- Test: `tests/profile.test.js`

**Interfaces:**
- Consumes: `getCurrentUser()`, `onAuthChange(cb)` (existing, `src/lib/auth.js`), `fetchAvatarUrl()` (existing, `src/lib/avatarUpload.js`).
- Produces:
  - `profile: { user, avatarUrl, avatarBusting }` (`$state` object).
  - `DEFAULT_AVATAR: string`.
  - `avatarSrc(): string`.
  - `applyAvatarChange(url: string | null): void`.
  - `watchProfile(): () => void` (returns the `onAuthChange` unsubscribe fn).
  - All four consumed by Task 4 (`Settings.svelte`) and Task 5 (`Shell.svelte`).

- [ ] **Step 1: Write the failing tests in `tests/profile.test.js`**

Create `tests/profile.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/auth.js', () => ({
  getCurrentUser: vi.fn(),
  onAuthChange: vi.fn(),
}));

vi.mock('../src/lib/avatarUpload.js', () => ({
  fetchAvatarUrl: vi.fn(),
}));

import { profile, DEFAULT_AVATAR, avatarSrc, applyAvatarChange, watchProfile } from '../src/lib/profile.svelte.js';
import { getCurrentUser, onAuthChange } from '../src/lib/auth.js';
import { fetchAvatarUrl } from '../src/lib/avatarUpload.js';

describe('avatarSrc', () => {
  beforeEach(() => {
    profile.user = null;
    profile.avatarUrl = null;
    profile.avatarBusting = '';
  });

  it('falls back to the default avatar when signed out', () => {
    expect(avatarSrc()).toBe(DEFAULT_AVATAR);
  });

  it('falls back to the default avatar when signed in with no stored picture', () => {
    profile.user = { id: 'u1' };
    expect(avatarSrc()).toBe(DEFAULT_AVATAR);
  });

  it('returns the stored URL plus cache-busting query when both are set', () => {
    profile.user = { id: 'u1' };
    profile.avatarUrl = 'https://x/avatars/u1/avatar.jpg';
    profile.avatarBusting = '?v=42';
    expect(avatarSrc()).toBe('https://x/avatars/u1/avatar.jpg?v=42');
  });
});

describe('applyAvatarChange', () => {
  it('clears both fields when passed null', () => {
    profile.avatarUrl = 'https://x/avatar.jpg';
    profile.avatarBusting = '?v=1';
    applyAvatarChange(null);
    expect(profile.avatarUrl).toBeNull();
    expect(profile.avatarBusting).toBe('');
  });

  it('splits a cache-busted URL into avatarUrl and avatarBusting', () => {
    applyAvatarChange('https://x/avatars/u1/avatar.jpg?v=42');
    expect(profile.avatarUrl).toBe('https://x/avatars/u1/avatar.jpg');
    expect(profile.avatarBusting).toBe('?v=42');
  });

  it('handles a URL with no query string', () => {
    applyAvatarChange('https://x/avatars/u1/avatar.jpg');
    expect(profile.avatarUrl).toBe('https://x/avatars/u1/avatar.jpg');
    expect(profile.avatarBusting).toBe('');
  });
});

describe('watchProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profile.user = null;
    profile.avatarUrl = null;
    profile.avatarBusting = '';
  });

  it('loads the current user and avatar, and subscribes to auth changes', async () => {
    getCurrentUser.mockReturnValue({ id: 'u1' });
    fetchAvatarUrl.mockResolvedValue('https://x/avatars/u1/avatar.jpg');

    watchProfile();

    expect(profile.user).toEqual({ id: 'u1' });
    await vi.waitFor(() => expect(profile.avatarUrl).toBe('https://x/avatars/u1/avatar.jpg'));
    expect(onAuthChange).toHaveBeenCalledTimes(1);
  });

  it('does not fetch the avatar when signed out', async () => {
    getCurrentUser.mockReturnValue(null);
    watchProfile();
    expect(profile.user).toBeNull();
    expect(fetchAvatarUrl).not.toHaveBeenCalled();
  });

  it('reloads user/avatar when the subscribed auth callback fires', async () => {
    getCurrentUser.mockReturnValue({ id: 'u1' });
    fetchAvatarUrl.mockResolvedValue('https://x/avatars/u1/avatar.jpg');
    watchProfile();
    await vi.waitFor(() => expect(profile.avatarUrl).toBe('https://x/avatars/u1/avatar.jpg'));

    const authCallback = onAuthChange.mock.calls[0][0];
    fetchAvatarUrl.mockClear();
    authCallback(null);

    expect(profile.user).toBeNull();
    await vi.waitFor(() => expect(profile.avatarUrl).toBeNull());
    expect(fetchAvatarUrl).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/profile.test.js`
Expected: FAIL — `src/lib/profile.svelte.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/lib/profile.svelte.js`**

```js
// ─────────────────────────────────────────────
// PROFILE — shared avatar/user state, single source of truth for
// Settings.svelte (profile card) and Shell.svelte (header account icon).
// Loaded once via watchProfile(), called from Shell's onMount — the app's
// single long-lived root. Other consumers just read `profile` reactively.
// ─────────────────────────────────────────────

import { getCurrentUser, onAuthChange } from './auth.js';
import { fetchAvatarUrl } from './avatarUpload.js';

export const DEFAULT_AVATAR = '/assets/zundamon.png';

export const profile = $state({
  user: null,
  avatarUrl: null,     // stored base URL from profiles, or null
  avatarBusting: '',   // '?v=…' appended right after a fresh upload
});

async function loadAvatar() {
  profile.avatarUrl = profile.user ? await fetchAvatarUrl() : null;
  profile.avatarBusting = '';
}

/** Guests (or signed-in with no stored picture yet) fall back to the same
 *  default every user saw before this feature existed. */
export function avatarSrc() {
  return profile.user && profile.avatarUrl
    ? profile.avatarUrl + profile.avatarBusting
    : DEFAULT_AVATAR;
}

/** AvatarModal reports the outcome via this rather than reaching into
 *  component state directly. url is a full cache-busted URL on a
 *  successful upload/preset pick, or null after a successful removal. */
export function applyAvatarChange(url) {
  if (url === null) {
    profile.avatarUrl = null;
    profile.avatarBusting = '';
    return;
  }
  const qIndex = url.indexOf('?');
  profile.avatarUrl = qIndex === -1 ? url : url.slice(0, qIndex);
  profile.avatarBusting = qIndex === -1 ? '' : url.slice(qIndex);
}

/**
 * Load the current user/avatar and subscribe to auth changes. Call once
 * from Shell's onMount. Returns the onAuthChange unsubscribe function.
 */
export function watchProfile() {
  profile.user = getCurrentUser();
  loadAvatar();
  return onAuthChange((u) => { profile.user = u; loadAvatar(); });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/profile.test.js`
Expected: PASS

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/profile.svelte.js tests/profile.test.js
git commit -m "feat: add shared profile.svelte.js avatar/user state module"
```

---

### Task 4: Wire `profile.svelte.js` into `Settings.svelte`

**Files:**
- Modify: `src/lib/components/Settings.svelte`
- Test: `tests/settingsScreen.test.js`

**Interfaces:**
- Consumes: `profile`, `DEFAULT_AVATAR`, `avatarSrc()`, `applyAvatarChange(url)` (Task 3, `src/lib/profile.svelte.js`).

- [ ] **Step 1: Update `tests/settingsScreen.test.js` (failing)**

Replace lines 1–22 (the imports/mocks header) with:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent, waitFor } from '@testing-library/dom';

const AVATAR_PRESETS = [
  { id: 'a', name: 'Preset A', path: '/assets/a.png' },
  { id: 'b', name: 'Preset B', path: '/assets/b.png' },
];

vi.mock('$lib/avatarUpload.js', () => ({
  uploadAvatar: vi.fn(),
  removeAvatar: vi.fn(),
  selectPresetAvatar: vi.fn(),
  AVATAR_PRESETS,
}));

import Settings from '../src/lib/components/Settings.svelte';
import { history, recordSession } from '../src/lib/history.svelte.js';
import { initPrefs, prefs } from '../src/lib/prefs.svelte.js';
import { get, KEYS } from '../src/lib/settings.js';
import { uploadAvatar, removeAvatar } from '$lib/avatarUpload.js';
import { profile } from '../src/lib/profile.svelte.js';
```

(This drops the `$lib/auth.js` mock and `fetchAvatarUrl` entirely — `Settings.svelte` no longer imports either; it reads the shared `profile` module instead.)

In the `beforeEach` (around line 46), replace:

```js
  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    history.entries = [];
    initPrefs();
    mockGetCurrentUser.mockReturnValue(null);
    fetchAvatarUrl.mockReset().mockResolvedValue(null);
    uploadAvatar.mockReset().mockResolvedValue('https://x/avatars/u1/avatar.jpg?v=1');
    removeAvatar.mockReset().mockResolvedValue(undefined);
  });
```

with:

```js
  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    history.entries = [];
    initPrefs();
    profile.user = null;
    profile.avatarUrl = null;
    profile.avatarBusting = '';
    uploadAvatar.mockReset().mockResolvedValue('https://x/avatars/u1/avatar.jpg?v=1');
    removeAvatar.mockReset().mockResolvedValue(undefined);
  });
```

Replace the five avatar tests (the `it('shows the default avatar while signed out...')` through `it('removing inside the modal reverts the small Settings avatar to the placeholder')` block, i.e. everything from that first avatar `it(` down to the closing `});` right before the outer `describe`'s final `});`) with:

```js
  it('shows the default avatar while signed out, and tapping it opens Advanced/Account instead of a picker', async () => {
    const { container } = render(Settings);

    expect(container.querySelector('.profile-avatar').src).toContain('/assets/zundamon.png');

    await fireEvent.click(container.querySelector('.avatar-btn'));

    expect(container.querySelector('.advanced-body').classList.contains('open')).toBe(true);
    expect(container.querySelector('.modal')).toBeNull();
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it('shows the current avatar when signed in', () => {
    profile.user = { id: 'u1', email: 'me@example.com' };
    profile.avatarUrl = 'https://x/avatars/u1/avatar.jpg';

    const { container } = render(Settings);

    expect(container.querySelector('.profile-avatar').src).toContain('avatars/u1/avatar.jpg');
  });

  it('tapping the avatar while signed in opens AvatarModal instead of a native picker', async () => {
    profile.user = { id: 'u1', email: 'me@example.com' };
    profile.avatarUrl = 'https://x/avatars/u1/avatar.jpg';

    const { container } = render(Settings);
    await fireEvent.click(container.querySelector('.avatar-btn'));

    expect(container.querySelector('.avm-card')).not.toBeNull();
    expect(container.querySelector('.avm-preview').src).toContain('avatars/u1/avatar.jpg');
  });

  it('uploading inside the modal updates the small Settings avatar and closing the modal removes it', async () => {
    profile.user = { id: 'u1', email: 'me@example.com' };
    profile.avatarUrl = 'https://x/avatars/u1/avatar.jpg';
    uploadAvatar.mockResolvedValue('https://x/avatars/u1/avatar.jpg?v=42');

    const { container } = render(Settings);
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
    profile.user = { id: 'u1', email: 'me@example.com' };
    profile.avatarUrl = 'https://x/avatars/u1/avatar.jpg';
    removeAvatar.mockResolvedValue(undefined);

    const { container } = render(Settings);
    await fireEvent.click(container.querySelector('.avatar-btn'));

    await waitFor(() => expect(container.querySelector('.avm-remove')).not.toBeNull());
    await fireEvent.click(container.querySelector('.avm-remove'));

    await waitFor(() => expect(container.querySelector('.profile-avatar').src).toContain('/assets/zundamon.png'));
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/settingsScreen.test.js`
Expected: FAIL — `Settings.svelte` still owns its own `user`/`avatarUrl` state, so seeding `profile.user`/`profile.avatarUrl` directly has no effect yet.

- [ ] **Step 3: Implement the changes in `src/lib/components/Settings.svelte`**

Replace the import block (lines 9–15):

```js
  import { onMount } from 'svelte';
  import { history } from '$lib/history.svelte.js';
  import { computeXP } from '$lib/gamification.svelte.js';
  import { prefs, setAid, setDailyGoal, DAILY_GOAL_MIN, DAILY_GOAL_MAX } from '$lib/prefs.svelte.js';
  import { getCurrentUser, onAuthChange } from '$lib/auth.js';
  import { fetchAvatarUrl } from '$lib/avatarUpload.js';
  import AvatarModal from './AvatarModal.svelte';
```

with:

```js
  import { history } from '$lib/history.svelte.js';
  import { computeXP } from '$lib/gamification.svelte.js';
  import { prefs, setAid, setDailyGoal, DAILY_GOAL_MIN, DAILY_GOAL_MAX } from '$lib/prefs.svelte.js';
  import { profile, DEFAULT_AVATAR, avatarSrc, applyAvatarChange } from '$lib/profile.svelte.js';
  import AvatarModal from './AvatarModal.svelte';
```

Replace lines 19–44 (from `let user = $state(null);` through the closing `});` of the avatar `onMount`):

```js
  let user = $state(null);
  let advancedOpen = $state(false);

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

  onMount(() => {
    user = getCurrentUser();
    loadAvatar();
    onAuthChange((u) => { user = u; loadAvatar(); });
  });

  const displayName = $derived(user?.email ? user.email.split('@')[0] : 'ゲスト · Guest');
```

with:

```js
  let advancedOpen = $state(false);
  let avatarModalOpen = $state(false);

  // Only signed-in users with an actual stored photo get a remove option —
  // nothing to remove for a guest or a user already on the placeholder.
  const canRemoveAvatar = $derived(!!profile.user && !!profile.avatarUrl);

  const displayName = $derived(profile.user?.email ? profile.user.email.split('@')[0] : 'ゲスト · Guest');
```

Replace the `pickAvatar` function:

```js
  function pickAvatar() {
    if (!user) { editProfile(); return; }
    avatarModalOpen = true;
  }
```

with:

```js
  function pickAvatar() {
    if (!profile.user) { editProfile(); return; }
    avatarModalOpen = true;
  }
```

Delete the `onAvatarModalChange` function entirely (lines 63–76 — the comment block and the function body):

```js
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

In the template, replace:

```svelte
    <button type="button" class="avatar-btn" onclick={pickAvatar} aria-label="Change profile picture">
      <img class="profile-avatar" src={avatarSrc} alt="" />
    </button>
```

with:

```svelte
    <button type="button" class="avatar-btn" onclick={pickAvatar} aria-label="Change profile picture">
      <img class="profile-avatar" src={avatarSrc()} alt="" />
    </button>
```

and replace:

```svelte
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

with:

```svelte
  {#if avatarModalOpen}
    <AvatarModal
      initialSrc={avatarSrc()}
      hasAvatar={canRemoveAvatar}
      defaultAvatar={DEFAULT_AVATAR}
      onchange={applyAvatarChange}
      onclose={() => (avatarModalOpen = false)}
    />
  {/if}
```

Finally, near the bottom of the template, replace:

```svelte
  {#if user}
    <button class="btn btn-secondary signout-btn" onclick={signOut}>サインアウト · Sign out</button>
  {/if}
```

with:

```svelte
  {#if profile.user}
    <button class="btn btn-secondary signout-btn" onclick={signOut}>サインアウト · Sign out</button>
  {/if}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/settingsScreen.test.js`
Expected: PASS

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/Settings.svelte tests/settingsScreen.test.js
git commit -m "refactor: Settings reads avatar/user state from shared profile.svelte.js"
```

---

### Task 5: Wire `profile.svelte.js` into `Shell.svelte`

**Files:**
- Modify: `src/lib/components/Shell.svelte`
- Test: `tests/shell.test.js`

**Interfaces:**
- Consumes: `profile`, `avatarSrc()`, `watchProfile()` (Task 3, `src/lib/profile.svelte.js`).

- [ ] **Step 1: Update `tests/shell.test.js` (failing)**

Replace the file's header (imports, before `describe('App Shell', ...)`) with:

```js
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
```

Replace the existing `beforeEach`:

```js
  beforeEach(() => {
    // module-level state persists between tests — reset it
    setTab('practice');
  });
```

with:

```js
  beforeEach(() => {
    // module-level state persists between tests — reset it
    setTab('practice');
    mockGetCurrentUser.mockReturnValue(null);
    fetchAvatarUrl.mockReset().mockResolvedValue(null);
  });
```

Add these new test cases at the end of the `describe('App Shell', ...)` block, after the existing "opens the account menu and jumps to Settings from it" test:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/shell.test.js`
Expected: FAIL — `.account-avatar` doesn't exist yet, and `$lib/auth.js`/`$lib/avatarUpload.js` aren't consumed by `Shell.svelte` yet.

- [ ] **Step 3: Implement the changes in `src/lib/components/Shell.svelte`**

Replace the script block's imports and props:

```js
  import { shell, setTab, TABS } from '$lib/shell.svelte.js';
  import { history, computeStats } from '$lib/history.svelte.js';
  import { computeXP } from '$lib/gamification.svelte.js';

  let { children } = $props();
```

with:

```js
  import { onMount } from 'svelte';
  import { shell, setTab, TABS } from '$lib/shell.svelte.js';
  import { history, computeStats } from '$lib/history.svelte.js';
  import { computeXP } from '$lib/gamification.svelte.js';
  import { profile, avatarSrc, watchProfile } from '$lib/profile.svelte.js';

  let { children } = $props();

  onMount(() => watchProfile());
```

Replace the account-menu button:

```svelte
        <button
          class="icon-btn"
          id="btn-account-menu"
          title="Account"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          onclick={() => (menuOpen = !menuOpen)}
        >👤</button>
```

with:

```svelte
        <button
          class="icon-btn"
          id="btn-account-menu"
          title="Account"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          onclick={() => (menuOpen = !menuOpen)}
        >
          {#if profile.user}
            <img class="account-avatar" src={avatarSrc()} alt="" />
          {:else}
            👤
          {/if}
        </button>
```

Add this CSS inside the `<style>` block, right after the existing `.icon-btn:hover` rule:

```css
  .account-avatar {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    object-position: top;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/shell.test.js`
Expected: PASS

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/Shell.svelte tests/shell.test.js
git commit -m "feat: show the signed-in user's avatar in the header account icon"
```

---

### Task 6: Manual verification

**Files:** none (verification only — no code changes).

- [ ] **Step 1: Invoke the `verify` skill**

Use the project's `verify` skill (dev server + system Edge via `playwright-core`, with `setup_complete` seeded in `localStorage`) to confirm, signed in as a real Supabase test user (or a seeded session if the skill supports it):

1. Open Settings, tap the avatar → `AvatarModal` opens showing the 7 character thumbnails under "Or choose a character".
2. Tap one preset → status shows "Setting avatar…" then "Profile picture updated.", the modal's preview updates to that character, and the small Settings avatar updates too.
3. Close the modal — the top-bar account icon (previously 👤) now shows the same avatar.
4. Reopen `AvatarModal`, tap "Add new avatar" and upload a real photo — it replaces the preset avatar everywhere (Settings + header), confirming presets and custom uploads share the same storage slot.
5. Remove the avatar — Settings and the header both revert to the `zundamon.png` default; the header icon does NOT revert to the 👤 emoji (still signed in).
6. Sign out — the header icon reverts to 👤.

Expected: no `PAGE ERROR`/`PAGE EXCEPTION` lines, and every step above matches.

- [ ] **Step 2: Final full-suite confirmation**

Run: `npm test`
Expected: PASS — full suite green, no leftover `git status` changes.

## Self-Review Notes

- **Spec coverage:** `AVATAR_PRESETS`/`selectPresetAvatar`/`storeAvatarBlob` (Task 1) ✅, preset grid UI + placement + no-highlight (Task 2) ✅, shared `profile.svelte.js` module (Task 3) ✅, `Settings.svelte` reads-only wiring (Task 4) ✅, `Shell.svelte` header avatar + signed-out 👤 fallback (Task 5) ✅, manual end-to-end check (Task 6) ✅.
- **Placeholder scan:** none found — every step has complete code.
- **Type/name consistency checked:** `avatarSrc()` (function, not a rune export) and `applyAvatarChange(url)` are named and called identically across Task 3's implementation, Task 4's `Settings.svelte` wiring, and Task 5's `Shell.svelte` wiring. `AVATAR_PRESETS` shape (`{ id, name, path }`) is consistent across Task 1's implementation and Task 2/4's test fixtures. `watchProfile()` is called exactly once, from `Shell.svelte`'s `onMount` (Task 5) — `Settings.svelte` (Task 4) never calls it, only reads `profile` reactively, avoiding duplicate `fetchAvatarUrl` calls/`onAuthChange` subscriptions when both are mounted together.
