import { getStore } from '@netlify/blobs'

const MAX_CAS_ATTEMPTS = 5

interface Counter { count: number; resetAt: number }

/**
 * Fixed-window rate limit backed by Netlify Blobs — the endpoints this guards
 * (rep-join, rep-login, manager-signup, invite) are all reachable with no
 * Supabase session, so without this an attacker can script unlimited account
 * creation / invite-code brute-force / AssemblyAI-adjacent cost abuse.
 *
 * Concurrency: uses Blobs' `onlyIfMatch`/`onlyIfNew` compare-and-swap so two
 * requests racing the same key can't both read count=N and both write N+1
 * (a plain get-then-set would let a burst of concurrent requests blow past
 * `limit`). A CAS loss just means another request updated the counter first
 * — retry with a fresh read.
 *
 * Fail behavior: a store error is only benign on a real Netlify deploy's own
 * missing/misconfigured store, which should never happen — so on Netlify
 * (`process.env.NETLIFY` set) an error fails CLOSED (blocks the request)
 * rather than silently disabling the limiter. It fails open only outside
 * Netlify (e.g. local `next dev` without `netlify dev`, where the store
 * isn't available at all and blocking real local testing would be worse
 * than no rate limiting in a context attackers can't reach).
 */
export async function checkRateLimit(
  bucket: string,
  key: string,
  limit: number,
  windowSec: number
): Promise<boolean> {
  const onNetlify = !!process.env.NETLIFY
  const blobKey = `${bucket}:${key}`
  const now = Date.now()

  let store: ReturnType<typeof getStore>
  try {
    store = getStore('rate-limits')
  } catch {
    return !onNetlify
  }

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    let existing: ({ data: Counter; etag?: string }) | null
    try {
      existing = await store.getWithMetadata(blobKey, { type: 'json' })
    } catch {
      return !onNetlify
    }

    try {
      if (!existing || existing.data.resetAt <= now) {
        const result = await store.setJSON(
          blobKey,
          { count: 1, resetAt: now + windowSec * 1000 } satisfies Counter,
          existing ? { onlyIfMatch: existing.etag } : { onlyIfNew: true }
        )
        if (result.modified) return true
        continue // someone else reset this window first — retry with a fresh read
      }

      if (existing.data.count >= limit) return false

      const result = await store.setJSON(
        blobKey,
        { count: existing.data.count + 1, resetAt: existing.data.resetAt } satisfies Counter,
        { onlyIfMatch: existing.etag }
      )
      if (result.modified) return true
      continue // lost the race to another concurrent request — retry with a fresh read
    } catch {
      return !onNetlify
    }
  }

  // Exhausted retries under heavy contention on this key — treat as limited
  // rather than let sustained contention become a bypass.
  return false
}

/**
 * Caller IP, trusting only Netlify's own edge-set header — never a
 * client-suppliable one. `x-forwarded-for` is not used as a fallback: a
 * request can set that header itself, and without a verified trusted-proxy
 * chain there's no way to tell which hop (if any) is honest, which would
 * let an attacker mint a fresh rate-limit bucket per request. Outside
 * Netlify (local dev) this returns a constant — rate limiting is a no-op
 * there anyway (see checkRateLimit's fail-open behavior).
 */
export function clientIp(request: Request): string {
  return request.headers.get('x-nf-client-connection-ip') || 'unknown'
}
