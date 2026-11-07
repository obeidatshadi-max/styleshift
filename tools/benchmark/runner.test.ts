import { describe, expect, it } from 'vitest'
import { FIXTURES } from './fixtures'
import { fakeBackend, runAnalystJob, runCoachJob, coachSession } from './runner'
import { percentile, pairedBootstrap, requestCost, rng, wilson, type ModelPricing } from './metrics'

describe('dry-run pipeline', () => {
  it('analyst: the answer-key backend finds every expected behavior and no trap', async () => {
    for (const f of FIXTURES) {
      const r = await runAnalystJob(fakeBackend(), 'dry', f)
      expect(r.finalStatus, f.id).toBe('ok')
      expect(r.firstAttemptValid, f.id).toBe(true)
      expect(r.retryRequired, f.id).toBe(false)
      expect(r.mustFoundStrict, f.id).toBe(r.mustTotal)
      expect(r.trapHits, f.id).toBe(0)
      expect(r.dropped, f.id).toBe(0)
    }
  })

  it('coach: every fixture with candidates is coached from identical frozen input', async () => {
    let coached = 0
    for (const f of FIXTURES) {
      const a = coachSession(f), b = coachSession(f)
      expect(JSON.stringify(a.scores)).toBe(JSON.stringify(b.scores)) // deterministic scoring
      const r = await runCoachJob(fakeBackend(), 'dry', f)
      if (!r) continue
      coached++
      expect(r.finalStatus, f.id).toBe('ok')
      expect(r.kept).toBe(r.candidates)
    }
    expect(coached).toBeGreaterThan(40)
  })

  it('records a rejected model as an upstream failure, not as a quality result', async () => {
    const failing = { make: (model: string, onUsage: (u: never) => void) => async () => {
      (onUsage as unknown as (u: unknown) => void)({ model, ok: false, inputTokens: null, outputTokens: null, latencyMs: 3, stopReason: null, status: 404 })
      return null
    } }
    const r = await runAnalystJob(failing as never, 'claude-nope', FIXTURES[0])
    expect(r.finalStatus).toBe('upstream')
    expect(r.attempts).toBe(2)
    expect(r.calls.every(c => c.status === 404)).toBe(true)
  })
})

describe('metrics', () => {
  it('percentile and wilson behave', () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3)
    expect(percentile([1, 2, 3, 4, 5], 0.95)).toBeCloseTo(4.8)
    const w = wilson(9, 10)!
    expect(w.lo).toBeLessThan(0.9); expect(w.hi).toBeGreaterThan(0.9)
  })
  it('paired bootstrap is reproducible and centred', () => {
    const d = [0, 0, 1, 1, 0, -1, 1, 0]
    expect(pairedBootstrap(d, 500, 7)).toEqual(pairedBootstrap(d, 500, 7))
    expect(pairedBootstrap(d)!.mean).toBeCloseTo(0.25)
    expect(rng(1)()).toBe(rng(1)())
  })
  it('cost refuses to guess when a price is missing and picks the tier by request size', () => {
    const p: ModelPricing = { inputPerMTok: { le100k: 1, gt100k: 2 }, outputPerMTok: { le100k: 5, gt100k: 10 }, verifiedAt: 'x', source: 'x' }
    expect(requestCost(p, 1000, 1000)).toBeCloseTo(0.006)
    expect(requestCost(p, 200_000, 1000)).toBeCloseTo(0.41)
    expect(requestCost({ ...p, inputPerMTok: { le100k: null, gt100k: null } }, 1000, 1000)).toBeNull()
    expect(requestCost(undefined, 1000, 1000)).toBeNull()
  })
})
