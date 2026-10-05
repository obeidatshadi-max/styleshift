import type { Nudge } from '@/lib/coach-nudges'

/** Reminders go out once a day, any time from this local hour until the cutoff (a missed hourly run catches up). */
export const SEND_FROM_HOUR = 9
export const SEND_UNTIL_HOUR = 18

export interface PushSubscriptionRow {
  tz: string
  last_sent_on: string | null
  last_nudge_key?: string | null
}

export const isValidTimeZone = (tz: unknown): tz is string => {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false
  try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); return true } catch { return false }
}

/** Local calendar date (YYYY-MM-DD) and hour in a time zone; an unknown zone falls back to UTC. */
export function localClock(tz: string, nowMs: number): { date: string; hour: number } {
  const zone = isValidTimeZone(tz) ? tz : 'UTC'
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(nowMs)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) }
}

export function isDue(sub: PushSubscriptionRow, nowMs: number): boolean {
  const { date, hour } = localClock(sub.tz, nowMs)
  return hour >= SEND_FROM_HOUR && hour <= SEND_UNTIL_HOUR && sub.last_sent_on !== date
}

// Only the push services browsers use. The server posts to whatever endpoint a rep registers,
// so anything else could aim the server at an internal address.
const PUSH_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com']
const PUSH_HOST_SUFFIXES = ['.push.services.mozilla.com', '.push.apple.com', '.notify.windows.com']

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false
  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'https:' || url.port) return false
    return PUSH_HOSTS.includes(url.hostname) || PUSH_HOST_SUFFIXES.some(s => url.hostname.endsWith(s))
  } catch { return false }
}

export interface PushSubscriptionInput { endpoint: string; p256dh: string; auth: string; tz: string; lang: 'en' | 'ar' }

export function parseSubscribeBody(body: unknown): PushSubscriptionInput | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const keys = b.keys as Record<string, unknown> | undefined
  const tz = b.tz === undefined ? 'UTC' : b.tz
  if (!isAllowedPushEndpoint(b.endpoint) || !keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string' ||
    !keys.p256dh || !keys.auth || keys.p256dh.length > 200 || keys.auth.length > 100 ||
    !isValidTimeZone(tz) || (b.lang !== 'en' && b.lang !== 'ar')) return null
  return { endpoint: b.endpoint, p256dh: keys.p256dh, auth: keys.auth, tz, lang: b.lang }
}

export interface PushMessage { title: string; body: string; url: string }

// Deliberately generic: a lock screen can be read by anyone, so no doctor names or plan text.
const COPY = {
  en: {
    planned_visit: { title: 'How did your visit go?', body: 'You set a goal for a visit. A one-minute debrief keeps the learning.' },
    open_action: { title: 'Your next step is waiting', body: 'Your coach set a next step after your last debrief. Did you try it?' },
    quiet: { title: 'Keep the habit going', body: 'One minute is enough: what happened on your last visit?' },
  },
  ar: {
    planned_visit: { title: 'كيف كانت زيارتك؟', body: 'حدّدت هدفاً لزيارة. مراجعة من دقيقة واحدة تحفظ ما تعلمته.' },
    open_action: { title: 'خطوتك التالية بانتظارك', body: 'حدّد مدربك خطوة تالية بعد آخر مراجعة. هل جرّبتها؟' },
    quiet: { title: 'حافظ على العادة', body: 'دقيقة واحدة تكفي: ماذا حدث في آخر زيارة؟' },
  },
} as const

export function renderPush(nudge: Nudge, lang: 'en' | 'ar'): PushMessage {
  return { ...COPY[lang][nudge.kind], url: '/play' }
}
