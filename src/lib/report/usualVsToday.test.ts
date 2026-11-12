// "Usual pattern / This conversation / Helpful adjustment": grounding of the view, with synthetic transcripts only.
import { describe, it, expect } from 'vitest'
import { groundReport } from './groundReport'
import { mentionsEmotionDiagnosis } from './usualVsToday'
import { extractSocialSignals } from './socialSignals'
import { buildReportPrompt } from './buildReportPrompt'
import type { TranscriptSegment, ReportContext, SocialStyle } from '@/schemas/conversationReport'

const seg = (segmentIndex: number, speakerRole: 'rep' | 'counterpart', text: string): TranscriptSegment =>
  ({ segmentIndex, speakerRole, text, startMs: null, endMs: null, createdAt: null })

const ctx = (over: Partial<ReportContext> = {}): ReportContext => ({
  objective: null, productContext: null, isSimulation: false, simulationPersona: null,
  savedCounterpartStyle: null, deterministicMetrics: {}, qualityFlags: [], ...over,
})
const base = { sessionType: 'human_partner' as const, transcriptVersion: 1 }

const card = {
  observedSignals: 'The doctor mentioned having one minute.', possiblePreference: 'A short summary today.',
  evidenceAndAlternative: 'One statement only.', repResponse: 'The rep gave a one-page summary.',
  mostUsefulAdjustment: 'Give a short summary and offer the approved evidence for later.',
  suggestedWordingNextVisit: 'Would you prefer the main point now and the full study later?',
}

function raw(customer: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    visitSummary: { summary: 'A short visit.', objectiveStatus: 'insufficient_evidence', objectiveStatusReason: '', evidence: [] },
    customerUnderstanding: { needs: [], concerns: [], decisionCriteria: [], openQuestions: [] },
    performance: [], criticalMoments: [], commitments: [],
    coachingPriority: { behavior: 'Ask before pitching', evidence: [{ segmentIndex: 1, speakerRole: 'rep' }], betterPhrase: 'x', practiceExercise: 'x', successLooksLike: 'x' },
    strength: { behavior: 'Stayed brief', evidence: [{ segmentIndex: 1, speakerRole: 'rep' }] },
    socialStyle: { customer, rep: { strongestSignals: [], possibleStyle: null }, adaptation: [], signalChanges: [], ...extra },
  }
}
const sig = (segmentIndex: number, category: string) => ({ category, evidence: { segmentIndex, speakerRole: 'counterpart' } })
const view = (r: ReturnType<typeof raw>, segments: TranscriptSegment[], context: ReportContext) =>
  groundReport(r, segments, context, base)!.socialStyle

const ONE_MINUTE = seg(0, 'counterpart', 'I have one minute, but leave the study.')
const REP = seg(1, 'rep', 'Here is the one-page trial summary.')
const THREE = [ONE_MINUTE, REP, seg(2, 'counterpart', 'Fine, go on.'), seg(3, 'rep', 'The main result is the lower event rate.')]

describe('1. saved analytical tendency, explicit one-minute limit', () => {
  const r = raw({ possibleStyle: 'analytical', strongestSignals: [sig(0, 'time_limit'), sig(0, 'evidence_request')], alternativeExplanation: 'They may only be short of time today.', coachingCard: card },
    { coachingCard: card })
  const s = view(r, THREE, ctx({ savedCounterpartStyle: 'analytical' }))

  it('keeps the saved tendency and shows the need for brevity as an observation, with the real quote', () => {
    expect(s.usualVsToday?.usual).toEqual({ style: 'analytical', source: 'rep_recorded' })
    const cats = s.usualVsToday!.observations.map(o => o.category)
    expect(cats).toEqual(['time_limit', 'evidence_request'])
    for (const o of s.usualVsToday!.observations) expect(o.evidence.quote).toBe(ONE_MINUTE.text)
  })
  it('does not call it a changed trait, and offers an adjustment and a phrase', () => {
    expect(s.usualVsToday!.differsFromUsual).toBe(false)
    expect(s.usualVsToday!.adjustment).toBe(card.mostUsefulAdjustment)
    expect(s.usualVsToday!.examplePhrase).toBe(card.suggestedWordingNextVisit)
    expect(s.customer.savedProfile).toBe('analytical')
  })
  it('a different style reading is shown as a difference from the profile, never as a new trait, and the profile is untouched', () => {
    const frozen = Object.freeze({ ...ctx({ savedCounterpartStyle: 'analytical' }) })
    const d = view(raw({ possibleStyle: 'driver', strongestSignals: [sig(0, 'time_limit')], coachingCard: card }, ), THREE, frozen)
    expect(d.usualVsToday!.differsFromUsual).toBe(true)
    expect(d.usualVsToday!.usual.style).toBe('analytical')
    expect(frozen.savedCounterpartStyle).toBe('analytical')
  })
})

