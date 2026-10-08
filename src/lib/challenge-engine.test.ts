import { describe, expect, it } from 'vitest'
import { buildPatternRecords } from '@/lib/pattern-records'
import { challengeProgress, rankWeaknesses, recommendNext, targetedScenario, targetedSetup } from '@/lib/challenge-engine'
import { CHALLENGE_MAP } from '@/lib/challenge-map'
import { drillRegistry } from '@/lib/drill-templates'
import { behaviorIndex, defaultScoringConfig } from '@/scoring/config'
import { OBJECTION_TYPES } from '@/lib/voice-partner-core'
import { toEngineSetup } from '@/schemas/scenario'
import type { BehaviorEvent, EventContext } from '@/schemas/pattern'

const baseCtx: EventContext = { physicianStyle: 'analytical', difficulty: 'realistic', language: 'en', objectionType: 'doubt', scenarioId: null }
let n = 0
const hurt = (sessionId: string, behavior: string, ctx: Partial<EventContext> = {}, confidence = 0.9): BehaviorEvent => ({
  id: `${sessionId}:${behavior}:${n++}`, sessionId, behavior, competency: 'x', effect: 'hurt', confidence, occurredAt: null,
  context: { ...baseCtx, ...ctx }, evidence: [{ turnIndex: 1, role: 'rep', text: 'x' }],
})
/** Newest first, like the loader returns them. */
const ids = (count: number) => Array.from({ length: count }, (_, i) => `s${i + 1}`)

describe('challenge map', () => {
  it('covers exactly the behaviors that cost points in the scoring catalog', () => {
    const negative = [...behaviorIndex(defaultScoringConfig)].filter(([, v]) => v.rule.points < 0).map(([k]) => k).sort()
    expect(Object.keys(CHALLENGE_MAP).sort()).toEqual(negative)
  })

  it('points only at real drills, real objection types and the right competency', () => {
    const catalog = behaviorIndex(defaultScoringConfig)
    for (const [behavior, t] of Object.entries(CHALLENGE_MAP)) {
      expect(drillRegistry.get(t.drillId), behavior).toBeDefined()
      for (const id of Object.values(t.drillByStyle ?? {})) expect(drillRegistry.get(id as string), behavior).toBeDefined()
      expect(OBJECTION_TYPES).toContain(t.objectionType)
      expect(catalog.get(behavior)?.competency, behavior).toBe(t.competency)
    }
  })
})

describe('buildPatternRecords', () => {
  it('needs the behavior in at least 3 distinct sessions, however many events', () => {
    const events = [hurt('s1', 'premature_pitch'), hurt('s1', 'premature_pitch'), hurt('s2', 'premature_pitch')]
    expect(buildPatternRecords(events, ids(5))).toEqual([])
    const three = [...events, hurt('s3', 'premature_pitch')]
    expect(buildPatternRecords(three, ids(5))).toHaveLength(1)
  })

  it('counts sessions where nothing was observed, so frequency is not inflated', () => {
    const events = ['s1', 's2', 's3'].map(s => hurt(s, 'premature_pitch'))
    const [rec] = buildPatternRecords(events, ids(10))
    expect(rec).toMatchObject({ sessionsWith: 3, sessionsConsidered: 10, recencySessions: 0 })
  })

  it('ignores events from sessions outside the considered list', () => {
    const events = ['s1', 's2', 's3', 'old1', 'old2', 'old3'].map(s => hurt(s, 'premature_pitch'))
    expect(buildPatternRecords(events, ids(3))[0].sessionsWith).toBe(3)
    expect(buildPatternRecords(events.filter(e => e.sessionId.startsWith('old')), ids(3))).toEqual([])
  })

  it('reports where it clusters only when one context clearly dominates', () => {
    const clustered = ['s1', 's2', 's3'].map(s => hurt(s, 'premature_pitch', { physicianStyle: 'analytical' }))
    expect(buildPatternRecords(clustered, ids(3))[0].dominantContext).toMatchObject({ physicianStyle: 'analytical', difficulty: 'realistic' })
    const mixed = [hurt('s1', 'premature_pitch', { physicianStyle: 'driver' }), hurt('s2', 'premature_pitch', { physicianStyle: 'analytical' }), hurt('s3', 'premature_pitch', { physicianStyle: 'amiable' })]
    expect(buildPatternRecords(mixed, ids(3))[0].dominantContext.physicianStyle).toBeUndefined()
  })

  it('reads the trend from how often it occurs in newer vs older sessions', () => {
    const recent = ['s1', 's2', 's3'].map(s => hurt(s, 'premature_pitch'))
    expect(buildPatternRecords(recent, ids(6))[0].trend).toBe('worsening') // all in the newest half
    const older = ['s4', 's5', 's6'].map(s => hurt(s, 'premature_pitch'))
    expect(buildPatternRecords(older, ids(6))[0].trend).toBe('improving')
    expect(buildPatternRecords(['s1', 's2', 's3'].map(s => hurt(s, 'premature_pitch')), ids(3))[0].trend).toBe('unclear')
  })
})

