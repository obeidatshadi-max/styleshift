// src/lib/report/groundReport.test.ts
import { describe, it, expect } from 'vitest'
import { groundReport, buildVoiceMeasurements, stripSegmentRefs } from './groundReport'
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

describe('stripSegmentRefs', () => {
  it('removes bracketed transcript indices the model echoed into prose', () => {
    expect(stripSegmentRefs('Rep asked open questions ([1], [3]) but did not summarize.')).toBe('Rep asked open questions but did not summarize.')
    expect(stripSegmentRefs('Strong opening [0] and a clear close [4].')).toBe('Strong opening and a clear close.')
    expect(stripSegmentRefs('Used open questions [1, 3] early.')).toBe('Used open questions early.')
  })
  it('leaves ordinary text and non-index brackets alone', () => {
    expect(stripSegmentRefs('Asked about the [drug] interaction.')).toBe('Asked about the [drug] interaction.')
    expect(stripSegmentRefs('Asked two questions.')).toBe('Asked two questions.')
  })
})

describe('groundReport', () => {
  const moment = {
    evidence: { segmentIndex: 0 }, possibleMeanings: ['They may need a concise comparison.'],
    missingContext: 'Which evidence matters most?', clarifyingQuestion: 'Which comparison would help?',
    subsequentResponse: { segmentIndex: 999, quote: 'I agree to prescribe.' },
  }
  it('grounds a context card and never invents a subsequent response', () => {
    const report = groundReport(minimalRaw({ momentUnderstanding: moment }), segments, context, base)!
    expect(report.momentUnderstanding?.evidence.quote).toBe(segments[0].text)
    expect(report.momentUnderstanding?.subsequentResponse).toBeNull()
  })
  it('uses the first actual doctor response after a rep turn, not a model-selected outcome', () => {
    const extended: TranscriptSegment[] = [...segments,
      { ...segments[0], segmentIndex: 2, text: 'Show me the comparison.' },
      { ...segments[0], segmentIndex: 3, text: 'Thank you.' },
    ]
    const report = groundReport(minimalRaw({ momentUnderstanding: { ...moment, subsequentResponse: { segmentIndex: 3 } } }), extended, context, base)!
    expect(report.momentUnderstanding?.subsequentResponse?.quote).toBe('Show me the comparison.')
  })
  it('rejects a rep anchor, absent evidence or incomplete interpretation without losing the report', () => {
    for (const invalid of [
      { ...moment, evidence: { segmentIndex: 1, speakerRole: 'counterpart' } },
      { ...moment, evidence: { segmentIndex: 99 } },
      { ...moment, possibleMeanings: [] },
      { ...moment, clarifyingQuestion: '' },
    ]) {
      expect(groundReport(minimalRaw({ momentUnderstanding: invalid }), segments, context, base)?.momentUnderstanding).toBeNull()
    }
    expect(groundReport(minimalRaw(), segments, context, base)?.momentUnderstanding).toBeNull()
  })
  it('grounds vague statements to the counterpart and looks up the rep\'s real reply', () => {
    const report = groundReport(minimalRaw({ vagueStatements: [
      { evidence: { segmentIndex: 0, quote: 'invented' }, pattern: 'unspecified_referent', precisionQuestion: 'Which evidence, specifically?', repReply: { segmentIndex: 0 } },
    ] }), segments, context, base)!
    expect(report.vagueStatements).toHaveLength(1)
    expect(report.vagueStatements![0].evidence.quote).toBe(segments[0].text)
    expect(report.vagueStatements![0].repReply?.quote).toBe(segments[1].text)
  })
  it('drops vague statements with a rep anchor, unknown pattern, empty question or duplicate segment, and caps at 3', () => {
    const ok = { evidence: { segmentIndex: 0 }, pattern: 'deletion', precisionQuestion: 'About what?' }
    const report = groundReport(minimalRaw({ vagueStatements: [
      { ...ok, evidence: { segmentIndex: 1 } }, { ...ok, pattern: 'mind_reading' }, { ...ok, precisionQuestion: '' }, ok, ok,
    ] }), segments, context, base)!
    expect(report.vagueStatements).toHaveLength(1)
    expect(report.vagueStatements![0].repReply?.segmentIndex).toBe(1)
    const many: TranscriptSegment[] = [0, 2, 4, 6, 8].map(i => ({ ...segments[0], segmentIndex: i, text: `Doctor line ${i}.` }))
    const capped = groundReport(minimalRaw({ vagueStatements: many.map(m => ({ ...ok, evidence: { segmentIndex: m.segmentIndex } })) }), [...segments.slice(1), ...many], context, base)!
    expect(capped.vagueStatements).toHaveLength(3)
    expect(groundReport(minimalRaw(), segments, context, base)?.vagueStatements).toEqual([])
  })
  it('strips transcript indices from free-text report fields', () => {
    const raw = minimalRaw({ coachingPriority: { behavior: 'Ask open questions ([1], [3]) before pitching', evidence: [{ segmentIndex: 1, speakerRole: 'rep' }], betterPhrase: 'What matters most?', practiceExercise: 'One open question [1].', successLooksLike: 'A need is named.' } })
    const report = groundReport(raw, segments, context, base)!
    expect(report.coachingPriority.behavior).toBe('Ask open questions before pitching')
    expect(report.coachingPriority.practiceExercise).toBe('One open question.')
  })
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
    expect(report.visitSummary.objectiveStatusReason).toBe('No objective was supplied for this session.')
  })
  it('writes the no-objective reason in Arabic for an Arabic report', () => {
    const report = groundReport(minimalRaw(), segments, { ...context, objective: null }, { ...base, lang: 'ar' })!
    expect(report.visitSummary.objectiveStatusReason).toMatch(/[؀-ۿ]/)
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

  it('treats a real 0 as available — guards typeof v === "number" against a truthy-check regression', () => {
    const measurements = buildVoiceMeasurements({
      talkRatio: 0.1, rapidTurnSwitches: 0, questionRatio: 0.2, openQuestionRatio: 0.3,
    })
    const byMetric = Object.fromEntries(measurements.map(m => [m.metric, m]))
    expect(byMetric.rapid_turn_switches).toMatchObject({ available: true, value: 0, unit: 'count' })
  })
})
