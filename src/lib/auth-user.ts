/**
 * Who is signed in, for server code (API routes, server pages, route helpers).
 *
 * Uses auth.getClaims(): it verifies the session token's signature locally against the
 * project's cached signing keys (ES256) and refreshes the session first when the token is
 * about to expire. auth.getUser() instead asked the Supabase Auth server on every call,
 * one ~290 ms round trip from Netlify (us-east-2) to Supabase (ap-south-1), measured
 * with a temporary timing probe on 2026-11-22 (since removed). getClaims takes ~2 ms.
 *
 * Trade-off: a session revoked on the Auth server (sign-out elsewhere, user deleted) stays
 * usable here until its access token expires (default 1 hour). The proxy already worked
 * this way since PR #119. Database rules (RLS) still apply to every query.
 *
 * Role and company are never read from the token: every manager or company check re-reads
 * `profiles` from the database, so removing someone from a team or changing their role takes
 * effect at once. What the hour does allow is a signed-out, deleted or stolen session to keep
 * working. Actions that hand out credentials, grant status or delete data use getLiveAuthUser.
 *
 * Only `id` and `email` are returned: that is all server code reads from the user.
 */
export interface AuthUser {
  id: string
  email?: string
}

interface AuthClient {
  auth: {
    getClaims?: () => Promise<{ data: { claims?: Record<string, unknown> | null } | null }>
    getUser: () => Promise<{ data: { user: { id: string; email?: string | null } | null } }>
  }
}

export async function getAuthUser(client: AuthClient): Promise<AuthUser | null> {
  // Real Supabase clients always have getClaims. The getUser path is for test stand-ins
  // that only mock getUser.
  if (typeof client.auth.getClaims !== 'function') {
    const { data } = await client.auth.getUser()
    const u = data?.user
    return u?.id ? { id: u.id, ...(u.email ? { email: u.email } : {}) } : null
  }

  const { data } = await client.auth.getClaims()
  const claims = data?.claims
  const sub = claims?.sub
  if (typeof sub !== 'string' || !sub) return null
  const email = typeof claims?.email === 'string' && claims.email ? claims.email : undefined
  return { id: sub, ...(email ? { email } : {}) }
}

/**
 * Like getAuthUser, but asks the Auth server (auth.getUser), so a session that was signed out,
 * whose user was deleted, or that was otherwise revoked is refused at once instead of working
 * until the token expires. Costs one Auth round trip (~290 ms): use it only on high-risk actions
 * (resetting a rep's PIN, issuing or revoking certificates, rotating an invite code, deleting data).
 */
export async function getLiveAuthUser(client: AuthClient): Promise<AuthUser | null> {
  const { data } = await client.auth.getUser()
  const u = data?.user
  return u?.id ? { id: u.id, ...(u.email ? { email: u.email } : {}) } : null
}
