import type {
  ReportContext, SocialStyle, SocialStyleRead, SocialStyleSignal, TodayObservation, TranscriptSegment, UsualVsToday, UsualPatternSource,
} from '@/schemas/conversationReport'
import { extractSocialSignals } from '@/lib/report/socialSignals'

/**
 * Words that name a feeling, a motive or a judgement of the person. A transcript line cannot establish
 * these, so prose that uses them is dropped from this view rather than shown. The list is deliberately
 * short and literal: it is a safety net behind the prompt rules, not a detector, and it will miss
 * phrasings it does not list (Arabic list covers common Iraqi and standard forms).
 */
const EMOTION_DIAGNOSIS = new RegExp(
  String.raw`\b(anxious|anxiety|angry|anger|upset|annoyed|irritated|frustrated|stressed|nervous|tired|fatigued|exhausted|bored|dishonest|lying|lied|hostile|afraid|fearful|insecure|arrogant|rejecting|rejected you|dislikes you|does not like you|doesn't like you)\b|غاضب|زعلان|منزعج|متضايق|متوتر|قلق|خايف|خائف|تعبان|مرهق|ملل|كاذب|يكذب|متكبر|يرفضك|ما يحبك|لا يحبك`,
  'i',
)

export function mentionsEmotionDiagnosis(text: string): boolean {
  return EMOTION_DIAGNOSIS.test(text.normalize('NFKC'))
}

function safeProse(text: string | null | undefined): string | null {
  const t = (text ?? '').trim()
  return t.length > 0 && !mentionsEmotionDiagnosis(t) ? t : null
}

/** A counterpart conversation shorter than this is shown as a limited reading. */
const MIN_COUNTERPART_TURNS = 3
/** A reply of this many words or fewer counts as short. */
const SHORT_REPLY_WORDS = 3

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

/** The first of at least two short counterpart replies, when short replies are at least half of their turns. Null otherwise. */
function briefRepliesEvidence(segments: TranscriptSegment[]): TranscriptSegment | null {
  const turns = segments.filter(s => s.speakerRole === 'counterpart')
  if (turns.length < MIN_COUNTERPART_TURNS) return null
  const short = turns.filter(s => wordCount(s.text) <= SHORT_REPLY_WORDS)
  return short.length >= 2 && short.length * 2 >= turns.length ? short[0] : null
}

interface Inputs {
  customer: SocialStyleRead
  context: ReportContext
  segments: TranscriptSegment[]
  coachingCard: { mostUsefulAdjustment: string; suggestedWordingNextVisit: string } | null
}

/**
 * Builds "Usual pattern / This conversation / Helpful adjustment" from things the app can vouch for.
 *
 * - usual: the rep's own saved profile (never model text), or the simulation's configured setting, or none.
 * - observations: counterpart lines the transcript confirms, whose category the deterministic extractor
 *   also found in that same line. The model picks among detected signals; it cannot add one.
 * - differsFromUsual: from the final grounded reading, so a rejected style claim cannot raise it. It is
 *   not read as a changed trait: the report says so.
 * - uncertainty and adjustment: the model's prose, kept only when it has at least one confirmed
 *   observation behind it and names no feeling or motive.
 */
export function buildUsualVsToday({ customer, context, segments, coachingCard }: Inputs): UsualVsToday {
  const sim = context.isSimulation
  const usualStyle: SocialStyle | null = sim ? context.simulationPersona?.style ?? null : context.savedCounterpartStyle
  const source: UsualPatternSource = usualStyle === null ? 'none' : sim ? 'practice_setting' : 'rep_recorded'

  const detected = extractSocialSignals(segments, 'counterpart')
  const confirmed = (sig: SocialStyleSignal) =>
    sig.evidence.speakerRole === 'counterpart'
    && detected.some(d => d.evidence.segmentIndex === sig.evidence.segmentIndex && d.category === sig.category)
  const seen = new Set<string>()
  const signalObservations: TodayObservation[] = customer.strongestSignals.filter(confirmed).filter(sig => {
    const key = `${sig.evidence.segmentIndex}|${sig.category}`
    if (seen.has(key)) return false
    seen.add(key); return true
  }).slice(0, 2).map(sig => ({ category: sig.category, evidence: sig.evidence }))
  const brief = briefRepliesEvidence(segments)
  const observations: TodayObservation[] = [
    ...signalObservations,
    ...(brief && signalObservations.length < 2
      ? [{ category: 'brief_replies' as const, evidence: { segmentIndex: brief.segmentIndex, speakerRole: brief.speakerRole, quote: brief.text } }]
      : []),
  ]

  const counterpartTurns = segments.filter(s => s.speakerRole === 'counterpart').length
  // Prose and the profile comparison rest on wording signals only: reply length alone supports neither.
  const hasEvidence = signalObservations.length > 0

  return {
    usual: { style: usualStyle, source },
    observations,
    differsFromUsual: !sim && usualStyle !== null && hasEvidence && customer.possibleStyle !== null && customer.possibleStyle !== usualStyle,
    limited: context.qualityFlags.includes('short_session') || counterpartTurns < MIN_COUNTERPART_TURNS,
    uncertainty: hasEvidence ? safeProse(customer.alternativeExplanation ?? customer.mixedEvidenceNote) : null,
    adjustment: hasEvidence ? safeProse(coachingCard?.mostUsefulAdjustment) : null,
    examplePhrase: hasEvidence && safeProse(coachingCard?.mostUsefulAdjustment) ? safeProse(coachingCard?.suggestedWordingNextVisit) : null,
  }
}
