import { beforeEach, describe, expect, it, vi } from 'vitest'

const checkRateLimit = vi.fn(async () => true)
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit }))

const { checkVoiceRateLimit, VOICE_RATE_LIMITS } = await import('./voice-rate-limits')
const { TURN_CAP } = await import('./voice-partner-core')

describe('AI Doctor rate limits', () => {
  beforeEach(() => checkRateLimit.mockClear())

  it('uses a separate hourly bucket per kind of call', async () => {
    await checkVoiceRateLimit('start', 'rep-1')
    await checkVoiceRateLimit('reply', 'rep-1')
    await checkVoiceRateLimit('result', 'rep-1')
    expect(checkRateLimit.mock.calls).toEqual([
      ['vp-start', 'rep-1', 30, 3600], ['vp-reply', 'rep-1', 200, 3600], ['vp-result', 'rep-1', 60, 3600],
    ])
  })

  it('lets a rep finish several full sessions in one hour', () => {
    // One turn-based session: TURN_CAP judged replies plus a spoken line for each and the opener.
    const repliesPerSession = TURN_CAP + (TURN_CAP + 1)
    const resultsPerSession = 2 // session-result + session-analysis
    const sessions = 5
    expect(VOICE_RATE_LIMITS.start.limit).toBeGreaterThanOrEqual(sessions)
    expect(VOICE_RATE_LIMITS.reply.limit).toBeGreaterThanOrEqual(sessions * repliesPerSession)
    expect(VOICE_RATE_LIMITS.result.limit).toBeGreaterThanOrEqual(sessions * resultsPerSession)
  })
})
