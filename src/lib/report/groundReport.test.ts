// src/lib/report/groundReport.test.ts
import { describe, it, expect } from 'vitest'
import { groundReport, buildVoiceMeasurements } from './groundReport'
import type { TranscriptSegment, ReportContext } from '@/schemas/conversationReport'

const segments: TranscriptSegment[] = [
  { segmentIndex: 0, speakerRole: 'counterpart', text: 'I have five minutes only, and I need real evidence.', startMs: 0, endMs: 2000, createdAt: null },
  { segmentIndex: 1, speakerRole: 'rep', text: 'Here is the trial summary in one page.', startMs: 2000, endMs: 4000, createdAt: null },
]
const context: ReportContext = {
  objective: 'Introduce switch', productContext: null, isSimulation: false, simulationPersona: null,
  savedCounterpartStyle: null, deterministicMetrics: {}, qualityFlags: [],
}
const base = { sessionType: 'human_partner' as const, transcriptVersion: 1 }

function minimalRaw(overrides: Record<string, unknown> = {}) {
  return {
    visitSummary: { objective: 'Introduce switch', summary: 'Short visit.', objectiveStatus: 'partial', objectiveStatusReason: 'Time ran out.', evidence: [{ segmentIndex: 0, speakerRole: 'counterpart' }] },
    customerUnderstanding: { needs: [], concerns: [], decisionCriteria: [], openQuestions: [] },
    performance: [],
    criticalMoments: [],
    commitments: [],
    coachingPriority: { behavior: 'Ask before pitching', evidence: [{ segmentIndex: 1, speakerRole: 'rep' }], betterPhrase: 'What matters most to you today?', practiceExercise: 'Practice one open question.', successLooksLike: 'Customer answers with a need.' },
    strength: { behavior: 'Stayed brief', evidence: [{ segmentIndex: 1, speakerRole: 'rep' }] },
    socialStyle: { customer: { strongestSignals: [], possibleStyle: null }, rep: { strongestSignals: [], possibleStyle: null }, adaptation: [], signalChanges: [] },
    ...overrides,
  }
}

describe('groundReport', () => {
  it('resolves a real quote and drops a reference to a non-existent segmentIndex', () => {
    const raw = minimalRaw({
      criticalMoments: [
        { evidence: { segmentIndex: 0, speakerRole: 'counterpart' }, observedBehavior: 'Set a time limit', interpretation: 'Time pressure', interpretationCertainty: 'stated', betterResponseExample: null },
        { evidence: { segmentIndex: 99, speakerRole: 'counterpart' }, observedBehavior: 'fabricated', interpretation: 'fabricated', interpretationCertainty: 'stated', betterResponseExample: null },
      ],
    })
    const report = groundReport(raw, segments, context, base)!
    expect(report.criticalMoments).toHaveLength(1)
    expect(report.criticalMoments[0].evidence.quote).toBe('I have five minutes only, and I need real evidence.')
  })
  it('never trusts a model-supplied quote string even if present', () => {
    const raw = minimalRaw()
    ;(raw.coachingPriority.evidence[0] as Record<string, unknown>).quote = 'something the model made up'
    const report = groundReport(raw, segments, context, base)!
    expect(report.coachingPriority.evidence[0].quote).toBe('Here is the trial summary in one page.')
  })
  it('rejects an evidence-less finding entirely rather than keeping it with no support', () => {
    const raw = minimalRaw({
      performance: [{ dimension: 'opening', whatHappened: 'no evidence for this', evidence: [{ segmentIndex: 99, speakerRole: 'rep' }], whyItMattered: 'x', improvement: null }],
    })
    const report = groundReport(raw, segments, context, base)!
    expect(report.performance).toHaveLength(0)
  })
  it('never invents an objective when none was supplied, even if the model writes one', () => {
    const noObjectiveContext = { ...context, objective: null }
    const raw = minimalRaw()
    const report = groundReport(raw, segments, noObjectiveContext, base)!
    expect(report.visitSummary.objective).toBeNull()
  })
  it('labels a simulation persona style as isSimulationSetting, never as a discovered customer style', () => {
    const simContext: ReportContext = { ...context, isSimulation: true, simulationPersona: { style: 'driver', hiddenConcern: 'cost' } }
    const raw = minimalRaw({ socialStyle: { customer: { strongestSignals: [], possibleStyle: 'driver' }, rep: { strongestSignals: [], possibleStyle: null }, adaptation: [], signalChanges: [] } })
    const report = groundReport(raw, segments, simContext, base)!
    expect(report.socialStyle.customer.isSimulationSetting).toBe(true)
    expect(report.socialStyle.customer.savedProfile).toBeNull() // this flow has no independently "saved" profile
  })
  it('drops a commitment whose status is not one of the three valid values rather than defaulting to agreed', () => {
    const raw = minimalRaw({ commitments: [{ action: 'Send samples', status: 'done', owner: null, date: null, evidence: [{ segmentIndex: 1, speakerRole: 'rep' }] }] })
    const report = groundReport(raw, segments, context, base)!
    expect(report.commitments).toHaveLength(0)
  })
  it('returns null for a response with no usable top-level shape', () => {
    expect(groundReport({ nonsense: true }, segments, context, base)).toBeNull()
  })
})

describe('buildVoiceMeasurements', () => {
  it('marks talkRatio/rapidTurnSwitches/questionRatio/openQuestionRatio available with their real values, and the other 3 metrics unavailable', () => {
    const measurements = buildVoiceMeasurements({
      talkRatio: 0.62, rapidTurnSwitches: 4, questionRatio: 0.3, openQuestionRatio: 0.5,
    })
    expect(measurements).toHaveLength(7)

    const byMetric = Object.fromEntries(measurements.map(m => [m.metric, m]))
    expect(byMetric.speaking_share).toMatchObject({ available: true, value: 0.62, unit: 'ratio' })
    expect(byMetric.rapid_turn_switches).toMatchObject({ available: true, value: 4, unit: 'count' })
    expect(byMetric.question_frequency).toMatchObject({ available: true, value: 0.3, unit: 'ratio' })
    expect(byMetric.open_question_ratio).toMatchObject({ available: true, value: 0.5, unit: 'ratio' })

    expect(byMetric.speaking_rate).toMatchObject({ available: false, value: 0, unit: 'wpm' })
    expect(byMetric.pitch_variation).toMatchObject({ available: false, value: 0, unit: 'semitones' })
    expect(byMetric.pauses).toMatchObject({ available: false, value: 0, unit: 'count' })
  })

  it('returns all 7 entries, all unavailable, when deterministicMetrics is empty (every flow besides human_partner)', () => {
    const measurements = buildVoiceMeasurements({})
    expect(measurements).toHaveLength(7)
    expect(measurements.every(m => m.available === false)).toBe(true)
    expect(measurements.map(m => m.metric)).toEqual([
      'speaking_share', 'speaking_rate', 'pitch_variation', 'pauses',
      'rapid_turn_switches', 'question_frequency', 'open_question_ratio',
    ])
  })

  it('treats null deterministic metrics (nullable DB columns) the same as not available', () => {
    const measurements = buildVoiceMeasurements({
      talkRatio: null, rapidTurnSwitches: null, questionRatio: null, openQuestionRatio: null,
    })
    expect(measurements.every(m => m.available === false)).toBe(true)
  })
})