describe('2. saved amiable tendency, short replies with no stated reason', () => {
  const segments = [seg(0, 'rep', 'How is the new patient group going?'), seg(1, 'counterpart', 'Fine.'), seg(2, 'rep', 'Any questions on the dosing?'),
    seg(3, 'counterpart', 'No.'), seg(4, 'rep', 'Shall I leave the leaflet?'), seg(5, 'counterpart', 'OK.')]
  const s = view(raw({ possibleStyle: 'amiable', strongestSignals: [] }), segments, ctx({ savedCounterpartStyle: 'amiable' }))

  it('describes the short replies and keeps the reason open, with no prose from the model', () => {
    expect(s.usualVsToday!.observations.map(o => o.category)).toEqual(['brief_replies'])
    expect(s.usualVsToday!.observations[0].evidence.quote).toBe('Fine.')
    expect(s.usualVsToday!.uncertainty).toBeNull()
    expect(s.usualVsToday!.adjustment).toBeNull()
    expect(s.usualVsToday!.differsFromUsual).toBe(false)
  })
  it('never asserts a feeling', () => {
    expect(mentionsEmotionDiagnosis(JSON.stringify(s.usualVsToday))).toBe(false)
  })
  it('drops model prose that names a feeling or motive, in English and Arabic', () => {
    for (const bad of ['The doctor is angry about the visit.', 'He seems anxious and tired.', 'الطبيب غاضب من الزيارة.']) {
      const d = view(raw({ possibleStyle: 'amiable', strongestSignals: [sig(0, 'time_limit')], alternativeExplanation: bad, coachingCard: { ...card, mostUsefulAdjustment: bad } }, { coachingCard: { ...card, mostUsefulAdjustment: bad } }),
        THREE, ctx({ savedCounterpartStyle: 'amiable' }))
      expect(d.usualVsToday!.uncertainty).toBeNull()
      expect(d.usualVsToday!.adjustment).toBeNull()
      expect(d.usualVsToday!.examplePhrase).toBeNull()
    }
  })
})

describe('3. no saved profile', () => {
  it('shows supported observations and invents no baseline', () => {
    const s = view(raw({ possibleStyle: null, strongestSignals: [sig(0, 'time_limit')], coachingCard: card }, { coachingCard: card }), THREE, ctx())
    expect(s.usualVsToday!.usual).toEqual({ style: null, source: 'none' })
    expect(s.usualVsToday!.observations).toHaveLength(1)
    expect(s.usualVsToday!.differsFromUsual).toBe(false)
  })
})

