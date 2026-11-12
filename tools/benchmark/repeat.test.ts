import { describe, expect, it } from 'vitest'
import { FIXTURES } from './fixtures'
import { fakeBackend } from './runner'
import { fixtureTurns, renderRepeatReport, runRepeatAnalyst, runRepeatEvaluator, sd, summarizeArm, type RepeatRecord } from './repeat'
import { parseVariant, variantExtraBody } from './metrics'

const rec = (fixtureId: string, repeat: number, scores: Record<string, number | null>, extra: Partial<RepeatRecord> = {}): RepeatRecord => ({
  arm: 'analyst', model: 'm', fixtureId, mix: 'en', repeat, status: 'ok', scores, topPoint: 'a', behaviors: ['a'], ...extra,
})

describe('repeat-run statistics', () => {
  it('sample standard deviation', () => {
    expect(sd([50])).toBeNull()
    expect(sd([50, 50, 50])).toBe(0)
    expect(sd([40, 60])).toBeCloseTo(14.142, 2)
  })

  it('calls identical repeats stable and wide ones unstable', () => {
    const steady = Array.from({ length: 6 }, (_, f) => [0, 1, 2].map(r => rec(`f${f}`, r, { q: 60 }))).flat()
    expect(summarizeArm(steady, 'analyst', 'm').verdict).toBe('stable')
    const noisy = Array.from({ length: 6 }, (_, f) => [0, 1, 2].map(r => rec(`f${f}`, r, { q: [50, 60, 70][r] }))).flat()
    const s = summarizeArm(noisy, 'analyst', 'm')
    expect(s.verdict).toBe('unstable')
    expect(s.dimensions[0]).toMatchObject({ dimension: 'q', fixtures: 6, meanSd: 10, rangeOverFloor: 1 })
  })

  it('needs at least five fixtures before giving a verdict', () => {
    const few = [0, 1].map(r => rec('f0', r, { q: 60 }))
    expect(summarizeArm(few, 'analyst', 'm').verdict).toBe('insufficient')
  })

  it('counts a null-vs-number flip as instability and leaves failed runs out of the spread', () => {
    const rows = [
      rec('f0', 0, { q: null }), rec('f0', 1, { q: 60 }), rec('f0', 2, { q: 62 }),
      rec('f0', 3, {}, { status: 'invalid' }),
    ]
    const s = summarizeArm(rows, 'analyst', 'm')
    expect(s.failedRuns).toBe(1)
    expect(s.dimensions[0].nullFlip).toBe(1)
    expect(s.dimensions[0].meanSd).toBeCloseTo(1.41, 1)
  })

  it('reports how often the first coaching point changes and how much the behavior sets overlap', () => {
    const rows = [
      rec('f0', 0, { q: 1 }, { topPoint: 'x', behaviors: ['a', 'b'] }), rec('f0', 1, { q: 1 }, { topPoint: 'y', behaviors: ['a'] }),
      rec('f1', 0, { q: 1 }, { topPoint: 'x', behaviors: ['a'] }), rec('f1', 1, { q: 1 }, { topPoint: 'x', behaviors: ['a'] }),
    ]
    const s = summarizeArm(rows, 'analyst', 'm')
    expect(s.topPointChanged).toBe(0.5)
    expect(s.behaviorJaccard).toBe(0.75)
  })
})

describe('repeat-run pipeline (dry backend)', () => {
  it('builds evaluator turns that keep the fixture order and roles', () => {
    const f = FIXTURES[0]
    const t = fixtureTurns(f)
    expect(t).toHaveLength(f.turns.length)
    expect(t[0]).toMatchObject({ turn_index: 0, role: 'doctor' })
    expect(t[1]).toMatchObject({ turn_index: 1, role: 'rep', text: f.turns[1].slice(2).trim() })
  })

  it('scores the analyst through the real engine and the evaluator through the real parser', async () => {
    const f = FIXTURES[0]
    const a = await runRepeatAnalyst(fakeBackend(), 'dry', f, 0)
    expect(a.status).toBe('ok')
    expect(a.scores).toHaveProperty('overall')
    expect(a.behaviors.length).toBeGreaterThan(0)
    const e = await runRepeatEvaluator(fakeBackend(), 'dry', f, 0)
    expect(e.status).toBe('ok')
    expect(e.scores.opening).toBeNull() // the fake says "not observable" for the first dimension
    expect(e.scores['adapt.pace']).toBeNull() // text transcript: pace is not observable
    expect(e.scores['adapt.detail']).toBe(61)
    expect(Object.keys(e.scores)).toHaveLength(9 + 7 + 1)
  })

  it('a dry run end to end shows zero spread and renders a report', async () => {
    const rows: RepeatRecord[] = []
    for (const f of FIXTURES.slice(0, 6)) for (let r = 0; r < 3; r++) {
      rows.push(await runRepeatAnalyst(fakeBackend(), 'dry', f, r), await runRepeatEvaluator(fakeBackend(), 'dry', f, r))
    }
    const spreads = [summarizeArm(rows, 'analyst', 'dry'), summarizeArm(rows, 'evaluator', 'dry')]
    expect(spreads.map(s => s.verdict)).toEqual(['stable', 'stable'])
    expect(spreads[0].topPointChanged).toBe(0)
    const md = renderRepeatReport(spreads, 'dry')
    expect(md).toContain('Session evaluator (Deep Analysis)')
    expect(md).toContain('| opening |')
  })
})

describe('variant temperature', () => {
  it('parses t=0 into the request body, and leaves the provider default alone otherwise', () => {
    expect(variantExtraBody(parseVariant('claude-haiku-4-5-20251001@t=0'))).toEqual({ temperature: 0 })
    expect(variantExtraBody(parseVariant('claude-haiku-4-5-20251001'))).toBeUndefined()
    expect(variantExtraBody(parseVariant('m@effort=low@t=0.5'))).toEqual({ output_config: { effort: 'low' }, temperature: 0.5 })
    expect(() => parseVariant('m@t=2')).toThrow()
  })
})
