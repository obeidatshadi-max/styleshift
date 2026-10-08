import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }))
import webpush from 'web-push'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST as subscribe, DELETE as unsubscribe } from './subscribe/route'
import { POST as send } from './send/route'

const fcm = 'https://fcm.googleapis.com/fcm/send/abc'
const goodBody = { endpoint: fcm, keys: { p256dh: 'p', auth: 'a' }, tz: 'Asia/Baghdad', lang: 'en' }
const post = (body: unknown) => new Request('http://x/api/push/subscribe', { method: 'POST', body: JSON.stringify(body) })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any

beforeEach(() => {
  vi.clearAllMocks()
  db = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })) },
    from: vi.fn(() => ({ upsert: vi.fn(async () => ({ error: null })), delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) })),
  }
  vi.mocked(createClient).mockResolvedValue(db)
  vi.mocked(checkRateLimit).mockResolvedValue(true)
})

describe('subscribe route', () => {
  it('requires a signed-in rep and rate limits', async () => {
    db.auth.getUser.mockResolvedValue({ data: { user: null } })
    expect((await subscribe(post(goodBody))).status).toBe(401)
    db.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    vi.mocked(checkRateLimit).mockResolvedValue(false)
    expect((await subscribe(post(goodBody))).status).toBe(429)
  })
  it('rejects an endpoint that is not a push service, and stores a good one for the caller', async () => {
    expect((await subscribe(post({ ...goodBody, endpoint: 'https://169.254.169.254/x' }))).status).toBe(400)
    const upsert = vi.fn(async () => ({ error: null }))
    db.from.mockReturnValue({ upsert })
    expect((await subscribe(post(goodBody))).status).toBe(200)
    expect(upsert).toHaveBeenCalledWith({ rep_id: 'u1', endpoint: fcm, p256dh: 'p', auth: 'a', tz: 'Asia/Baghdad', lang: 'en' }, { onConflict: 'endpoint' })
  })
  it('only deletes a valid endpoint, scoped to the caller', async () => {
    expect((await unsubscribe(new Request('http://x/api/push/subscribe?endpoint=https%3A%2F%2Fevil.example.com'))).status).toBe(400)
    expect((await unsubscribe(new Request(`http://x/api/push/subscribe?endpoint=${encodeURIComponent(fcm)}`, { method: 'DELETE' }))).status).toBe(200)
  })
})

describe('send route', () => {
  const sendReq = (token?: string) => new Request('http://x/api/push/send', { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {} })
  // A thenable query builder: every chained call returns itself and awaiting it yields the rows.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = (rows: unknown[]): any => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = { select: () => q, eq: () => q, not: () => q, is: () => q, order: () => q, limit: () => q, update: vi.fn(() => q), delete: vi.fn(() => q), then: (res: (v: unknown) => void) => res({ data: rows, error: null }) }
    return q
  }
  const row = (over: Record<string, unknown>) => ({ id: 's1', rep_id: 'r1', endpoint: fcm, p256dh: 'p', auth: 'a', tz: 'Asia/Baghdad', lang: 'en', last_sent_on: null, last_nudge_key: null, ...over })
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'secret'); vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'pub'); vi.stubEnv('VAPID_PRIVATE_KEY', 'priv')
  })

  it('stays off until configured and refuses a wrong secret', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await send(sendReq('secret'))).status).toBe(503)
    vi.stubEnv('CRON_SECRET', 'secret')
    expect((await send(sendReq())).status).toBe(401)
    expect((await send(sendReq('wrong!'))).status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
  })
  it('sends one generic reminder to a due rep with a plan, records it, and removes dead subscriptions', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-10T08:00:00Z')) // 11:00 in Baghdad
    const subs = [
      row({ id: 's1' }),
      row({ id: 's2', endpoint: 'https://fcm.googleapis.com/fcm/send/gone' }),
      row({ id: 's3', rep_id: 'r2', endpoint: fcm + '3', last_sent_on: '2026-10-10' }),
    ]
    const tables = { push_subscriptions: table(subs), doctors: table([{ id: 'd1', name: 'Dr. X', plan_objective: 'Agree a trial' }]), coach_debriefs: table([]), doctor_visits: table([]) }
    vi.mocked(createAdminClient).mockReturnValue({ from: (name: keyof typeof tables) => tables[name] } as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(webpush.sendNotification).mockImplementation((async (s: any) => {
      if (s.endpoint.endsWith('gone')) throw Object.assign(new Error('gone'), { statusCode: 410 })
      return {}
    }) as never)
    const res = await send(sendReq('secret'))
    expect(await res.json()).toMatchObject({ checked: 3, due: 2, sent: 1, removed: 1 })
    const payload = JSON.parse(vi.mocked(webpush.sendNotification).mock.calls[0][1] as string)
    expect(JSON.stringify(payload)).not.toMatch(/Dr\. X|Agree a trial/)
    expect(tables.push_subscriptions.update).toHaveBeenCalledWith({ last_sent_on: '2026-10-10', last_nudge_key: 'plan:d1:Agree a trial' })
    vi.useRealTimers()
  })
  it('does not repeat the same nudge to the same device', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T08:00:00Z'))
    const subs = [row({ last_sent_on: '2026-10-10', last_nudge_key: 'plan:d1:Agree a trial' })]
    const tables = { push_subscriptions: table(subs), doctors: table([{ id: 'd1', name: 'Dr. X', plan_objective: 'Agree a trial' }]), coach_debriefs: table([]), doctor_visits: table([]) }
    vi.mocked(createAdminClient).mockReturnValue({ from: (name: keyof typeof tables) => tables[name] } as never)
    expect(await (await send(sendReq('secret'))).json()).toMatchObject({ due: 1, sent: 0 })
    expect(webpush.sendNotification).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