describe('4. mixed signals in one segment', () => {
  it('extracts each distinct category once, with the exact original wording', () => {
    const found = extractSocialSignals([ONE_MINUTE], 'counterpart')
    expect(found.map(f => f.category).sort()).toEqual(['evidence_request', 'time_limit'])
    for (const f of found) expect(f.text).toBe(ONE_MINUTE.text)
  })
  it('never counts a category twice for the same line, and keeps rep lines separate', () => {
    const lines = [seg(0, 'counterpart', 'Quickly, just tell me the bottom line.'), seg(1, 'rep', 'I have one minute of data.')]
    expect(extractSocialSignals(lines, 'counterpart').filter(f => f.category === 'directness')).toHaveLength(1)
    expect(extractSocialSignals(lines, 'counterpart').every(f => f.evidence.speakerRole === 'counterpart')).toBe(true)
  })
  it('the view shows a repeated (line, category) once', () => {
    const s = view(raw({ possibleStyle: null, strongestSignals: [sig(0, 'time_limit'), sig(0, 'time_limit'), sig(0, 'evidence_request')] }), THREE, ctx())
    expect(s.usualVsToday!.observations.map(o => o.category)).toEqual(['time_limit', 'evidence_request'])
  })
  it('understands Iraqi Arabic time limits and evidence requests, and stays quiet on ordinary clinical talk', () => {
    expect(extractSocialSignals([seg(0, 'counterpart', 'عندي دقيقة بس، اختصر لي')], 'counterpart').map(f => f.category)).toContain('time_limit')
    expect(extractSocialSignals([seg(0, 'counterpart', 'شنو الدراسة اللي تدعم هذا؟')], 'counterpart').map(f => f.category)).toContain('evidence_request')
    expect(extractSocialSignals([seg(0, 'counterpart', 'What is the dose for a child?')], 'counterpart')).toEqual([])
  })
})

describe('5. invalid or wrong-speaker evidence', () => {
  it('rejects a rep line, a missing line and an unsupported category as proof about the doctor', () => {
    const s = view(raw({ possibleStyle: 'analytical', strongestSignals: [
      { category: 'detail_request', evidence: { segmentIndex: 1, speakerRole: 'counterpart' } },
      sig(99, 'time_limit'),
      sig(0, 'relationship_language'),
    ], coachingCard: card }, { coachingCard: card }), THREE, ctx({ savedCounterpartStyle: 'driver' }))
    expect(s.customer.strongestSignals.map(x => x.evidence.segmentIndex)).toEqual([0]) // only the real counterpart line survives
    expect(s.usualVsToday!.observations).toEqual([]) // its category was never found in that line
    expect(s.usualVsToday!.adjustment).toBeNull()
    expect(s.usualVsToday!.differsFromUsual).toBe(false)
  })
  it('does not accept the doctor lines as evidence about the rep either', () => {
    const r = raw({ possibleStyle: null, strongestSignals: [] }, {})
    ;(r.socialStyle as Record<string, unknown>).rep = { possibleStyle: 'driver', strongestSignals: [sig(0, 'time_limit')] }
    expect(view(r, THREE, ctx()).rep.strongestSignals).toEqual([])
  })
})

describe('6. unsupported model style claim', () => {
  it('shows no profile difference, because the claim kept no evidence', () => {
    const s = view(raw({ possibleStyle: 'driver', strongestSignals: [] }), THREE, ctx({ savedCounterpartStyle: 'analytical' }))
    expect(s.customer.possibleStyle).toBeNull()
    expect(s.customer.profileDrift).toBe(false)
    expect(s.usualVsToday!.differsFromUsual).toBe(false)
  })
  it('a claim that kept real evidence is compared, from the final reading', () => {
    const s = view(raw({ possibleStyle: 'driver', strongestSignals: [sig(0, 'time_limit')] }), THREE, ctx({ savedCounterpartStyle: 'analytical' }))
    expect(s.customer.profileDrift).toBe(true)
  })
})

describe('7. simulation', () => {
  const sim = ctx({ isSimulation: true, savedCounterpartStyle: 'amiable', simulationPersona: { style: 'driver', hiddenConcern: 'worried about cost' } })
  const s = view(raw({ possibleStyle: 'amiable', strongestSignals: [sig(0, 'time_limit')], coachingCard: card }, { coachingCard: card }), THREE, sim)
  it('labels the tendency as configured and never compares it with a saved profile', () => {
    expect(s.usualVsToday!.usual).toEqual({ style: 'driver', source: 'practice_setting' })
    expect(s.usualVsToday!.differsFromUsual).toBe(false)
    expect(s.customer.isSimulationSetting).toBe(true)
    expect(s.customer.savedProfile).toBeNull()
  })
  it('does not expose the hidden concern or any simulated state value', () => {
    expect(JSON.stringify(s.usualVsToday)).not.toMatch(/worried about cost|hidden|trust|score|confidence/i)
  })
})

