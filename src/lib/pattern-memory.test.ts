import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildInsights, PATTERN_MEMORY_RULES } from '@/lib/pattern-memory'
import { drillRegistry } from '@/lib/drill-templates'
import type { BehaviorEvent, EventContext, InsightKind } from '@/schemas/pattern'

const base: EventContext = { physicianStyle: 'analytical', difficulty: 'realistic', language: 'en', objectionType: 'doubt', scenarioId: null }
let n = 0
const ev = (sessionId: string, behavior: string, effect: 'helped' | 'hurt', ctx: Partial<EventContext> = {}, text = `said ${behavior}`): BehaviorEvent => ({
  id: `${sessionId}:${behavior}:${n++}`, sessionId, behavior, competency: 'x', effect, confidence: 0.9, occurredAt: null,
  context: { ...base, ...ctx }, evidence: [{ turnIndex: 1, role: 'rep', text }],
})
const ids = (count: number) => Array.from({ length: count }, (_, i) => `s${i + 1}`) // newest first
const kinds = (list: ReturnType<typeof buildInsights>) => list.map(i => i.kind)

describe('recurring habits and strengths', () => {
  it('make no insight from fewer than 3 sessions, however many events', () => {
    const events = [ev('s1', 'premature_pitch', 'hurt'), ev('s1', 'premature_pitch', 'hurt'), ev('s2', 'premature_pitch', 'hurt'), ev('s1', 'clarification', 'helped'), ev('s2', 'clarification', 'helped')]
    expect(buildInsights(events, ids(5))).toEqual([])
  })

  it('reports a recurring habit with counts, the rep\'s verbatim words and a hedged, labelled reading', () => {
    const events = ['s1', 's2', 's3'].map((s, i) => ev(s, 'premature_pitch', 'hurt', {}, `Our product is great ${i}`))
    const [insight] = buildInsights(events, ids(5))
    expect(insight).toMatchObject({ kind: 'recurring_hurt', observed: { behavior: 'premature_pitch', sessionsWith: 3, sessionsConsidered: 5 } })
    expect(insight.observed.evidence.map(e => e.text)).toEqual(['Our product is great 0', 'Our product is great 1', 'Our product is great 2'])
    expect(insight.interpretation).toEqual({ code: 'habit_under_conditions', certainty: 'inferred', caveats: ['small_sample', 'no_cause_known'] }) // 5 sessions is a small sample
    expect(buildInsights(events, ids(6))[0].interpretation.caveats).toEqual(['no_cause_known'])
    expect(insight.recommendation).toMatchObject({ kind: 'drill', focus: 'premature_pitch', changesScoringConfig: false })
  })

  it('uses the plain "recurring habit" reading when no condition clearly goes with it', () => {
    const mixed = [ev('s1', 'premature_pitch', 'hurt', { physicianStyle: 'driver', objectionType: 'doubt', difficulty: 'supportive' }),
      ev('s2', 'premature_pitch', 'hurt', { physicianStyle: 'amiable', objectionType: 'indifference', difficulty: 'realistic' }),
      ev('s3', 'premature_pitch', 'hurt', { physicianStyle: 'analytical', objectionType: 'wrong_info', difficulty: 'resistant' })]
    expect(buildInsights(mixed, ids(3))[0].interpretation.code).toBe('recurring_habit')
  })

  it('reports a recurring strength with a "keep going" recommendation and no drill', () => {
    const events = ['s1', 's2', 's3'].map(s => ev(s, 'style_matched', 'helped'))
    const [insight] = buildInsights(events, ids(4))
    expect(insight).toMatchObject({ kind: 'recurring_strength', interpretation: { code: 'reliable_strength' }, recommendation: { kind: 'keep_going', drillId: null } })
  })

  it('reports an eased habit only with enough history and a long enough quiet spell', () => {
    const old = ['s6', 's7', 's8'].map(s => ev(s, 'premature_pitch', 'hurt'))
    expect(kinds(buildInsights(old, ids(8)))).toEqual(['resolved_hurt'])
    expect(buildInsights(old, ids(7))).toEqual([]) // too little history to call it a change
    const recent = ['s2', 's7', 's8'].map(s => ev(s, 'premature_pitch', 'hurt'))
    expect(kinds(buildInsights(recent, ids(8)))).toEqual(['recurring_hurt'])
  })

  it('only looks at the newest sessions in the window', () => {
    const many = ids(30)
    const events = ['s28', 's29', 's30'].map(s => ev(s, 'premature_pitch', 'hurt'))
    expect(buildInsights(events, many)).toEqual([])
    expect(PATTERN_MEMORY_RULES.window).toBe(20)
  })
})