describe('recommendNext', () => {
  it('says there is no pattern yet rather than inventing one', () => {
    expect(recommendNext([hurt('s1', 'premature_pitch'), hurt('s2', 'premature_pitch')], ids(4))).toEqual({ status: 'no_pattern', sessionsConsidered: 4, sessionsNeeded: 3 })
    expect(recommendNext([], [])).toMatchObject({ status: 'no_pattern' })
  })

  it('picks the most frequent and costly recurring weakness, and lists the next two', () => {
    const events = [
      ...ids(5).map(s => hurt(s, 'premature_pitch')),                  // 5 of 6, costs 5
      ...['s1', 's2', 's3'].map(s => hurt(s, 'hedged_delivery')),      // 3 of 6, costs 3
      ...['s2', 's4', 's5'].map(s => hurt(s, 'ignored_objection')),    // 3 of 6, costs 8
      ...['s1', 's3', 's5'].map(s => hurt(s, 'no_next_step')),
    ]
    const rec = recommendNext(events, ids(6))
    if (rec.status !== 'recommended') throw new Error('expected a recommendation')
    expect(rec.weakness.pattern.behavior).toBe('premature_pitch')
    expect(rec.alternatives).toHaveLength(2)
    expect(rec.changesScoringConfig).toBe(false)
  })

  it('is deterministic', () => {
    const events = [...ids(4).map(s => hurt(s, 'premature_pitch')), ...ids(4).map(s => hurt(s, 'no_next_step'))]
    expect(JSON.stringify(recommendNext(events, ids(4)))).toBe(JSON.stringify(recommendNext([...events].reverse(), ids(4))))
  })

  it('drops a weakness that has not appeared in the last 5 sessions (treated as resolved)', () => {
    const old = ['s6', 's7', 's8'].map(s => hurt(s, 'premature_pitch'))
    expect(rankWeaknesses(old, ids(8))).toEqual([])
  })

  it('ignores behaviors that helped, and behaviors with no exercise mapping', () => {
    const helped = ids(4).map(s => ({ ...hurt(s, 'clarification'), effect: 'helped' as const }))
    expect(rankWeaknesses(helped, ids(4))).toEqual([])
  })

  it('chooses the drill that fits the physician style the pattern clusters with', () => {
    const driver = ids(3).map(s => hurt(s, 'style_mismatch', { physicianStyle: 'driver' }))
    const rec = recommendNext(driver, ids(3))
    if (rec.status !== 'recommended') throw new Error('expected a recommendation')
    expect(rec.exercise.drillId).toBe('resistant-driver-1')
    const analytical = ids(3).map(s => hurt(s, 'style_mismatch', { physicianStyle: 'analytical' }))
    const rec2 = recommendNext(analytical, ids(3))
    if (rec2.status !== 'recommended') throw new Error('expected a recommendation')
    expect(rec2.exercise.drillId).toBe('difficult-analytical-1')
  })
})

