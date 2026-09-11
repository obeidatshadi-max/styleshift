import { describe, it, expect } from 'vitest'
import {
  computeSessionSignals, buildEvaluatorPrompt, parseEvaluatorResponse, groundEvaluatorResult,
  resolveDoctorStyleProfile, COMPETENCY_DIMENSIONS, ADAPTATION_DIMENSIONS, type DoctorStyleProfile,
} from './session-evaluator'
import type { ConversationTurn, Doctor } from '@/types/game'

const evenProfile: DoctorStyleProfile = resolveDoctorStyleProfile({ style: null, style_driver: null, style_expressive: null, style_amiable: null, style_analytical: null })

function adaptationBlock(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const adaptation: Record<string, unknown> = {}
  for (const dim of ADAPTATION_DIMENSIONS) adaptation[dim] = { score: 60, turnRefs: [1], rationale: 'ok' }
  return { ...adaptation, ...overrides }
}

function turn(overrides: Partial<ConversationTurn>): ConversationTurn {
  return {
    id: 't1', session_id: 's1', rep_id: 'r1', doctor_id: 'd1', turn_index: 0,
    role: 'doctor', text: 'It costs too much.', objection_type: 'true_objection', clear_steps_hit: [],
    trust: 50, skepticism: 50, engagement: 50, time_pressure: 30, created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const sampleSession: ConversationTurn[] = [
  turn({ turn_index: 0, role: 'doctor', text: 'Your product is too expensive.' }),
  turn({ turn_index: 1, role: 'rep', text: 'What specifically makes cost a concern for you?', clear_steps_hit: ['clarify'] }),
  turn({ turn_index: 2, role: 'doctor', text: 'I worry patients will not stay adherent given the price.' }),
  turn({ turn_index: 3, role: 'rep', text: 'That makes sense, adherence is the real risk here.', clear_steps_hit: ['listen', 'empathy'] }),
  turn({ turn_index: 4, role: 'doctor', text: 'Okay, tell me more about the evidence pack.' }),
  turn({ turn_index: 5, role: 'rep', text: 'The evidence pack shows strong real-world adherence data. Does that address your concern?', clear_steps_hit: ['answer', 'recheck'] }),
]

describe('computeSessionSignals', () => {
  it('counts rep/doctor turns and average rep turn length', () => {
    const s = computeSessionSignals(sampleSession, false)
    expect(s.repTurnCount).toBe(3)
    expect(s.doctorTurnCount).toBe(3)
    expect(s.avgRepTurnLength).toBeGreaterThan(0)
    expect(s.turnsToResolution).toBe(3)
  })

  it('classifies open vs closed questions from rep turns', () => {
    const s = computeSessionSignals(sampleSession, false)
    expect(s.questionCount).toBeGreaterThan(0)
    expect(s.openQuestionCount + s.closedQuestionCount).toBe(s.questionCount)
  })

  it('counts objection types from persisted rows only', () => {
    const s = computeSessionSignals(sampleSession, false)
    expect(s.objectionCounts.true_objection).toBe(sampleSession.length)
  })

  it('collects the CLEAR-step sequence in first-occurrence order, deduped', () => {
    const s = computeSessionSignals(sampleSession, false)
    expect(s.clearStepsSequence).toEqual(['clarify', 'listen', 'empathy', 'answer', 'recheck'])
    expect(s.clearStepsHitCount).toBe(5)
  })

  it('returns null hiddenConcernRevealTurnIndex when the doctor has no hidden concern', () => {
    const s = computeSessionSignals(sampleSession, false)
    expect(s.hiddenConcernRevealTurnIndex).toBeNull()
  })

  it('finds the doctor turn right after the first "clarify" when a hidden concern exists', () => {
    const s = computeSessionSignals(sampleSession, true)
    expect(s.hiddenConcernRevealTurnIndex).toBe(2)
  })

  it('returns null reveal index when clarify never happens even with a hidden concern', () => {
    const noClarify = sampleSession.map(t => ({ ...t, clear_steps_hit: t.clear_steps_hit.filter(s => s !== 'clarify') }))
    const s = computeSessionSignals(noClarify, true)
    expect(s.hiddenConcernRevealTurnIndex).toBeNull()
  })

  it('handles an empty session without throwing', () => {
    const s = computeSessionSignals([], false)
    expect(s.repTurnCount).toBe(0)
    expect(s.questionCount).toBe(0)
    expect(s.avgRepTurnLength).toBe(0)
  })
})

describe('buildEvaluatorPrompt', () => {
  it('labels every transcript line with its real turn_index', () => {
    const s = computeSessionSignals(sampleSession, false)
    const prompt = buildEvaluatorPrompt(sampleSession, s, evenProfile, 'en')
    for (const t of sampleSession) expect(prompt).toContain(`[${t.turn_index}]`)
  })

  it('lists all competency dimensions to score', () => {
    const s = computeSessionSignals(sampleSession, false)
    const prompt = buildEvaluatorPrompt(sampleSession, s, evenProfile, 'en')
    for (const dim of COMPETENCY_DIMENSIONS) expect(prompt).toContain(dim)
  })

  it('lists all adaptation dimensions to score', () => {
    const s = computeSessionSignals(sampleSession, false)
    const prompt = buildEvaluatorPrompt(sampleSession, s, evenProfile, 'en')
    for (const dim of ADAPTATION_DIMENSIONS) expect(prompt).toContain(dim)
  })

  it('names the dominant style in the prompt when the doctor has a weighted profile', () => {
    const s = computeSessionSignals(sampleSession, false)
    const profile = resolveDoctorStyleProfile({ style: null, style_driver: 0.7, style_expressive: 0.1, style_amiable: 0.1, style_analytical: 0.1 })
    const prompt = buildEvaluatorPrompt(sampleSession, s, profile, 'en')
    expect(prompt).toContain('driver')
    expect(prompt).toContain('70%')
  })
})

describe('resolveDoctorStyleProfile', () => {
  const base: Pick<Doctor, 'style' | 'style_driver' | 'style_expressive' | 'style_amiable' | 'style_analytical'> = {
    style: null, style_driver: null, style_expressive: null, style_amiable: null, style_analytical: null,
  }

  it('normalizes weighted columns to fractions summing to 1', () => {
    const profile = resolveDoctorStyleProfile({ ...base, style_driver: 3, style_analytical: 1 })
    expect(profile.source).toBe('weighted')
    expect(profile.dominant).toBe('driver')
    expect(profile.weights.driver).toBeCloseTo(0.75)
    expect(profile.weights.analytical).toBeCloseTo(0.25)
    expect(profile.weights.driver + profile.weights.expressive + profile.weights.amiable + profile.weights.analytical).toBeCloseTo(1)
  })

  it('falls back to the legacy single style column as 100% that style', () => {
    const profile = resolveDoctorStyleProfile({ ...base, style: 'amiable' })
    expect(profile.source).toBe('legacy')
    expect(profile.dominant).toBe('amiable')
    expect(profile.weights.amiable).toBe(1)
  })

  it('returns an even split with no dominant style when nothing is configured', () => {
    const profile = resolveDoctorStyleProfile(base)
    expect(profile.source).toBe('unknown')
    expect(profile.dominant).toBeNull()
    expect(profile.weights.driver).toBeCloseTo(0.25)
  })
})

function validRawJson(overrides: Partial<Record<string, unknown>> = {}): string {
  const competencies: Record<string, unknown> = {}
  for (const dim of COMPETENCY_DIMENSIONS) competencies[dim] = { score: 70, turnRefs: [1], rationale: 'ok' }
  return JSON.stringify({
    competencies,
    adaptation: adaptationBlock(),
    adaptationRecommendation: 'This driver-leaning doctor wants brevity — keep replies to one sentence.',
    criticalMoments: [
      { turnIndex: 1, observedBehavior: 'asked an open question', missedOpportunity: null, alternative: null },
    ],
    ...overrides,
  })
}

describe('parseEvaluatorResponse', () => {
  it('parses a well-formed response', () => {
    const parsed = parseEvaluatorResponse(validRawJson())
    expect(parsed).not.toBeNull()
    expect(parsed?.criticalMoments).toHaveLength(1)
  })

  it('rejects non-JSON text', () => {
    expect(parseEvaluatorResponse('not json at all')).toBeNull()
  })

  it('rejects a response missing a competency dimension', () => {
    const competencies: Record<string, unknown> = {}
    for (const dim of COMPETENCY_DIMENSIONS.slice(1)) competencies[dim] = { score: 70, turnRefs: [1], rationale: 'ok' }
    const text = JSON.stringify({ competencies, criticalMoments: [] })
    expect(parseEvaluatorResponse(text)).toBeNull()
  })

  it('rejects a response where criticalMoments is not an array', () => {
    expect(parseEvaluatorResponse(validRawJson({ criticalMoments: 'nope' }))).toBeNull()
  })

  it('drops malformed individual critical moments instead of failing the whole response', () => {
    const parsed = parseEvaluatorResponse(validRawJson({
      criticalMoments: [
        { turnIndex: 1, observedBehavior: 'fine', missedOpportunity: null, alternative: null },
        { turnIndex: 'not-a-number', observedBehavior: 'bad', missedOpportunity: null, alternative: null },
      ],
    }))
    expect(parsed?.criticalMoments).toHaveLength(1)
  })
})

describe('groundEvaluatorResult', () => {
  it('drops turnRefs/turnIndex citations that are not real turn_index values in this session', () => {
    const competencies: Record<string, unknown> = {}
    for (const dim of COMPETENCY_DIMENSIONS) competencies[dim] = { score: 80, turnRefs: [1, 999], rationale: 'ok' }
    const raw = {
      competencies: competencies as never,
      adaptation: adaptationBlock({ pace: { score: 80, turnRefs: [1, 999], rationale: 'ok' } }) as never,
      adaptationRecommendation: 'x',
      criticalMoments: [
        { turnIndex: 999, observedBehavior: 'invented', missedOpportunity: null, alternative: null },
        { turnIndex: 3, observedBehavior: 'real one', missedOpportunity: null, alternative: null },
      ],
    }
    const grounded = groundEvaluatorResult(raw, sampleSession)
    expect(grounded.competencies.opening.turnRefs).toEqual([1])
    expect(grounded.adaptation.pace.turnRefs).toEqual([1])
    expect(grounded.criticalMoments).toHaveLength(1)
    expect(grounded.criticalMoments[0].turnIndex).toBe(3)
  })

  it('computes adaptationScore as the average of present dimension scores, never trusting a model-supplied total', () => {
    const competencies: Record<string, unknown> = {}
    for (const dim of COMPETENCY_DIMENSIONS) competencies[dim] = { score: 50, turnRefs: [], rationale: '' }
    const raw = {
      competencies: competencies as never,
      adaptation: adaptationBlock({
        pace: { score: 80, turnRefs: [], rationale: '' },
        detail: { score: 40, turnRefs: [], rationale: '' },
        evidence_orientation: { score: null, turnRefs: [], rationale: 'no evidence discussion this session' },
      }) as never,
      adaptationRecommendation: 'This analytical-leaning doctor wants more evidence up front.',
      criticalMoments: [],
    }
    const grounded = groundEvaluatorResult(raw, sampleSession)
    expect(grounded.adaptation.evidence_orientation.score).toBeNull()
    // pace 80, detail 40, and the 4 remaining dims default to 60 (adaptationBlock's base) — average of the 6 present scores.
    expect(grounded.adaptationScore).toBe(Math.round((80 + 40 + 60 * 4) / 6))
    expect(grounded.adaptationRecommendation).toContain('analytical-leaning')
  })

  it('returns adaptationScore null when every dimension is null (insufficient data throughout)', () => {
    const competencies: Record<string, unknown> = {}
    for (const dim of COMPETENCY_DIMENSIONS) competencies[dim] = { score: null, turnRefs: [], rationale: '' }
    const noEvidence: Record<string, unknown> = {}
    for (const dim of ADAPTATION_DIMENSIONS) noEvidence[dim] = { score: null, turnRefs: [], rationale: 'insufficient data' }
    const raw = { competencies: competencies as never, adaptation: noEvidence as never, adaptationRecommendation: '', criticalMoments: [] }
    const grounded = groundEvaluatorResult(raw, sampleSession)
    expect(grounded.adaptationScore).toBeNull()
  })

  it('replaces critical-moment quote/role/createdAt with the real persisted row, never the model text', () => {
    const competencies: Record<string, unknown> = {}
    for (const dim of COMPETENCY_DIMENSIONS) competencies[dim] = { score: null, turnRefs: [], rationale: '' }
    const raw = {
      competencies: competencies as never,
      adaptation: adaptationBlock() as never,
      adaptationRecommendation: 'x',
      criticalMoments: [{ turnIndex: 3, observedBehavior: 'strong recovery', missedOpportunity: null, alternative: 'ask one more question' }],
    }
    const grounded = groundEvaluatorResult(raw, sampleSession)
    const moment = grounded.criticalMoments[0]
    expect(moment.quote).toBe(sampleSession[3].text)
    expect(moment.role).toBe('rep')
    expect(moment.createdAt).toBe(sampleSession[3].created_at)
    expect(moment.observedBehavior).toBe('strong recovery')
  })

  it('clamps out-of-range scores and preserves null (insufficient data) scores', () => {
    const competencies: Record<string, unknown> = {}
    for (const dim of COMPETENCY_DIMENSIONS) competencies[dim] = { score: 150, turnRefs: [], rationale: '' }
    competencies.closing = { score: null, turnRefs: [], rationale: 'session ended before a close was attempted' }
    const raw = { competencies: competencies as never, adaptation: adaptationBlock() as never, adaptationRecommendation: 'x', criticalMoments: [] }
    const grounded = groundEvaluatorResult(raw, sampleSession)
    expect(grounded.competencies.opening.score).toBe(100)
    expect(grounded.competencies.closing.score).toBeNull()
  })
})
