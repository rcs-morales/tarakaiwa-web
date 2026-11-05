// Settings → Account & Sync: the status line and the magic link, Google and
// sign-out flows. Who is signed in comes from profile.svelte.js (profile.user).

import { signInWithEmail, signInWithGoogle, signOut } from './auth.js';
import { onLogout } from './sync.js';

/** @typedef {'' | 'info' | 'success' | 'error'} StatusType */

export const account = $state({
  /** @type {{ message: string, type: StatusType }} */
  status: { message: '', type: '' },
});

/** @param {string} message @param {StatusType} [type] */
function setStatus(message, type = 'info') {
  account.status = { message, type };
}

/** @param {string} email */
export async function sendMagicLink(email) {
  email = (email || '').trim();
  if (!email) {
    setStatus('Please enter your email address.', 'error');
    return;
  }
  setStatus('Sending magic link…', 'info');
  const { error } = await signInWithEmail(email);
  if (error) setStatus('❌ ' + error.message, 'error');
  else setStatus('✅ Check your inbox for the sign-in link.', 'success');
}

export async function continueWithGoogle() {
  const { error } = await signInWithGoogle();
  if (error) setStatus('❌ ' + error.message, 'error');
}

export async function signOutAccount() {
  await signOut();
  onLogout();
  setStatus('Signed out.', 'info');
}
