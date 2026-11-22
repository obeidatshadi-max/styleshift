import { NextResponse } from 'next/server'
import { getStore } from '@netlify/blobs'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { createServerTimer, withServerTiming } from '@/lib/server-timing'

/**
 * Latency probe: times each outside service an API call depends on, once each, in order,
 * and reports them in the Server-Timing header (durations only, no data).
 *
 *   claims  - check the sign-in token locally (cached signing keys)
 *   auth    - ask the Supabase Auth server who the user is (what most routes do today)
 *   auth-2  - the same again, to show the warm cost after the first connection
 *   db      - one tiny database read
 *   db-2    - the same again (warm)
 *   blobs   - one Netlify Blobs read (the store the rate limiter uses)
 *
 * Signed-in users only. Read-only. Remove once the latency work is done.
 */
export async function GET() {
  const timer = createServerTimer()
  const supabase = await createClient()

  const { data: claims } = await timer.time('claims', () => supabase.auth.getClaims())
  if (!claims?.claims?.sub) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await timer.time('auth', () => supabase.auth.getUser())
  await timer.time('auth', () => supabase.auth.getUser())

  const admin = createAdminClient()
  const read = () => admin.from('profiles').select('id').eq('id', claims.claims.sub).maybeSingle()
  await timer.time('db', read)
  await timer.time('db', read)

  await timer.time('blobs', async () => {
    try {
      await getStore('rate-limits').get('timing-probe:none')
    } catch {
      // Outside Netlify there is no store; the timing still shows the failed attempt.
    }
  })

  const timing = timer.header()
  return withServerTiming(NextResponse.json({ ok: true, region: process.env.AWS_REGION ?? null, timing }), timer)
}
