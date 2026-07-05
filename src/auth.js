// ─────────────────────────────────────────────
// AUTH MODULE — Supabase email magic-link + optional Google OAuth
// ─────────────────────────────────────────────
//
// Thin wrapper around supabase-js auth. Holds the current user in a module
// singleton and notifies subscribers on change. Logged-out behaviour is
// byte-for-byte the same as before this module existed — nothing here runs
// until app.js calls initAuth().

import { supabaseClient } from './supabase.js';

let currentSession = null;
const listeners = new Set();

/** @returns {import('@supabase/supabase-js').User | null} */
export function getCurrentUser() {
  return currentSession?.user ?? null;
}

export function isLoggedIn() {
  return !!currentSession;
}

/**
 * The current Supabase access token (JWT), or null when logged out.
 * Synchronous — reads the session cached from the last getSession()/auth
 * event, which supabase-js keeps fresh via its own refresh-token timer.
 */
export function getAccessToken() {
  return currentSession?.access_token ?? null;
}

/**
 * Subscribe to auth changes. The callback fires immediately is NOT implied —
 * call getCurrentUser() for the current value. Returns an unsubscribe fn.
 */
export function onAuthChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit() {
  for (const cb of listeners) {
    try { cb(getCurrentUser()); } catch (e) { console.error('auth listener error:', e); }
  }
}

/**
 * Restore any persisted session and wire up the change listener.
 * Call once on boot. Returns the current user (or null).
 */
export async function initAuth() {
  try {
    const { data } = await supabaseClient.auth.getSession();
    currentSession = data?.session ?? null;
  } catch (e) {
    console.error('initAuth getSession failed:', e);
    currentSession = null;
  }

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentSession = session ?? null;
    emit();
  });

  emit();
  return getCurrentUser();
}

/**
 * Send a passwordless magic-link / OTP email. The link returns the user to the
 * current origin, where supabase-js (detectSessionInUrl) completes sign-in.
 */
export async function signInWithEmail(email) {
  return supabaseClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
}

/** Optional Google OAuth (only works once creds are configured in Supabase). */
export async function signInWithGoogle() {
  return supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
}

export async function signOut() {
  return supabaseClient.auth.signOut();
}