describe('differences by situation', () => {
  // discovery behaviors: clarification (helped) / premature_pitch (hurt)
  const sessionsFor = (prefix: string, count: number, wentWell: boolean, ctx: Partial<EventContext>, startAt = 1) =>
    Array.from({ length: count }, (_, i) => ev(`${prefix}${startAt + i}`, wentWell ? 'clarification' : 'premature_pitch', wentWell ? 'helped' : 'hurt', ctx, `${prefix} words ${i}`))
  const allIds = (list: BehaviorEvent[]) => [...new Set(list.map(e => e.sessionId))]

  it('says what differs between two physician styles, with counts, the weaker group\'s words and the right caveats', () => {
    const events = [...sessionsFor('a', 4, true, { physicianStyle: 'amiable' }), ...sessionsFor('n', 4, false, { physicianStyle: 'analytical' })]
    const contrast = buildInsights(events, allIds(events)).find(i => i.kind === 'context_contrast')!
    expect(contrast.observed.contrast).toEqual({
      dimension: 'discovery', contextKey: 'physicianStyle',
      higher: { value: 'amiable', positive: 4, sessions: 4 }, lower: { value: 'analytical', positive: 0, sessions: 4 },
    })
    expect(contrast.observed.evidence.every(e => e.text.startsWith('n words'))).toBe(true)
    expect(contrast.interpretation).toMatchObject({ code: 'varies_by_context', certainty: 'inferred' })
    expect(contrast.interpretation.caveats).toEqual(expect.arrayContaining(['no_cause_known', 'scenarios_not_random']))
    expect(contrast.recommendation).toMatchObject({ kind: 'drill', focus: 'discovery', changesScoringConfig: false })
  })

  it('finds the "fewer questions when the doctor doubts" kind of pattern across objection types', () => {
    const events = [...sessionsFor('q', 4, true, { objectionType: 'indifference' }), ...sessionsFor('d', 4, false, { objectionType: 'doubt' })]
    const c = buildInsights(events, allIds(events)).find(i => i.observed.contrast?.contextKey === 'objectionType')!
    expect(c.observed.contrast).toMatchObject({ higher: { value: 'indifference' }, lower: { value: 'doubt', positive: 0 } })
  })

  it('stays quiet when a group is too small, the gap is small, or the groups are alike', () => {
    const small = [...sessionsFor('a', 4, true, { physicianStyle: 'amiable' }), ...sessionsFor('n', 2, false, { physicianStyle: 'analytical' })]
    expect(buildInsights(small, allIds(small)).some(i => i.kind === 'context_contrast')).toBe(false)
    const alike = [...sessionsFor('a', 4, true, { physicianStyle: 'amiable' }), ...sessionsFor('n', 4, true, { physicianStyle: 'analytical' })]
    expect(buildInsights(alike, allIds(alike)).some(i => i.kind === 'context_contrast')).toBe(false)
    const near = [...sessionsFor('a', 5, true, { physicianStyle: 'amiable' }), ...sessionsFor('x', 1, false, { physicianStyle: 'amiable' }, 1),
      ...sessionsFor('n', 4, true, { physicianStyle: 'analytical' }), ...sessionsFor('y', 1, false, { physicianStyle: 'analytical' })]
    expect(buildInsights(near, allIds(near)).some(i => i.kind === 'context_contrast')).toBe(false)
  })

  it('picks a drill that fits the weaker style for adaptation', () => {
    const events = [...sessionsFor('a', 4, true, { physicianStyle: 'amiable' }).map(e => ({ ...e, behavior: 'style_matched' })),
      ...sessionsFor('n', 4, false, { physicianStyle: 'driver' }).map(e => ({ ...e, behavior: 'style_mismatch' }))]
    const c = buildInsights(events, allIds(events)).find(i => i.observed.contrast?.dimension === 'adaptation')!
    expect(c.recommendation.drillId).toBe('resistant-driver-1')
  })
})

