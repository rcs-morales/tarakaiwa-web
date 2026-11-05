// Tiny JSON response helper shared by the proxy endpoints.
/** @param {unknown} obj @param {number} [status] */
export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
