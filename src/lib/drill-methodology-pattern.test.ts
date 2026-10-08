import { describe, expect, it } from 'vitest'
import { createDrillRegistry, retryState, scoreDrillResponse, summarizeDrillHistory } from '@/lib/drill-registry'
import { DRILL_TYPES, type DrillAttempt } from '@/schemas/drill'
import { stageCoverage, termFor, validateMethodology } from '@/schemas/methodology'
import { eventsFromSession, patternEligibility } from '@/lib/pattern-events'
import { createEmptySession } from '@/schemas/session/factory'
import type { SessionScore } from '@/schemas/scoring'

const drill = (over: Record<string, unknown> = {}) => ({
  id: 'pq-1', type: 'precision_questioning', version: 1, difficulty: 'standard', languages: ['en'],
  objective: { en: 'Ask a specifying question' }, prompt: { en: 'The doctor says: "Results vary."' },
  expectedResponse: 'question', durationMin: 3, physicianStyle: 'analytical', passMark: 0.6,
  retry: { maxAttempts: 3, hintAfterAttempts: 2 },
  criteria: [
    { behavior: 'clarification', weight: 2, required: true },
    { behavior: 'open_question', weight: 1, required: false },
    { behavior: 'premature_pitch', weight: 1, required: false },
  ],
  ...over,
})

describe('drill templates and registry', () => {
  it('declares the 15 requested drill types', () => { expect(DRILL_TYPES).toHaveLength(15) })

  it('builds a registry and filters by language and style', () => {
    const reg = createDrillRegistry([drill(), drill({ id: 'pq-2', languages: ['en', 'ar'], objective: { en: 'a', ar: 'ب' }, prompt: { en: 'a', ar: 'ب' }, physicianStyle: null })])
    expect(reg.list({ lang: 'ar' }).map(t => t.id)).toEqual(['pq-2'])
    expect(reg.list({ physicianStyle: 'analytical' }).map(t => t.id)).toEqual(['pq-1'])
    expect(reg.get('pq-1')?.passMark).toBe(0.6)
  })

  it('fails loudly on duplicate ids, unknown criteria and missing language text', () => {
    expect(() => createDrillRegistry([drill(), drill()])).toThrow(/duplicate id/)
    expect(() => createDrillRegistry([drill({ criteria: [{ behavior: 'nope', weight: 1 }] })])).toThrow(/scoring catalog/)
    expect(() => createDrillRegistry([drill({ languages: ['en', 'ar'] })])).toThrow(/missing ar text/)
  })

  it('does not allow a negative behavior to be "required"', () => {
    expect(() => createDrillRegistry([drill({ criteria: [{ behavior: 'premature_pitch', weight: 1, required: true }] })])).toThrow(/cannot be required/)
  })

  it('scores deterministically: positive behaviors must appear, negative must be absent', () => {
    const t = createDrillRegistry([drill()]).get('pq-1')!
    expect(scoreDrillResponse(t, ['clarification', 'open_question'])).toMatchObject({ score: 100, passed: true })
    expect(scoreDrillResponse(t, ['clarification', 'premature_pitch'])).toMatchObject({ score: 50, passed: false })
    expect(scoreDrillResponse(t, ['open_question'])).toMatchObject({ passed: false }) // required clarification missing
  })

  it('returns a null score, not a guess, when the response could not be assessed', () => {
    const t = createDrillRegistry([drill()]).get('pq-1')!
    expect(scoreDrillResponse(t, null)).toEqual({ score: null, passed: false, met: [], missed: [] })
  })

  it('summarizes history: personal best ignores unassessed attempts, completions are passes', () => {
    const at = (n: number, score: number | null, passed: boolean): DrillAttempt => ({
      drillId: 'pq-1', drillVersion: 1, repId: 'r', attemptNo: n, at: `2026-10-0${n}T00:00:00Z`, observedBehaviors: [], score, passed, lang: 'en',
    })
    expect(summarizeDrillHistory([at(1, 40, false), at(2, null, false), at(3, 80, true)])).toEqual({
      attempts: 3, completions: 1, personalBest: 80, lastAttemptAt: '2026-10-03T00:00:00Z',
    })
    expect(summarizeDrillHistory([])).toMatchObject({ personalBest: null, lastAttemptAt: null })
  })

  it('offers a hint and caps retries', () => {
    const t = createDrillRegistry([drill()]).get('pq-1')!
    expect(retryState(t, 1)).toEqual({ canRetry: true, showHint: false })
    expect(retryState(t, 2)).toEqual({ canRetry: true, showHint: true })
    expect(retryState(t, 3).canRetry).toBe(false)
  })
})

const methodology = (): { name: string; stages: Array<{ id: string; order: number; name: { en: string; ar?: string }; optional?: boolean; expectedBehaviors: string[]; prohibitedBehaviors: string[]; weight: number }>; terminology: Record<string, { en: string }> } => ({
  name: 'Clarify-Evidence-Agree',
  stages: [
    { id: 'explore', order: 1, name: { en: 'Explore', ar: 'استكشاف' }, expectedBehaviors: ['clarification', 'open_question'], prohibitedBehaviors: ['premature_pitch'], weight: 2 },
    { id: 'commit', order: 2, name: { en: 'Commit' }, optional: false, expectedBehaviors: ['next_step_proposed'], prohibitedBehaviors: [], weight: 1 },
  ],
  terminology: { clarification: { en: 'Clarify the Need' } },
})