describe('layers stay separate and safe', () => {
  const sample = () => {
    const events = [
      ...['s1', 's2', 's3', 's4'].map(s => ev(s, 'premature_pitch', 'hurt')),
      ...['s1', 's2', 's3'].map(s => ev(s, 'style_matched', 'helped')),
      ...['a1', 'a2', 'a3'].map(s => ev(s, 'clarification', 'helped', { physicianStyle: 'amiable' })),
      ...['b1', 'b2', 'b3'].map(s => ev(s, 'premature_pitch', 'hurt', { physicianStyle: 'driver' })),
    ]
    return buildInsights(events, [...ids(4), 'a1', 'a2', 'a3', 'b1', 'b2', 'b3'])
  }

  it('every insight is labelled inferred, holds codes (not prose) as its reading, and never changes scoring', () => {
    const list = sample()
    expect(list.length).toBeGreaterThan(2)
    for (const i of list) {
      expect(i.interpretation.certainty).toBe('inferred')
      expect(Object.keys(i.interpretation).sort()).toEqual(['caveats', 'certainty', 'code'])
      expect(i.interpretation.caveats).toContain('no_cause_known')
      expect(i.recommendation.changesScoringConfig).toBe(false)
      expect(JSON.stringify(i.recommendation)).not.toMatch(/weight|score/i)
      if (i.recommendation.drillId) expect(drillRegistry.get(i.recommendation.drillId)).toBeDefined()
    }
  })

  it('is deterministic', () => {
    expect(JSON.stringify(sample())).toBe(JSON.stringify(sample()))
  })

  it('has hedged wording in English and Arabic for every reading, caveat and insight kind - and no trait language', () => {
    const src = readFileSync('src/lib/i18n.tsx', 'utf8')
    const entries = (from: string, to: string) => {
      const block = src.slice(src.indexOf(from), src.indexOf(to))
      const out = new Map<string, string>()
      for (const line of block.split(/\r?\n/)) { const m = /^\s*'([^']+)':\s*'(.*)',?\s*$/.exec(line); if (m) out.set(m[1], m[2]) }
      return out
    }
    const en = entries('const EN: Dict = {', 'const AR: Dict = {')
    const ar = entries('const AR: Dict = {', 'const DICTS')
    const codes = ['recurring_habit', 'habit_under_conditions', 'reliable_strength', 'varies_by_context', 'habit_changed']
    const kindList: InsightKind[] = ['recurring_hurt', 'recurring_strength', 'context_contrast', 'resolved_hurt']
    for (const code of codes) {
      const text = en.get(`pm.int.${code}`)!
      expect(text, code).toMatch(/\bmay\b/)
      expect(text, code).not.toMatch(/\b(always|never|lazy|personality|you are|you're)\b/i)
      expect(ar.get(`pm.int.${code}`), code).toBeTruthy()
    }
    for (const c of ['small_sample', 'no_cause_known', 'scenarios_not_random']) { expect(en.get(`pm.cav.${c}`)).toBeTruthy(); expect(ar.get(`pm.cav.${c}`)).toBeTruthy() }
    for (const k of kindList) { expect(en.get(`pm.kind.${k}`)).toBeTruthy(); expect(en.get(`pm.obs.${k}`)).toBeTruthy(); expect(ar.get(`pm.obs.${k}`)).toBeTruthy() }
  })
})
