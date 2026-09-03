import { getStore } from '@netlify/blobs'

/**
 * Fixed-window rate limit backed by Netlify Blobs — the endpoints this guards
 * (rep-join, rep-login, manager-signup, invite) are all reachable with no
 * Supabase session, so without this an attacker can script unlimited account
 * creation / invite-code brute-force / AssemblyAI-adjacent cost abuse.
 * Best-effort: if the blob store is unavailable (e.g. local `next dev`
 * without `netlify dev`), fails open rather than blocking real users.
 */
export async function checkRateLimit(
  bucket: string,
  key: string,
  limit: number,
  windowSec: number
): Promise<boolean> {
  try {
    const store = getStore('rate-limits')
    const blobKey = `${bucket}:${key}`
    const now = Date.now()
    const existing = await store.get(blobKey, { type: 'json' }) as { count: number; resetAt: number } | null

    if (!existing || existing.resetAt <= now) {
      await store.setJSON(blobKey, { count: 1, resetAt: now + windowSec * 1000 })
      return true
    }
    if (existing.count >= limit) return false

    await store.setJSON(blobKey, { count: existing.count + 1, resetAt: existing.resetAt })
    return true
  } catch {
    return true
  }
}

/** Best-effort caller IP from headers Netlify/Next set on the incoming request. */
export function clientIp(request: Request): string {
  const h = request.headers
  return h.get('x-nf-client-connection-ip') || h.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
}
