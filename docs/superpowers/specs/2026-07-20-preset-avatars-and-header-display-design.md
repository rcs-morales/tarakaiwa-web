# Preset Character Avatars & Header Avatar Display Design

## Context

Profile avatar upload/remove shipped on `feature/profile-avatar-upload`
(`src/lib/avatarUpload.js`, `src/lib/components/AvatarModal.svelte`, wired
into `src/lib/components/Settings.svelte`). Today `AvatarModal` only supports
uploading a custom photo or removing the current one.

The app already bundles 7 character portrait images for the VOICEVOX TTS
speaking avatar (`public/assets/{zundamon,shikoku_metan,kasukabe_tsumugi,
aoyama_ryusei,kurono_takehiro,sayo,shirakami_kotarou}.png`), unrelated to the
profile avatar. The user wants to reuse these as pickable profile-avatar
presets, and wants whichever avatar (custom or preset) a user has set to also
show up in the top-bar account icon, not just on the Settings screen.

## Scope / decisions (confirmed with user)

- **Preset source: the 7 existing VOICEVOX character portraits.** No new
  artwork.
- **Presets go through the same upload pipeline as a custom photo**, not a
  direct static-path reference. The source files are large (140KB–934KB) —
  far over the 32KB cap enforced for uploads — so pointing `avatar_url`
  straight at them would load near-1MB images in a 32px header thumbnail.
  Instead, picking a preset fetches the bundled PNG, resizes/re-encodes it
  through the existing `cropResizeToSquare()` (125×125, ≤32KB JPEG), and
  stores it via the same "upload to the user's storage path + write
  `profiles.avatar_url`" logic as `uploadAvatar()`. `avatar_url` always ends
  up as a normal Supabase storage URL — no second "kind" of value in that
  column, no schema change.
- **Preset grid sits between the preview image and the Add/Cancel buttons**
  in `AvatarModal`: preview → "Or choose a character" grid (7 thumbnails) →
  Add new avatar / Cancel → restrictions text → Remove.
- **No "currently selected" highlight on the grid.** Once stored, a preset
  pick is indistinguishable from a custom upload (same `avatar_url` shape) —
  there's nothing reliable to highlight. Explicitly out of scope.
- **Header avatar: signed-in only.** The top bar's account-menu icon
  (`#btn-account-menu`, currently a static 👤 that opens the account/sync
  menu) shows the real avatar (custom upload, chosen preset, or the
  `zundamon.png` default) once signed in. Guests keep the plain 👤 emoji —
  the icon stays a generic placeholder until there's an actual account behind
  it.
- **Avatar state is lifted into a shared module**, not duplicated between
  `Settings.svelte` and `Shell.svelte`. Follows the existing module-level
  `$state` pattern used by `decks.svelte.js`/`session.svelte.js`/
  `shell.svelte.js`.

## Design

### 1. `src/lib/avatarUpload.js`

- Extract the shared tail of `uploadAvatar()` (upload the resized blob to
  `avatars/<uid>/avatar.jpg`, write `profiles.avatar_url`, return the
  cache-busted URL) into an internal helper, `storeAvatarBlob(blob)`.
  `uploadAvatar(file)` becomes: `validateImageFile(file)` →
  `cropResizeToSquare(file)` → `storeAvatarBlob(blob)`.
- Add `export const AVATAR_PRESETS = [{ id, name, path }, ...]` — 7 entries,
  one per character, e.g. `{ id: 'zundamon', name: 'Zundamon', path:
  '/assets/zundamon.png' }`. Single source of truth for both the grid UI and
  the fetch-by-id logic.
- Add `export async function selectPresetAvatar(id)`:
  - Signed-in guard, same as `uploadAvatar` (`throw` if no user).
  - Look up the preset by `id` in `AVATAR_PRESETS`.
  - `fetch(path)` → `blob()` → `cropResizeToSquare(blob)` → `storeAvatarBlob(blob)`.
  - Skips `validateImageFile` — bundled assets are trusted, no need to
    re-check type/size of the app's own static files.
  - Same return convention as `uploadAvatar`: cache-busted URL string, throws
    on failure (fetch or storage) with a caller-facing message.

### 2. `src/lib/components/AvatarModal.svelte`

- New section between `.avm-preview` and `.avm-actions`: a labeled grid,
  `"Or choose a character"`, rendering `AVATAR_PRESETS` as small circular
  thumbnails (`img src={preset.path} alt={preset.name}`).
