<script>
  // "Change your avatar" popup — opened by tapping the avatar in Settings.
  // Owns all upload/remove UI and state; reports changes back to the parent
  // via onchange (new URL string, or null after a removal) rather than
  // reaching into Settings' own state directly. Reuses the app's global
  // .modal/.modal-card chrome (see DeckFormModal.svelte for the same pattern).
  import { uploadAvatar, removeAvatar, selectPresetAvatar, AVATAR_PRESETS } from '$lib/avatarUpload.js';

  let { initialSrc, hasAvatar: initialHasAvatar, defaultAvatar, onchange, onclose } = $props();

  // Deliberate snapshot, not a sync bug: this modal is remounted fresh on
  // every open (guarded by {#if avatarModalOpen} in Settings.svelte), so
  // the props can't go stale under this component.
  // svelte-ignore state_referenced_locally
  let previewSrc = $state(initialSrc);
  // svelte-ignore state_referenced_locally
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
