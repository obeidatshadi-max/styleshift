import { describe, expect, it, vi } from 'vitest'
import { computeCapabilityIQ } from '@/lib/capability-iq'
import { loadCapabilityReport } from '@/lib/capability-load'
import { CAPABILITY_DIMENSIONS, defaultCapabilityConfig, dimensionOfBehavior, parseCapabilityConfig } from '@/scoring/capability'
import { behaviorIndex, defaultScoringConfig } from '@/scoring/config'
import { createEmptySession } from '@/schemas/session/factory'
import type { BehaviorEvent } from '@/schemas/pattern'
import raw from '@/scoring/capability.config.json'

const ctx = { physicianStyle: null, difficulty: 'realistic', language: 'en', objectionType: null, scenarioId: null } as const
let n = 0
const ev = (sessionId: string, behavior: string, effect: 'helped' | 'hurt', confidence = 0.9, at = `2026-10-${String(1 + Number(sessionId.replace(/\D/g, '')) % 28).padStart(2, '0')}T10:00:00Z`): BehaviorEvent => ({
  id: `${sessionId}:${behavior}:${n++}`, sessionId, behavior, competency: 'x', effect, confidence, occurredAt: at, context: ctx,
  evidence: [{ turnIndex: 1, role: 'rep', text: `said ${behavior}` }],
})
const clone = () => JSON.parse(JSON.stringify(raw))

describe('capability config', () => {
  it('ships valid, with every behavior in the scoring catalog and in exactly one dimension', () => {
    const catalog = behaviorIndex(defaultScoringConfig)
    const seen = new Set<string>()
    for (const d of CAPABILITY_DIMENSIONS) for (const k of Object.keys(defaultCapabilityConfig.dimensions[d].behaviors)) {
      expect(catalog.has(k)).toBe(true)
      expect(seen.has(k)).toBe(false)
      seen.add(k)
    }
    expect(dimensionOfBehavior(defaultCapabilityConfig).get('clarification')).toBe('discovery')
  })

  it('places every scoring-catalog behavior in a dimension (guards against new behaviors silently going uncounted)', () => {
    const mapped = dimensionOfBehavior(defaultCapabilityConfig)
    const missing = [...behaviorIndex(defaultScoringConfig).keys()].filter(k => !mapped.has(k))
    expect(missing).toEqual([])
  })

  it('rejects a behavior that is not in the catalog, a double claim, bad bands and a bad weight', () => {
    const unknown = clone(); unknown.dimensions.discovery.behaviors.made_up = 1
    expect(() => parseCapabilityConfig(unknown)).toThrow(/not in the scoring catalog/)
    const twice = clone(); twice.dimensions.commitment.behaviors.clarification = 1
    expect(() => parseCapabilityConfig(twice)).toThrow(/both discovery and commitment|both commitment and discovery/)
    const bands = clone(); bands.bands.strong = 30
    expect(() => parseCapabilityConfig(bands)).toThrow(/bands.strong/)
    const weight = clone(); weight.dimensions.discovery.behaviors.clarification = 0
    expect(() => parseCapabilityConfig(weight)).toThrow(/weight must be > 0/)
  })
})

