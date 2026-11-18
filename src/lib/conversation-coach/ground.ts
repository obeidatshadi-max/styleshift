import type { TranscriptSegment } from '@/schemas/conversationReport'
import { stripSegmentRefs } from '@/lib/report/groundReport'
import { normalizeForMatch } from '@/lib/arabic-normalize'
import { computeInteraction, deliveryMeasures, segmentRef, type StoredDelivery } from './interaction'
import { computeLanguagePatterns } from './language'
import { assessRecordingQuality } from './quality'
import {
  isAddressed, isCoachDomain, isConfidenceLabel, isCueType, STAGES, CONFIDENCE_LABELS,
  type CoachingFinding, type ConfidenceLabel, type ConversationCoach, type KeyMoment, type OpportunityKey,
  type OpportunityMeasure, type SegmentRef, type Stage, type TranscriptQuality,
} from './types'

export const MAX_KEY_MOMENTS = 3
/** A rep reply further than this many segments after the cue is not "the reply" to it. */
export const MAX_REPLY_GAP = 4
/** Uncertain transcript words or unreliable speaker labels cap a finding's confidence here. */
const CAPPED_CONFIDENCE: ConfidenceLabel = 'low'

export interface CoachContext {
  lang: 'en' | 'ar'
  partialRecording: boolean
  transcriptQuality: TranscriptQuality | null
  delivery: StoredDelivery | null
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const text = (v: unknown): string | null => {
  const s = typeof v === 'string' ? stripSegmentRefs(v).trim() : ''
  return s.length ? s : null
}

/** Resolves a model reference to a real segment. The quote and times always come from the stored segment. */
function resolver(segments: readonly TranscriptSegment[], durationSec: number | null) {
  const byIndex = new Map(segments.map(s => [s.segmentIndex, s]))
  return (raw: unknown, role?: 'rep' | 'counterpart'): SegmentRef | null => {
    const idx = obj(raw).segmentIndex
    if (typeof idx !== 'number') return null
    const seg = byIndex.get(idx)
    if (!seg || normalizeForMatch(seg.text).length < 3) return null
    if (role && seg.speakerRole !== role) return null
    const ref = segmentRef(seg)
    // Times outside the recording, or reversed, are dropped rather than shown.
    const bad = ref.startSec === null || ref.endSec === null || ref.startSec < 0 || ref.endSec < ref.startSec ||
      (durationSec !== null && ref.endSec > durationSec + 0.5)
    return bad ? { ...ref, startSec: null, endSec: null } : ref
  }
}

const DEFINITIONS: Record<OpportunityKey, { en: string; ar: string }> = {
  concerns_clarified: {
    en: 'Doctor concerns where you asked a clarifying question before answering, out of the concerns you replied to.',
    ar: 'مخاوف الطبيب التي سألت عنها سؤال توضيح قبل أن تجيب، من بين المخاوف التي رددت عليها.',
  },
  follow_up_questions: {
    en: 'Your questions that reused the doctor\'s own words from their previous turn, out of all your questions.',
    ar: 'أسئلتك التي استخدمت كلمات الطبيب من كلامه السابق، من بين كل أسئلتك.',
  },
  listening_summaries: {
    en: 'Times you summarised or repeated back what the doctor said. A count, with no target number.',
    ar: 'عدد المرات التي لخّصت فيها أو أعدت ما قاله الطبيب. هذا عدد فقط، بدون رقم مستهدف.',
  },
  next_step_agreed: {
    en: 'Whether both of you clearly agreed a concrete next step in the recording.',
    ar: 'هل اتفقتما بوضوح على خطوة تالية محددة في التسجيل.',
  },
}

const CAP_REASON = {
  uncertain: { en: 'Some quoted words were marked uncertain by the transcription service.', ar: 'بعض الكلمات المقتبسة وُسمت بأنها غير مؤكدة في التفريغ.' },
  speakers: { en: 'Speaker labels may be unreliable in this recording.', ar: 'قد تكون تسمية المتحدثين غير دقيقة في هذا التسجيل.' },
  partial: { en: 'Only part of the visit was recorded.', ar: 'سُجّل جزء من الزيارة فقط.' },
}

function lowerConfidence(a: ConfidenceLabel, b: ConfidenceLabel): ConfidenceLabel {
  return CONFIDENCE_LABELS.indexOf(a) >= CONFIDENCE_LABELS.indexOf(b) ? a : b
}

/** Builds the full Conversation Coach section. `raw` is the model's JSON or null; deterministic parts always run. */
export function groundCoach(raw: unknown, segments: readonly TranscriptSegment[], ctx: CoachContext): ConversationCoach {
  const r = obj(raw)
  const say = (k: { en: string; ar: string }) => k[ctx.lang]
  const interaction = computeInteraction(segments)
  const quality = assessRecordingQuality(segments, ctx.transcriptQuality, {
    partialRecording: ctx.partialRecording, lang: ctx.lang, turnCount: segments.length,
  })
  const ref = resolver(segments, quality.durationSec)
  const uncertainSegs = new Set(quality.uncertainWords.map(w => w.segmentIndex))

  // ── Key moments: doctor cue -> rep reply ──
  const keyMoments: KeyMoment[] = []
  const momentIdByModelIndex = new Map<number, string>()
  arr(r.keyMoments).forEach((item, modelIndex) => {
    if (keyMoments.length >= MAX_KEY_MOMENTS) return
    const m = obj(item)
    const cue = ref(m.cue, 'counterpart')
    if (!cue || keyMoments.some(k => k.cue.segmentIndex === cue.segmentIndex)) return
    let response: SegmentRef | null = null
    if (m.response !== null && m.response !== undefined) {
      response = ref(m.response, 'rep')
      // A reply that is not the rep's, comes before the cue, or is far away means the model mis-paired: drop it.
      if (!response || response.segmentIndex <= cue.segmentIndex || response.segmentIndex - cue.segmentIndex > MAX_REPLY_GAP) return
    }
    const observation = text(m.observation)
    if (!observation) return
    const next = response
      ? segments.find(s => s.segmentIndex > response!.segmentIndex && s.speakerRole === 'counterpart') ?? null
      : null

    const limitations: string[] = []
    let confidence: ConfidenceLabel = isConfidenceLabel(m.confidence) ? m.confidence : 'low'
    let reason = text(m.confidenceReason) ?? ''
    if (uncertainSegs.has(cue.segmentIndex) || (response && uncertainSegs.has(response.segmentIndex))) {
      confidence = lowerConfidence(confidence, CAPPED_CONFIDENCE); limitations.push(say(CAP_REASON.uncertain))
    }
    if (quality.speakerAttributionLimited) {
      confidence = lowerConfidence(confidence, CAPPED_CONFIDENCE); limitations.push(say(CAP_REASON.speakers))
    }
    if (ctx.partialRecording) limitations.push(say(CAP_REASON.partial))
    if (limitations.length && !reason) reason = limitations[0]

    const interpretation = text(m.interpretation)
    const id = `m${keyMoments.length + 1}`
    const finding: CoachingFinding = {
      id,
      domain: isCoachDomain(m.domain) ? m.domain : 'pharma_skills',
      speaker: response ? 'both' : 'counterpart',
      start_time: cue.startSec,
      end_time: (response ?? cue).endSec,
      evidence_quote: cue.quote,
      evidence_type: interpretation ? 'interpretation' : 'observed_content',
      observation,
      interpretation,
      alternative_explanation: interpretation ? text(m.alternativeExplanation) : null,
      confidence_label: confidence,
      confidence_reason: reason,
      suggested_response: text(m.suggestedResponse),
      practice_task: text(m.practiceTask),
      success_criterion: text(m.successCriterion),
      limitations,
    }
    keyMoments.push({
      id, cueType: isCueType(m.cueType) ? m.cueType : 'other', cue, response,
      addressed: response ? (isAddressed(m.addressed) ? m.addressed : 'unclear') : 'not_addressed',
      whatHappenedNext: next ? segmentRef(next) : null, finding,
    })
    momentIdByModelIndex.set(modelIndex, id)
  })

  // ── Structure: a stage counts as observed only with real evidence ──
  const modelStages = new Map(arr(r.stages).map(s => [obj(s).stage, obj(s)]))
  const stages = STAGES.map((stage: Stage) => {
    const s = modelStages.get(stage) ?? {}
    const evidence = arr(s.evidence).map(e => ref(e)).filter((e): e is SegmentRef => e !== null).slice(0, 2)
    return { stage, observed: s.observed === true && evidence.length > 0, evidence }
  })

  // ── Snapshot ──
  const doctorPriorities = arr(r.doctorPriorities).map(p => {
    const o = obj(p); const t = text(o.text); const e = ref(o.evidence, 'counterpart')
    return t && e ? { text: t, evidence: e } : null
  }).filter((p): p is NonNullable<typeof p> => p !== null).slice(0, 3)
  const ns = obj(r.nextStep)
  const nsEvidence = arr(ns.evidence).map(e => ref(e)).filter((e): e is SegmentRef => e !== null).slice(0, 2)
  const nextStep = { agreed: ns.agreed === true && nsEvidence.length > 0, text: text(ns.text), evidence: nsEvidence }

  // ── Opportunity measures ──
  const concerns = arr(r.concerns).map(c => ({ cue: ref(obj(c).cue, 'counterpart'), clarified: obj(c).clarifiedBeforeAnswering }))
    .filter(c => c.cue !== null)
  const uniqueConcerns = [...new Map(concerns.map(c => [c.cue!.segmentIndex, c])).values()]
  const replied = uniqueConcerns.filter(c => typeof c.clarified === 'boolean')
  const summaries = [...new Set(arr(r.listeningSummaries).map(e => ref(e, 'rep')?.segmentIndex).filter((i): i is number => typeof i === 'number'))]
  const doctorTurns = segments.filter(s => s.speakerRole === 'counterpart').length
  const measure = (key: OpportunityKey, numerator: number, denominator: number | null, na: boolean): OpportunityMeasure =>
    ({ key, numerator, denominator, notApplicable: na, definition: DEFINITIONS[key][ctx.lang] })
  const opportunities: OpportunityMeasure[] = [
    measure('concerns_clarified', replied.filter(c => c.clarified === true).length, replied.length, replied.length === 0),
    measure('follow_up_questions', interaction.repQuestions.followUp, interaction.repQuestions.total, interaction.repQuestions.total === 0),
    measure('listening_summaries', summaries.length, null, doctorTurns === 0),
    // No agreed step in a partial recording may simply mean the close was not recorded.
    measure('next_step_agreed', nextStep.agreed ? 1 : 0, 1, ctx.partialRecording && !nextStep.agreed),
  ]

  // ── Evidence claims: listed, never judged ──
  const claimIdx = [...new Set(arr(r.evidenceClaims).map(e => ref(e, 'rep')?.segmentIndex).filter((i): i is number => typeof i === 'number'))]
  const evidenceClaims = claimIdx.slice(0, 5).map(i => ({ segment: segmentRef(segments.find(s => s.segmentIndex === i)!), accuracy: 'not_verified' as const }))

  // ── One coaching priority ──
  const p = obj(r.priority)
  const behavior = text(p.behavior), criterion = text(p.successCriterion)
  const priority = behavior && criterion ? {
    behavior, whyItMatters: text(p.whyItMatters) ?? '', successCriterion: criterion,
    momentId: typeof p.momentIndex === 'number' ? momentIdByModelIndex.get(p.momentIndex) ?? null : null,
  } : null

  return {
    version: 1,
    synthetic: false,
    quality,
    snapshot: { mainTopic: text(r.mainTopic), doctorPriorities, repApproach: text(r.repApproach), nextStep },
    keyMoments,
    structure: { partialRecording: ctx.partialRecording, stages },
    interaction,
    delivery: deliveryMeasures(ctx.delivery, ctx.lang),
    language: computeLanguagePatterns(segments),
    opportunities,
    evidenceClaims,
    priority,
    insufficientEvidence: raw === null || (keyMoments.length === 0 && !priority && doctorPriorities.length === 0),
  }
}