describe('8. sparse transcript', () => {
  it('gives a limited reading from one statement', () => {
    const s = view(raw({ possibleStyle: null, strongestSignals: [sig(0, 'time_limit')] }), [ONE_MINUTE, REP], ctx({ qualityFlags: ['short_session'] }))
    expect(s.usualVsToday!.limited).toBe(true)
    expect(s.usualVsToday!.observations).toHaveLength(1)
  })
  it('says there is nothing to describe when there is no counterpart evidence', () => {
    const s = view(raw({ possibleStyle: null, strongestSignals: [] }), [REP, seg(2, 'counterpart', 'Mm.')], ctx())
    expect(s.usualVsToday!.observations).toEqual([])
    expect(s.usualVsToday!.limited).toBe(true)
  })
})

describe('every case', () => {
  it('invents no counts, scores or percentages in the view', () => {
    const s = view(raw({ possibleStyle: 'analytical', strongestSignals: [sig(0, 'time_limit')], coachingCard: card }, { coachingCard: card }), THREE, ctx({ savedCounterpartStyle: 'analytical' }))
    const json = JSON.stringify(s.usualVsToday)
    expect(json).not.toMatch(/%|confidence|probab|score|visitCount|observedCount/i)
    const styles: SocialStyle[] = ['driver', 'expressive', 'amiable', 'analytical']
    expect(styles).toContain(s.usualVsToday!.usual.style)
  })
})

describe('the report prompt', () => {
  it('asks for observation, not feeling, offers the time category, and is never told the saved profile', () => {
    const context = ctx({ savedCounterpartStyle: 'analytical' })
    const { prompt } = buildReportPrompt(THREE, context, extractSocialSignals(THREE, 'counterpart'), [], 'style', 'en')
    expect(prompt).toContain('time_limit')
    expect(prompt).toContain('Never name a feeling, motive, honesty or personality')
    expect(prompt).toContain('not proof of a personality')
    expect(prompt).not.toMatch(/saved profile|savedCounterpartStyle/i)
  })
})

describe('a colleague playing one of the rep saved doctors', () => {
  const colleague = ctx({ configuredPracticeStyle: 'analytical' })
  const s = view(raw({ possibleStyle: 'driver', strongestSignals: [sig(0, 'time_limit')], coachingCard: card }, { coachingCard: card }), THREE, colleague)
  it('is a practice setting, not a saved profile of the colleague', () => {
    expect(s.usualVsToday!.usual).toEqual({ style: 'analytical', source: 'practice_setting' })
    expect(s.customer.savedProfile).toBeNull()
  })
  it('is not compared with the conversation as if it were a trait', () => {
    expect(s.usualVsToday!.differsFromUsual).toBe(false)
    expect(s.customer.profileDrift).toBe(false)
  })
  it('with no saved doctor chosen, shows no usual pattern at all', () => {
    const none = view(raw({ possibleStyle: 'driver', strongestSignals: [sig(0, 'time_limit')] }), THREE, ctx())
    expect(none.usualVsToday!.usual).toEqual({ style: null, source: 'none' })
  })
})

describe('6. asking for evidence is not a style', () => {
  it('drops a style claim whose only support is an evidence request', () => {
    const lines = [seg(0, 'counterpart', 'Do you have a study on this?'), REP]
    const s = view(raw({ possibleStyle: 'analytical', strongestSignals: [sig(0, 'evidence_request')] }), lines, ctx())
    expect(s.customer.possibleStyle).toBeNull()
  })
  it('keeps a style claim that also has a non-evidence signal', () => {
    const s = view(raw({ possibleStyle: 'analytical', strongestSignals: [sig(0, 'time_limit'), sig(0, 'evidence_request')] }), THREE, ctx())
    expect(s.customer.possibleStyle).toBe('analytical')
  })
})
