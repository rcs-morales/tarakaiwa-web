# Avatar Upload Modal & Size Restrictions Design

## Context

Profile avatar upload/remove shipped on `feature/profile-avatar-upload`
(`src/lib/avatarUpload.js`, wired into `src/lib/components/Settings.svelte`). A
production bug was found and fixed first: the `avatars` Storage bucket existed
but wasn't public (the migration's `on conflict (id) do nothing` silently
skipped flipping an already-existing bucket to public — fixed in
`supabase/migrations/0004_profile_avatars.sql` to `do update set public =
true`, and the live bucket flipped manually).

With upload/display confirmed working, the user asked for two follow-on
changes, refined into a reference-driven design (a classic Steam-style "change
your avatar" popup, screenshot supplied):

1. Tighter, explicit size/filesize restrictions on the uploaded image.
2. Tapping the avatar should open a dedicated management popup (preview +
   add/remove/cancel), not jump straight to the OS file picker.

## Scope / decisions (confirmed with user)

- **Restrictions: 125×125 stored size, 32KB max filesize after resizing,
  jpg/gif/png input only.** Matches the reference UI's caption text exactly.
  `AVATAR_SIZE` in `avatarUpload.js` drops from 256 to 125 — confirmed via
  grep that the profile avatar only ever renders at 52px in `Settings.svelte`
  (the other `avatar`/`zundamon.png` hits in the codebase are the unrelated
  Live2D practice-session character avatar), so no other call site needs the
  larger resolution.
- **GIFs flatten to a static image**, same as the existing JPEG-only output
  pipeline. `createImageBitmap` already decodes a GIF's first frame as a
  static bitmap, so no special-case animated-GIF handling is needed —
  flattening falls out of the existing crop/resize code for free.
- **32KB cap enforced by auto-lowering JPEG quality**, not by rejecting the
  upload. If the first-pass encode (quality 0.82) exceeds 32KB, re-encode at
  progressively lower quality until it fits or quality bottoms out. Upload
  never fails purely for being "too detailed a photo" at 125×125 — that
  should not happen in practice at this resolution, but the loop is the
  safety net.
- **New `AvatarModal.svelte`**, opened by tapping the avatar (signed-in only;
  signed-out tap still routes to `editProfile()` as today). Reuses the
  existing global `.modal`/`.modal-card` chrome (same pattern as
  `DeckFormModal.svelte`): backdrop-click-to-close, `role="dialog"
  aria-modal="true"`.
- **Upload starts immediately on file pick; modal stays open.** No separate
  "confirm" step — picking a file in the modal's file input starts the
  upload right away, the modal's preview updates live on success, and status
  text (uploading/success/error) shows inside the modal so the user can pick
  again or close when satisfied.
- **Cancel/X disabled while an upload or remove is in flight** — matches the
  existing `avatarUploading`/`avatarRemoving` disabled-state pattern already
  in `Settings.svelte`, and prevents closing mid-operation with no feedback
  on whether it went through.
- **Remove drops the `confirm()` popup.** Opening the modal is already the
  deliberate "manage my avatar" action, so the reference UI's plain "Remove"
  button fires directly — no second confirmation dialog.
- **The always-visible camera/✕ badge overlay on the small Settings avatar
  goes away.** The modal is now the single entry point for both add and
  remove, so those badges (added in the initial implementation) are removed
  as part of this change rather than left dangling.

## Design

### 1. `src/lib/avatarUpload.js`

- `AVATAR_SIZE` constant: `256` → `125`.
- `validateImageFile(file)`: replace the current `file.type.startsWith('image/')`
  check with an explicit allow-list — `['image/jpeg', 'image/png', 'image/gif']`
  — rejecting other image MIME types (e.g. `image/webp`) that the reference UI
  doesn't advertise support for. Error message: `'Please choose a JPG, PNG, or
  GIF image.'`.
- `cropResizeToSquare(file, size = AVATAR_SIZE)`: after the existing
  center-crop draw to canvas, replace the single `canvas.toBlob(..., 0.82)`
  call with a small quality-reduction loop:
  ```
  MAX_BYTES = 32 * 1024
  QUALITIES = [0.82, 0.65, 0.5, 0.35, 0.2]
  for q of QUALITIES:
    blob = await toBlob(canvas, 'image/jpeg', q)
    if blob.size <= MAX_BYTES: return blob
  return blob   // last (lowest-quality) attempt, even if still over — see below
  ```
  If even the lowest quality step is still over 32KB (only plausible for
  pathological inputs at 125×125), return that last blob rather than
  throwing — per the "never fails" decision, an oversized-by-a-little upload
  is preferable to a hard error the user can't do anything about by retrying
  the same image.
- `MAX_UPLOAD_BYTES` (the original-file 8MB pre-resize cap) is unchanged —
  that check is about not decoding an absurd file, unrelated to the 32KB
  post-resize output cap.

### 2. New `src/lib/components/AvatarModal.svelte`

Props: `{ avatarUrl, avatarBusting, onchange, onclose }` — `onchange(newUrl)`
reports a successful upload/remove back to the parent (mirrors
`DeckFormModal`'s `onclose`-callback prop pattern), `onclose()` closes without
necessarily having changed anything.

State: `uploading`, `removing`, `status` (`{ text, type } | null`), a local
`previewUrl` initialized from `avatarUrl` prop and updated on successful
upload/remove so the modal's own preview reflects changes immediately.

Structure (per the reference screenshot):
- Header row: small current-avatar thumbnail, "Change your avatar" title, X
  close button (disabled while uploading/removing).
- Larger avatar preview (`previewUrl` or the same default-avatar fallback
  Settings.svelte uses today).
- Hidden `<input type=file accept="image/jpeg,image/png,image/gif">` +
  visible "Add new avatar" button that clicks it; `onchange` handler calls
  `uploadAvatar(file)`, updates `previewUrl`/status, disabled while
  uploading/removing.
- "Cancel" button → `onclose()`, disabled while uploading/removing.
- Restrictions caption (static text): "125×125 image size (larger images
  will be resized), 32kb filesize (after resizing); image types: jpg, gif,
  png."
- Red "Remove" button, bottom-left, only rendered when `previewUrl` is
  truthy — calls `removeAvatar()` directly (no `confirm()`), disabled while
  uploading/removing.

### 3. `src/lib/components/Settings.svelte`

- Remove the inline upload/remove state and handlers that currently live
  here (`avatarUploading`, `avatarRemoving`, `avatarStatus`, `avatarInputEl`,
  `onAvatarPicked`, `onRemoveAvatar`, the camera/✕ badge markup) — that logic
  moves into `AvatarModal.svelte`.
- Keep `avatarUrl`, `avatarBusting`, `loadAvatar()`, `avatarSrc` — Settings
  still owns "what's the current avatar" for its own small preview and
  passes it into the modal when opened.
- `pickAvatar()` (signed-in branch) now sets a `avatarModalOpen = $state(false)`
  flag true instead of clicking the hidden file input.
- `{#if avatarModalOpen}<AvatarModal ... onchange={...} onclose={() =>
  avatarModalOpen = false} />{/if}` — `onchange` updates `avatarUrl`/
  `avatarBusting` from the modal's reported new URL (same split-off-the-`?v=`
  logic the current `onAvatarPicked` does), or clears both on removal.

## Testing

- `tests/avatarUpload.test.js`: add cases for the quality-reduction loop
  (mock `canvas.toBlob` to return decreasing sizes across successive calls,
  assert it stops at the first blob ≤32KB and re-encodes at the right
  quality steps) and for the jpg/png/gif-only `validateImageFile` allow-list
  (reject e.g. `image/webp`).
- `tests/settingsScreen.test.js`: update existing avatar coverage for the
  modal-first flow — tapping the avatar opens `AvatarModal`, add/remove/cancel
  happen inside it, disabled states while busy, `onchange` propagates the new
  URL back to Settings' own preview.
