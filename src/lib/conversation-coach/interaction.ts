import { normalizeForMatch } from '@/lib/arabic-normalize'
import type { TranscriptSegment } from '@/schemas/conversationReport'
import type { DeliveryMeasure, InteractionMeasures, SegmentRef, SpeakerTiming } from './types'

const sec = (ms: number) => Math.round(ms / 100) / 10

export function segmentRef(s: TranscriptSegment): SegmentRef {
  return {
    segmentIndex: s.segmentIndex, speakerRole: s.speakerRole, quote: s.text,
    startSec: typeof s.startMs === 'number' ? sec(s.startMs) : null,
    endSec: typeof s.endMs === 'number' ? sec(s.endMs) : null,
  }
}

// Question shape from wording only. "Leading" = the question already contains the answer the rep wants.
const LEADING = [
  "don't you think", "wouldn't you agree", "isn't it", "right?", "surely", "you would agree", "don't you agree", "wouldn't you say",
  'مو صح', 'مو هيچ', 'مو هيك', 'صح لو لا', 'الا توافق', 'الا تعتقد', 'اكيد توافق', 'اليس كذلك', 'مو احسن',
]
const OPEN_START = [
  'what', 'how', 'why', 'which', 'tell me', 'describe', 'walk me', 'in what way', 'when do', 'where do',
  'شنو', 'شلون', 'ليش', 'اشلون', 'كيف', 'ماذا', 'ما هو', 'ما هي', 'لماذا', 'وين', 'منو', 'احجيلي', 'احكيلي', 'شنهي', 'شكد',
]
const QUESTION_WORDS_ANYWHERE = [' do you ', ' did you ', ' is it ', ' are you ', ' can you ', ' could you ', ' would you ', ' have you ', ' هل ', ' تكدر ', ' تقدر ']

export function isQuestion(text: string): boolean {
  if (/[?؟]/.test(text)) return true
  const t = ` ${normalizeForMatch(text)} `
  return OPEN_START.some(w => t.startsWith(` ${normalizeForMatch(w)} `)) || QUESTION_WORDS_ANYWHERE.some(w => t.includes(` ${normalizeForMatch(w)} `))
}

export function questionShape(text: string): 'open' | 'closed' | 'leading' {
  const t = ` ${normalizeForMatch(text)} `
  const raw = text.toLowerCase()
  if (LEADING.some(p => raw.includes(p) || t.includes(` ${normalizeForMatch(p)} `))) return 'leading'
  // An open question usually starts with a wh-word, possibly after a short lead-in ("doctor, what ...").
  const firstWords = t.trim().split(' ').slice(0, 4).join(' ')
  if (OPEN_START.some(w => ` ${firstWords} `.includes(` ${normalizeForMatch(w)} `))) return 'open'
  return 'closed'
}

// Words too common in any rep-doctor talk to show the rep picked up the doctor's point.
const COMMON = new Set(['doctor', 'patient', 'patients', 'about', 'there', 'which', 'would', 'their', 'these', 'those', 'think', 'really',
  'دكتور', 'المرضى', 'مرضى', 'المريض', 'مريض', 'هذا', 'هاي', 'اللي', 'الذي'])
function contentWords(text: string): Set<string> {
  return new Set(normalizeForMatch(text).split(' ').filter(w => w.length >= 5 && !COMMON.has(w)))
}

/** A rep question that reuses a content word (5+ letters, not a common word) from the doctor's previous turn. */
export function isFollowUp(question: string, previousCounterpart: string | null): boolean {
  if (!previousCounterpart) return false
  const prev = contentWords(previousCounterpart)
  for (const w of contentWords(question)) if (prev.has(w)) return true
  return false
}

/** Overlap: a different speaker starts more than this many ms before the previous segment ended. */
export const OVERLAP_MIN_MS = 300

/**
 * Talk share, longest turn, turn changes, overlaps and question shapes. Pure arithmetic on the stored
 * segments. When segments carry no times, the timing values are marked unavailable instead of guessed.
 */
