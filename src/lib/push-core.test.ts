import { describe, expect, it } from 'vitest'
import { isAllowedPushEndpoint, isDue, localClock, parseSubscribeBody, renderPush } from './push-core'

const fcm = 'https://fcm.googleapis.com/fcm/send/abc'
const body = { endpoint: fcm, keys: { p256dh: 'p', auth: 'a' }, tz: 'Asia/Baghdad', lang: 'ar' }

describe('push timing', () => {
  it('reads the local date and hour in the rep time zone', () => {
    // 05:30 UTC is 08:30 in Baghdad (UTC+3) and 01:30 in New York (EDT).
    const t = Date.parse('2026-10-10T05:30:00Z')
    expect(localClock('Asia/Baghdad', t)).toEqual({ date: '2026-10-10', hour: 8 })
    expect(localClock('America/New_York', t)).toEqual({ date: '2026-10-10', hour: 1 })
    expect(localClock('Not/AZone', t)).toEqual({ date: '2026-10-10', hour: 5 })
  })
  it('is due from 9am to 6pm local, once per local day', () => {
    const sub = { tz: 'Asia/Baghdad', last_sent_on: null }
    expect(isDue(sub, Date.parse('2026-10-10T05:59:00Z'))).toBe(false) // 08:59
    expect(isDue(sub, Date.parse('2026-10-10T06:00:00Z'))).toBe(true)  // 09:00
    expect(isDue(sub, Date.parse('2026-10-10T15:00:00Z'))).toBe(true)  // 18:00
    expect(isDue(sub, Date.parse('2026-10-10T16:00:00Z'))).toBe(false) // 19:00
    expect(isDue({ ...sub, last_sent_on: '2026-10-10' }, Date.parse('2026-10-10T08:00:00Z'))).toBe(false)
    expect(isDue({ ...sub, last_sent_on: '2026-10-09' }, Date.parse('2026-10-10T08:00:00Z'))).toBe(true)
  })
})

describe('subscription validation', () => {
  it('only accepts real browser push services over https', () => {
    expect(isAllowedPushEndpoint(fcm)).toBe(true)
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true)
    expect(isAllowedPushEndpoint('https://web.push.apple.com/x')).toBe(true)
    expect(isAllowedPushEndpoint('https://abc.notify.windows.com/w')).toBe(true)
    for (const bad of ['http://fcm.googleapis.com/x', 'https://evil.example.com/x', 'https://fcm.googleapis.com.evil.com/x', 'https://169.254.169.254/latest', 'https://fcm.googleapis.com:8443/x', 'not a url', 5, null]) {
      expect(isAllowedPushEndpoint(bad)).toBe(false)
    }
  })
  it('parses a good body and rejects missing keys, bad zones and unknown languages', () => {
    expect(parseSubscribeBody(body)).toEqual({ endpoint: fcm, p256dh: 'p', auth: 'a', tz: 'Asia/Baghdad', lang: 'ar' })
    expect(parseSubscribeBody({ ...body, tz: undefined })?.tz).toBe('UTC')
    for (const bad of [null, {}, { ...body, keys: {} }, { ...body, tz: 'Mars/Base' }, { ...body, lang: 'fr' }, { ...body, endpoint: 'https://evil.example.com/x' }]) {
      expect(parseSubscribeBody(bad)).toBeNull()
    }
  })
})

describe('renderPush', () => {
  it('is generic on the lock screen: no doctor names or plan text', () => {
    const msg = renderPush({ kind: 'planned_visit', key: 'k', doctorId: 'd', doctorName: 'Dr. Secret', text: 'Confidential goal' }, 'en')
    expect(JSON.stringify(msg)).not.toMatch(/Secret|Confidential/)
    expect(msg.url).toBe('/play')
  })
  it('has Arabic copy for every nudge kind', () => {
    const nudges = [
      { kind: 'planned_visit', key: 'k', doctorId: 'd', doctorName: 'n', text: 't' },
      { kind: 'open_promise', key: 'k', doctorId: 'd', doctorName: 'n', text: 't', days: 3 },
      { kind: 'open_action', key: 'k', doctorId: 'd', doctorName: 'n', text: 't' },
      { kind: 'quiet', key: 'k', days: 4 },
    ] as const
    for (const nudge of nudges) expect(renderPush(nudge, 'ar').title).toMatch(/[؀-ۿ]/)
  })
})