describe('methodology', () => {
  it('validates and orders stages', () => {
    const res = validateMethodology({ ...methodology(), stages: [...methodology().stages].reverse() })
    expect(res.ok && res.value.stages.map(s => s.id)).toEqual(['explore', 'commit'])
  })

  it('rejects behaviors outside the shared ontology (no per-customer detectors)', () => {
    const bad = methodology(); bad.stages[0].expectedBehaviors.push('customer_special_move')
    expect(validateMethodology(bad).ok).toBe(false)
    expect(validateMethodology({ ...methodology(), terminology: { invented_key: { en: 'x' } } }).ok).toBe(false)
  })

  it('rejects a behavior that is both expected and prohibited, and duplicate stage ids/orders', () => {
    const a = methodology(); a.stages[0].prohibitedBehaviors.push('clarification')
    expect(validateMethodology(a).ok).toBe(false)
    const b = methodology(); b.stages[1].id = 'explore'
    expect(validateMethodology(b).ok).toBe(false)
    const c = methodology(); c.stages[1].order = 1
    expect(validateMethodology(c).ok).toBe(false)
  })

  it('renames behaviors per client without touching analytics', () => {
    const m = validateMethodology(methodology())
    if (!m.ok) throw new Error(m.errors.join())
    const other = validateMethodology({ ...methodology(), terminology: { clarification: { en: 'Deep Discovery', ar: 'استكشاف عميق' } } })
    if (!other.ok) throw new Error(other.errors.join())
    expect(termFor(m.value, 'clarification', 'en')).toBe('Clarify the Need')
    expect(termFor(other.value, 'clarification', 'ar')).toBe('استكشاف عميق')
    expect(termFor(m.value, 'clarification', 'ar')).toBe('Clarify the Need') // falls back to en, not to another client
    expect(termFor(m.value, 'need_uncovered', 'en')).toBe('need uncovered')
  })

  it('reports stage coverage from the same ontology keys for every client', () => {
    const m = validateMethodology(methodology())
    if (!m.ok) throw new Error(m.errors.join())
    expect(stageCoverage(m.value, ['clarification', 'premature_pitch'])).toEqual([
      { stageId: 'explore', expectedSeen: ['clarification'], expectedMissing: ['open_question'], prohibitedSeen: ['premature_pitch'] },
      { stageId: 'commit', expectedSeen: [], expectedMissing: ['next_step_proposed'], prohibitedSeen: [] },
    ])
  })
})

function scoredSession(id: string, contributions: Array<{ behavior: string; points: number; evidenceTurns: number[] }>) {
  const s = createEmptySession(id, 'rep-1')
  s.endedAt = '2026-10-01T10:00:00Z'
  s.socialStyle.dominant = 'analytical'
  s.transcript = [
    { turnIndex: 0, role: 'doctor', text: 'What is the evidence?', objectionType: null, clearStepsHit: [], state: null, vocalFeedback: null, createdAt: null },
    { turnIndex: 1, role: 'rep', text: 'Let me explain how it works.', objectionType: null, clearStepsHit: [], state: null, vocalFeedback: null, createdAt: null },
  ]
  const empty = { score: null, reason: 'insufficient_evidence' as const, observationsUsed: 0, contributions: [] }
  s.scores = {
    competencies: {
      questioning: empty, active_listening: empty, adaptation: empty, objection_handling: empty, value_communication: empty, closing: empty,
      discovery: { score: 40, reason: 'scored', observationsUsed: contributions.length, contributions: contributions.map(c => ({ ...c, direction: c.points > 0 ? 'positive' : 'negative', confidence: 0.8 })) },
    },
    overall: 40, coverage: 0.2, configVersion: '1.0.0', scoredAt: 'x',
  } as SessionScore
  return s
}

describe('pattern events', () => {
  it('extracts grounded events with context and transcript evidence (no model text)', () => {
    const events = eventsFromSession(scoredSession('s1', [{ behavior: 'premature_pitch', points: -5, evidenceTurns: [1] }]))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      id: 's1:premature_pitch:hurt', behavior: 'premature_pitch', competency: 'discovery', effect: 'hurt', confidence: 0.8,
      context: { physicianStyle: 'analytical', difficulty: 'realistic', language: 'en' },
      evidence: [{ turnIndex: 1, role: 'rep', text: 'Let me explain how it works.' }],
    })
  })

  it('returns nothing for an unscored session and ignores zero-point contributions', () => {
    expect(eventsFromSession(createEmptySession('s0', 'r'))).toEqual([])
    expect(eventsFromSession(scoredSession('s2', [{ behavior: 'clarification', points: 0, evidenceTurns: [] }]))).toEqual([])
  })

  it('merges a behavior repeated within one session into one event', () => {
    const events = eventsFromSession(scoredSession('s3', [
      { behavior: 'premature_pitch', points: -5, evidenceTurns: [0] }, { behavior: 'premature_pitch', points: -3, evidenceTurns: [1] },
    ]))
    expect(events).toHaveLength(1)
    expect(events[0].evidence.map(e => e.turnIndex)).toEqual([0, 1])
  })

  it('does not call anything a pattern until it spans enough distinct sessions', () => {
    const one = Array.from({ length: 5 }, () => eventsFromSession(scoredSession('same', [{ behavior: 'premature_pitch', points: -5, evidenceTurns: [1] }]))[0])
    expect(patternEligibility(one)).toMatchObject({ eligible: false, sessions: 1, needed: 3 })
    const three = ['a', 'b', 'c'].map(id => eventsFromSession(scoredSession(id, [{ behavior: 'premature_pitch', points: -5, evidenceTurns: [1] }]))[0])
    expect(patternEligibility(three)).toEqual({ eligible: true, sessions: 3 })
  })
})
