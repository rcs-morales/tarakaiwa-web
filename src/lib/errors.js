/**
 * The message of an Error or error-like object (Supabase errors aren't Error
 * instances) — for logs and status lines. Without a message: `fallback` if
 * given, else the value as a string.
 * @param {unknown} e
 * @param {string} [fallback]
 */
export function errorMessage(e, fallback) {
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' && e.message) {
    return e.message;
  }
  return fallback ?? String(e);
}
