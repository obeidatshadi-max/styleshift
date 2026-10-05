import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase-admin'
import { buildNudge, type NudgeDebrief, type NudgeDoctor } from '@/lib/coach-nudges'
import { isDue, localClock, renderPush } from '@/lib/push-core'

// Called hourly by netlify/functions/push-cron.mjs. Sends each opted-in rep at most one debrief
// reminder a day, and never the same nudge twice.
const MAX_SUBSCRIPTIONS = 500

const sameSecret = (given: string, expected: string) => {
  const a = Buffer.from(given), b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

interface SubRow { id: string; rep_id: string; endpoint: string; p256dh: string; auth: string; tz: string; lang: 'en' | 'ar'; last_sent_on: string | null; last_nudge_key: string | null }

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!secret || !publicKey || !privateKey) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '')
  if (!sameSecret(given, secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com', publicKey, privateKey)
  const db = createAdminClient()
  const now = Date.now()
  const { data: subs, error } = await db.from('push_subscriptions')
    .select('id,rep_id,endpoint,p256dh,auth,tz,lang,last_sent_on,last_nudge_key').limit(MAX_SUBSCRIPTIONS)
  if (error || !subs) return NextResponse.json({ error: 'subscriptions_unavailable' }, { status: 500 })

  const result = { checked: subs.length, due: 0, sent: 0, removed: 0, failed: 0 }
  const nudges = new Map<string, ReturnType<typeof buildNudge>>()
  for (const sub of (subs as SubRow[]).filter(s => isDue(s, now))) {
    result.due++
    if (!nudges.has(sub.rep_id)) {
      const [{ data: doctors }, { data: debriefs }] = await Promise.all([
        db.from('doctors').select('id,name,plan_objective').eq('rep_id', sub.rep_id),
        db.from('coach_debriefs').select('doctor_id:input->>doctorId,created_at,nextAction:result->report->>nextAction').eq('rep_id', sub.rep_id).order('created_at', { ascending: false }).limit(30),
      ])
      nudges.set(sub.rep_id, buildNudge((doctors ?? []) as NudgeDoctor[], (debriefs ?? []) as NudgeDebrief[], now))
    }
    const nudge = nudges.get(sub.rep_id)
    if (!nudge || nudge.key === sub.last_nudge_key) continue
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(renderPush(nudge, sub.lang)), { TTL: 6 * 3600 })
      await db.from('push_subscriptions').update({ last_sent_on: localClock(sub.tz, now).date, last_nudge_key: nudge.key }).eq('id', sub.id)
      result.sent++
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) { await db.from('push_subscriptions').delete().eq('id', sub.id); result.removed++ }
      else result.failed++
    }
  }
  return NextResponse.json(result)
}
