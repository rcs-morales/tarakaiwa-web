// Verify the caller's Supabase session by asking Supabase's auth API to resolve
// the bearer token. This works regardless of the project's JWT signing scheme
// (shared-secret HS256 or the newer asymmetric signing keys), at the cost of one
// extra request per call — fine for a personal free-tier app.
//
// Runs on the Cloudflare Workers runtime (Web APIs only — fetch, Request, etc.).

/**
 * @returns {Promise<{ user: { id: string, email?: string } } | { error: string, status: number }>}
 */
export async function authenticateRequest(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: 'Server auth is not configured.', status: 500 };
  }

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: 'Missing bearer token.', status: 401 };

  let res;
  try {
    res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
  } catch (e) {
    return { error: 'Auth check failed.', status: 502 };
  }

  if (!res.ok) return { error: 'Invalid or expired session.', status: 401 };

  const user = await res.json();
  if (!user?.id) return { error: 'Invalid session.', status: 401 };
  return { user: { id: user.id, email: user.email } };
}