describe('targetedSetup', () => {
  const weakness = (behavior: string, ctx: Partial<EventContext>, sessions = ids(3), idsAll = ids(3)) =>
    rankWeaknesses(sessions.map(s => hurt(s, behavior, ctx)), idsAll)[0]

  it('uses the style and objection where the behavior appeared, and steps difficulty up one level', () => {
    const w = weakness('unsupported_claim', { physicianStyle: 'analytical', difficulty: 'realistic', objectionType: 'doubt' })
    expect(targetedSetup(w, 'en')).toEqual({ physicianStyle: 'analytical', difficulty: 'skeptical', objectionType: 'doubt', language: 'en' })
  })

  it('falls back to the behavior\'s default style and objection when history shows no clear context', () => {
    const w = weakness('hedged_delivery', { physicianStyle: null, objectionType: null })
    expect(targetedSetup(w, 'ar')).toMatchObject({ physicianStyle: 'driver', objectionType: 'indifference' })
  })

  it('does not raise difficulty when the pattern is getting worse, and never auto-jumps to pressure_test from normal', () => {
    const worsening = weakness('premature_pitch', { difficulty: 'realistic' }, ['s1', 's2', 's3'], ids(6))
    expect(worsening.pattern.trend).toBe('worsening')
    expect(targetedSetup(worsening, 'en').difficulty).toBe('normal')
    const resistant = weakness('premature_pitch', { difficulty: 'resistant' })
    expect(targetedSetup(resistant, 'en').difficulty).not.toBe('pressure_test')
  })

  it('reaches pressure_test only from resistant doctors when the rep is improving', () => {
    const improving = weakness('premature_pitch', { difficulty: 'resistant' }, ['s4', 's5', 's6'], ids(6))
    expect(improving.pattern.trend).toBe('improving')
    expect(targetedSetup(improving, 'en').difficulty).toBe('pressure_test')
  })

  it('always produces a scenario the validator and the engine accept, for every mapped behavior and language', () => {
    for (const behavior of Object.keys(CHALLENGE_MAP)) {
      for (const language of ['en', 'ar'] as const) {
        const w = weakness(behavior, { language })
        const scenario = targetedScenario(w, targetedSetup(w, language))
        expect(scenario.scoringCriteria).toEqual([{ behavior, emphasis: 'focus' }])
        expect(scenario.requiredObjections).toHaveLength(1)
        expect(toEngineSetup(scenario).lang).toBe(language)
      }
    }
  })
})

describe('challengeProgress', () => {
  const all = ids(8)
  const targeted = new Set(['s1', 's2', 's3'])

  it('is too early with fewer than two targeted sessions', () => {
    expect(challengeProgress('premature_pitch', [], all, new Set(['s1'])).verdict).toBe('too_early')
  })

  it('compares how often the behavior appears in targeted vs other sessions, with a caveat', () => {
    const fewer = ['s4', 's5', 's6', 's7'].map(s => hurt(s, 'premature_pitch'))
    expect(challengeProgress('premature_pitch', fewer, all, targeted)).toMatchObject({ verdict: 'less_often', rateBefore: 0.8, rateAfter: 0, caveat: 'targeted_sessions_are_harder', targetedSessions: 3, otherSessions: 5 })
    const same = [...['s1', 's2'].map(s => hurt(s, 'premature_pitch')), ...['s4', 's5', 's6'].map(s => hurt(s, 'premature_pitch'))]
    expect(challengeProgress('premature_pitch', same, all, targeted).verdict).toBe('no_change')
    const more = ['s1', 's2', 's3'].map(s => hurt(s, 'premature_pitch'))
    expect(challengeProgress('premature_pitch', more, all, targeted).verdict).toBe('more_often')
  })
})