describe('computeCapabilityIQ', () => {
  it('has no overall score and always reports all five dimensions', () => {
    const r = computeCapabilityIQ([])
    expect(Object.keys(r.dimensions).sort()).toEqual([...CAPABILITY_DIMENSIONS].sort())
    expect(r).not.toHaveProperty('overall')
    expect(r.sessionsConsidered).toBe(0)
  })

  it('refuses to score a dimension with too few events or too few distinct sessions', () => {
    const oneSession = ['clarification', 'open_question', 'need_uncovered', 'criteria_question'].map(b => ev('s1', b, 'helped'))
    expect(computeCapabilityIQ(oneSession).dimensions.discovery).toMatchObject({ status: 'insufficient_evidence', eventsUsed: 4, sessionsUsed: 1, needed: { events: 3, sessions: 2 } })
    const twoEvents = [ev('s1', 'clarification', 'helped'), ev('s2', 'open_question', 'helped')]
    expect(computeCapabilityIQ(twoEvents).dimensions.discovery.status).toBe('insufficient_evidence')
  })

  it('scores a dimension from its own behaviors only', () => {
    const events = [ev('s1', 'clarification', 'helped'), ev('s2', 'open_question', 'helped'), ev('s2', 'need_uncovered', 'helped'), ev('s1', 'next_step_proposed', 'helped')]
    const r = computeCapabilityIQ(events)
    expect(r.dimensions.discovery.status).toBe('scored')
    expect(r.dimensions.commitment.status).toBe('insufficient_evidence')
  })

  it('rounds to the configured step, so a score is never a false-precision number', () => {
    const events = [ev('s1', 'clarification', 'helped', 0.7), ev('s2', 'open_question', 'hurt', 0.6), ev('s2', 'need_uncovered', 'helped', 0.8), ev('s3', 'premature_pitch', 'hurt', 0.55)]
    const d = computeCapabilityIQ(events).dimensions.discovery
    if (d.status !== 'scored') throw new Error('expected scored')
    expect(d.score % defaultCapabilityConfig.roundTo).toBe(0)
  })

  it('moves the score the right way and keeps a lone event from reaching the extremes', () => {
    const good = (id: string) => [ev(id, 'clarification', 'helped'), ev(id, 'need_uncovered', 'helped')]
    const bad = (id: string) => [ev(id, 'premature_pitch', 'hurt'), ev(id, 'leading_question', 'hurt')]
    const up = computeCapabilityIQ([...good('s1'), ...good('s2')]).dimensions.discovery
    const down = computeCapabilityIQ([...bad('s1'), ...bad('s2')]).dimensions.discovery
    if (up.status !== 'scored' || down.status !== 'scored') throw new Error('expected scored')
    expect(up.score).toBeGreaterThan(60)
    expect(down.score).toBeLessThan(40)
    expect(up.score).toBeLessThan(100)
    expect(down.score).toBeGreaterThan(0)
    expect(up.band === 'strong' || up.band === 'advanced').toBe(true)
    expect(down.band).toBe('developing')
  })

  it('weights a high-confidence observation above a low-confidence one', () => {
    const sure = computeCapabilityIQ([ev('s1', 'clarification', 'helped', 0.95), ev('s2', 'clarification', 'helped', 0.95), ev('s2', 'premature_pitch', 'hurt', 0.35)]).dimensions.discovery
    const unsure = computeCapabilityIQ([ev('s1', 'clarification', 'helped', 0.35), ev('s2', 'clarification', 'helped', 0.35), ev('s2', 'premature_pitch', 'hurt', 0.95)]).dimensions.discovery
    if (sure.status !== 'scored' || unsure.status !== 'scored') throw new Error('expected scored')
    expect(sure.score).toBeGreaterThan(unsure.score)
  })

  it('detects an improving, a worsening and a steady trend, and says "unclear" with too few sessions', () => {
    const run = (shape: Array<'helped' | 'hurt'>) => {
      const events = shape.flatMap((effect, i) => [ev(`s${i + 1}`, 'clarification', effect), ev(`s${i + 1}`, 'need_uncovered', effect)])
      const d = computeCapabilityIQ(events).dimensions.discovery
      if (d.status !== 'scored') throw new Error('expected scored')
      return d.trend
    }
    expect(run(['hurt', 'hurt', 'helped', 'helped'])).toBe('improving')
    expect(run(['helped', 'helped', 'hurt', 'hurt'])).toBe('worsening')
    expect(run(['helped', 'helped', 'helped', 'helped'])).toBe('stable')
    expect(run(['hurt', 'helped', 'helped'])).toBe('unclear')
  })

  it('rates confidence from amount of evidence, number of sessions and observation confidence', () => {
    const many = Array.from({ length: 4 }, (_, i) => [ev(`s${i + 1}`, 'clarification', 'helped', 0.9), ev(`s${i + 1}`, 'need_uncovered', 'helped', 0.9)]).flat()
    const few = [ev('s1', 'clarification', 'helped', 0.4), ev('s2', 'need_uncovered', 'helped', 0.4), ev('s2', 'open_question', 'helped', 0.4)]
    const hi = computeCapabilityIQ(many).dimensions.discovery
    const lo = computeCapabilityIQ(few).dimensions.discovery
    if (hi.status !== 'scored' || lo.status !== 'scored') throw new Error('expected scored')
    expect(hi.confidence).toBe('high')
    expect(lo.confidence).toBe('low')
  })

  it('shows the behaviors and the rep\'s own words behind a score, strongest first', () => {
    const events = [ev('s1', 'clarification', 'helped', 0.9), ev('s2', 'need_uncovered', 'helped', 0.5), ev('s2', 'premature_pitch', 'hurt', 0.9), ev('s1', 'open_question', 'helped', 0.9)]
    const d = computeCapabilityIQ(events).dimensions.discovery
    if (d.status !== 'scored') throw new Error('expected scored')
    expect(d.evidence.hurt[0]).toMatchObject({ behavior: 'premature_pitch', quote: 'said premature_pitch' })
    expect(d.evidence.helped.map(e => e.behavior)[0]).toBe('clarification')
    expect(d.evidence.helped.length).toBeLessThanOrEqual(3)
  })

  it('only looks at the newest sessions in the window', () => {
    const old = Array.from({ length: 10 }, (_, i) => [ev(`s${i + 1}`, 'premature_pitch', 'hurt', 0.9, `2026-09-${String(10 + i)}T10:00:00Z`)]).flat()
    const fresh = Array.from({ length: 10 }, (_, i) => [ev(`n${i + 1}`, 'clarification', 'helped', 0.9, `2026-10-${String(10 + i)}T10:00:00Z`)]).flat()
    const r = computeCapabilityIQ([...old, ...fresh])
    expect(r.sessionsConsidered).toBe(10)
    const d = r.dimensions.discovery
    if (d.status !== 'scored') throw new Error('expected scored')
    expect(d.evidence.hurt).toEqual([])
  })

  it('tells the UI that Clinical IQ does not measure accuracy against approved sources', () => {
    const r = computeCapabilityIQ([ev('s1', 'evidence_referenced', 'helped'), ev('s2', 'evidence_referenced', 'helped'), ev('s2', 'unsupported_claim', 'hurt')])
    expect(r.dimensions.clinical.limit).toBe('accuracy_not_measured')
    expect(r.dimensions.discovery.limit).toBeNull()
  })

  it('honours a re-weighted config without code changes', () => {
    const cfg = parseCapabilityConfig((() => { const c = clone(); c.dimensions.discovery.behaviors.premature_pitch = 10; return c })())
    const events = [ev('s1', 'clarification', 'helped'), ev('s2', 'clarification', 'helped'), ev('s2', 'premature_pitch', 'hurt')]
    const base = computeCapabilityIQ(events).dimensions.discovery
    const heavy = computeCapabilityIQ(events, cfg).dimensions.discovery
    if (base.status !== 'scored' || heavy.status !== 'scored') throw new Error('expected scored')
    expect(heavy.score).toBeLessThan(base.score)
  })
})