export function computeInteraction(segments: readonly TranscriptSegment[]): InteractionMeasures {
  const timed = segments.every(s => typeof s.startMs === 'number' && typeof s.endMs === 'number')
  const speakers: SpeakerTiming[] = (['rep', 'counterpart'] as const).map(role => {
    const mine = segments.filter(s => s.speakerRole === role)
    let talk = 0, longest = 0, longestSeg: number | null = null
    for (const s of mine) {
      const d = timed ? Math.max(0, (s.endMs as number) - (s.startMs as number)) : 0
      talk += d
      if (d > longest) { longest = d; longestSeg = s.segmentIndex }
    }
    return { role, talkSec: sec(talk), share: 0, turns: mine.length, longestTurnSec: sec(longest), longestTurnSegment: timed ? longestSeg : null }
  })
  const total = speakers.reduce((a, s) => a + s.talkSec, 0)
  for (const s of speakers) s.share = total > 0 ? Math.round((s.talkSec / total) * 100) / 100 : 0

  let changes = 0, overlaps = 0
  for (let i = 1; i < segments.length; i++) {
    const a = segments[i - 1], b = segments[i]
    if (a.speakerRole === b.speakerRole) continue
    changes++
    if (timed && (a.endMs as number) - (b.startMs as number) > OVERLAP_MIN_MS) overlaps++
  }

  const q = { total: 0, open: 0, closed: 0, leading: 0, followUp: 0 }
  let lastCounterpart: string | null = null
  for (const s of segments) {
    if (s.speakerRole === 'counterpart') { lastCounterpart = s.text; continue }
    // A turn may hold several sentences; count each question sentence.
    for (const sentence of s.text.split(/(?<=[?؟.!])\s+/)) {
      if (!isQuestion(sentence)) continue
      q.total++
      q[questionShape(sentence)]++
      if (isFollowUp(sentence, lastCounterpart)) q.followUp++
    }
  }

  const durationMs = timed && segments.length ? Math.max(...segments.map(s => s.endMs as number)) : null
  return {
    available: timed && segments.length > 0,
    durationSec: durationMs === null ? null : sec(durationMs),
    speakers: timed ? speakers : speakers.map(s => ({ ...s, talkSec: 0, share: 0, longestTurnSec: 0 })),
    speakerChanges: changes,
    overlaps: timed ? overlaps : null,
    repQuestions: q,
  }
}

/** Stored delivery numbers from the device-side capture (roleplay_sessions.rep_metrics). Rep only. */
export interface StoredDelivery { wpm?: unknown; pitchRange?: unknown; totalHesitations?: unknown }

const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * Delivery measures for the rep, only where the app actually measured them. Pitch comes from the phone
 * microphone during the rep's speaking windows (both voices share one microphone). Loudness is never
 * compared between speakers and is reported unavailable.
 */
export function deliveryMeasures(stored: StoredDelivery | null, lang: 'en' | 'ar'): DeliveryMeasure[] {
  const ar = lang === 'ar'
  const wpm = numOrNull(stored?.wpm)
  const pitch = numOrNull(stored?.pitchRange)
  const hes = numOrNull(stored?.totalHesitations)
  return [
    {
      key: 'speaking_rate', available: wpm !== null && wpm > 0, value: wpm, unit: ar ? 'كلمة/دقيقة' : 'words/min',
      method: ar ? 'عدد كلماتك في النص مقسومًا على وقت كلامك. سرعة الكلام وحدها لا تدل على الثقة أو التوتر.'
        : 'Your transcript words divided by your speaking time. Speed alone does not show confidence or nerves.',
    },
    {
      key: 'pauses_and_fillers', available: hes !== null, value: hes, unit: ar ? 'مرة' : 'count',
      method: ar ? 'كلمات حشو مثل "يعني" و"um" مع فترات صمت داخل كلامك، من التسجيل على الجهاز.'
        : 'Filler words such as "um" or "يعني", plus silent gaps inside your turns, from the on-device recording.',
    },
    {
      key: 'pitch_range', available: pitch !== null && pitch > 0, value: pitch, unit: 'Hz',
      method: ar ? 'الفرق بين أعلى وأخفض نبرة التُقطت أثناء كلامك من ميكروفون الهاتف. الصوتان على نفس الميكروفون، فقد يدخل صوت الطرف الآخر عند التداخل. لا يدل على مشاعر.'
        : 'Highest minus lowest pitch picked up by the phone microphone while you held the floor. Both voices share the microphone, so the other voice can leak in during overlap. Not a sign of emotion.',
    },
    {
      key: 'intensity', available: false, value: null, unit: '',
      method: ar ? 'غير مُقاس. علو الصوت يعتمد على المسافة من الميكروفون، لذلك لا نقارنه بين المتحدثين.'
        : 'Not measured. Loudness depends on distance from the microphone, so it is never compared between speakers.',
    },
  ]
}