- Tapping a thumbnail calls `selectPresetAvatar(preset.id)`, reusing the
  existing `uploading`/`busy` state and status-line pattern from
  `onFilePicked` (status text `"Setting avatar…"` → `"Profile picture
  updated."` or an error message). Grid buttons disable while `busy`, same as
  the existing Add/Cancel/Remove buttons.
- No new busy flag, no new status states — presets are treated as just
  another way to arrive at `onchange(url)`.

### 3. New `src/lib/profile.svelte.js`

Module-level shared avatar/user state, replacing the copy that currently
lives only in `Settings.svelte`:

```js
export const DEFAULT_AVATAR = '/assets/zundamon.png';

export const profile = $state({
  user: null,
  avatarUrl: null,     // stored base URL from profiles, or null
  avatarBusting: '',   // '?v=…' appended right after a fresh upload
});

export function avatarSrc() {
  return profile.user && profile.avatarUrl
    ? profile.avatarUrl + profile.avatarBusting
    : DEFAULT_AVATAR;
}

// Called from AvatarModal's onchange: url is a cache-busted URL on success,
// or null after a removal.
export function applyAvatarChange(url) { ... same split-off-the-`?v=` logic
  Settings' onAvatarModalChange does today ... }

async function loadAvatar() {
  profile.avatarUrl = profile.user ? await fetchAvatarUrl() : null;
  profile.avatarBusting = '';
}

// Module-scope init, runs once on first import (same pattern as other
// *.svelte.js state modules' top-level setup).
profile.user = getCurrentUser();
loadAvatar();
onAuthChange((u) => { profile.user = u; loadAvatar(); });
```

### 4. `src/lib/components/Settings.svelte`

- Remove the local `user`, `avatarUrl`, `avatarBusting`, `loadAvatar()`,
  `avatarSrc` state and the `onMount`/`onAuthChange` wiring that currently
  duplicates it. Import `profile`, `DEFAULT_AVATAR`, `avatarSrc`,
  `applyAvatarChange` from `$lib/profile.svelte.js` instead.
- `AvatarModal`'s `onchange` prop becomes `applyAvatarChange` directly (no
  local `onAvatarModalChange` needed).
- `canRemoveAvatar` derivation (`!!user && !!avatarUrl`) now reads
  `profile.user`/`profile.avatarUrl`.
- Behavior is unchanged from the user's perspective — this is a pure
  state-ownership move.

### 5. `src/lib/components/Shell.svelte`

- Import `profile`, `DEFAULT_AVATAR`, `avatarSrc` from
  `$lib/profile.svelte.js`.
- `#btn-account-menu`'s content becomes conditional:
  - `{#if profile.user}` → `<img class="account-avatar" src={avatarSrc()} alt="" />`
  - `{:else}` → the existing `👤` emoji, unchanged.
- New `.account-avatar` style: same circular treatment as
  `.profile-avatar` in `Settings.svelte`, sized to fill the existing 36×36
  `.icon-btn` (e.g. `width/height: 100%; border-radius: 50%; object-fit:
  cover; object-position: top;`).
- No change to the bottom mobile tab bar — that's page navigation
  (practice/decks/dashboard/progress/settings tabs), not the account icon,
  and is out of scope.

## Testing

- `tests/avatarUpload.test.js`: add cases for `selectPresetAvatar` — success
  (mocks `fetch`/`cropResizeToSquare`/storage upload, asserts the returned
  cache-busted URL and the `profiles.avatar_url` write), not-signed-in
  (throws without fetching), fetch failure, storage failure. Add a case
  confirming `uploadAvatar` still works unchanged after the
  `storeAvatarBlob` extraction.
- `tests/avatarModal.test.js`: grid renders all 7 presets with correct `alt`
  text; tapping one calls `selectPresetAvatar` and updates the
  preview/status on success and on error; grid buttons disabled while `busy`.
- `tests/settingsScreen.test.js`: update for the `profile.svelte.js` import
  swap — behavior assertions should be unchanged, but mocks/setup need to
  target the new module.
- `tests/shell.test.js`: add cases — signed-out renders 👤; signed-in with no
  avatar renders `zundamon.png`; signed-in with a stored avatar renders that
  URL; account icon still opens the account menu regardless of avatar state.
