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