describe('loadCapabilityReport', () => {
  const scoredRecord = (id: string, behavior: string, points: number, turn = 1) => {
    const s = createEmptySession(id, 'rep-1')
    s.endedAt = `2026-10-0${id.slice(-1)}T10:00:00Z`
    s.transcript = [{ turnIndex: turn, role: 'rep', text: `I ${behavior}`, objectionType: null, clearStepsHit: [], state: null, vocalFeedback: null, createdAt: null }]
    const empty = { score: null, reason: 'insufficient_evidence' as const, observationsUsed: 0, contributions: [] }
    s.scores = { competencies: { questioning: empty, active_listening: empty, adaptation: empty, objection_handling: empty, value_communication: empty, closing: empty,
      discovery: { score: 50, reason: 'scored', observationsUsed: 1, contributions: [{ behavior, direction: 'positive', confidence: 0.9, points, evidenceTurns: [turn] }] } },
      overall: 50, coverage: 0.2, configVersion: 'x', scoredAt: 'x' }
    return { record: { session: s, phase: 'scored', trace: [], report: null } }
  }

  it('reads only the rep\'s finished sessions and builds the report from them', async () => {
    const calls: string[] = []
    const rows = [scoredRecord('s1', 'clarification', 7), scoredRecord('s2', 'clarification', 7), scoredRecord('s3', 'need_uncovered', 8)]
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'order', 'limit']) chain[m] = (...a: unknown[]) => { calls.push(`${m}:${a.join(',')}`); return chain }
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: rows })
    const supabase = { from: vi.fn(() => chain) }
    const report = await loadCapabilityReport(supabase as never, 'rep-1')
    expect(supabase.from).toHaveBeenCalledWith('agent_sessions')
    expect(calls).toContain('eq:rep_id,rep-1')
    expect(calls.some(c => c.startsWith('in:phase,scored,reported'))).toBe(true)
    expect(report.sessionsConsidered).toBe(3)
    expect(report.dimensions.discovery.status).toBe('scored')
  })

  it('returns an empty, honest report when there is no history', async () => {
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'order', 'limit']) chain[m] = () => chain
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: null })
    const report = await loadCapabilityReport({ from: () => chain } as never, 'rep-1')
    expect(report.sessionsConsidered).toBe(0)
    expect(Object.values(report.dimensions).every(d => d.status === 'insufficient_evidence')).toBe(true)
  })
})
