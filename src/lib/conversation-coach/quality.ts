import { normalizeForMatch } from '@/lib/arabic-normalize'
import type { TranscriptSegment } from '@/schemas/conversationReport'
import type { RecordingQuality, TranscriptQuality, UncertainWord } from './types'

/** Words the provider scored below this are listed for the rep to check. A display threshold, not a validated cut-off. */
export const LOW_CONFIDENCE_THRESHOLD = 0.6
/** At most this many uncertain words are stored; numbers and terms are kept first. */
export const MAX_UNCERTAIN_WORDS = 30
/** The use case this feature is designed for. Outside it the analysis still runs, with a note. */
export const TARGET_MIN_SEC = 120
export const TARGET_MAX_SEC = 240
/** Below this the recording is too short to say much about a conversation. */
export const VERY_SHORT_SEC = 45
/** One speaker holding more than this share of talk time suggests the voices were not separated well. */
export const DOMINANT_SHARE = 0.9

export interface ProviderWord { text: string; start?: number; end?: number; confidence?: number }
export interface ProviderUtterance { text: string; start: number; end: number; words?: ProviderWord[] }

const NUMBER_WORDS = /^(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million|percent|mg|mcg|ml|واحد|اثنين|ثلاث|ثلاثة|اربع|اربعة|خمس|خمسة|ست|ستة|سبع|سبعة|ثمان|ثمانية|تسع|تسعة|عشر|عشرة|مية|مئة|الف|مليغرام|ملغ)$/i

/** A digit, a dose unit or a number word: the words a wrong transcription would hurt most. */
export function wordKind(word: string): UncertainWord['kind'] {
  const w = normalizeForMatch(word)
  if (/\d/.test(w) || NUMBER_WORDS.test(w)) return 'number'
  // A Latin-script word of 5+ letters inside speech is often a drug, study or medical term.
  if (/^[a-z][a-z-]{4,}$/i.test(w)) return 'term'
  return 'word'
}

const KIND_ORDER: Record<UncertainWord['kind'], number> = { number: 0, term: 1, word: 2 }

/**
 * Summarises the provider's own word confidence for one transcript. Segment index = utterance index
 * (transcript-segments.ts). When the provider sends no confidence at all, nothing is invented: the
 * list is empty and wordsWithConfidence is 0, which the report shows as "not reported".
 */
export function buildTranscriptQuality(
  utterances: readonly ProviderUtterance[],
  meta: { languageCode: string | null; audioDurationSec: number | null },
): TranscriptQuality {
  let wordCount = 0
  let withConf = 0
  let sum = 0
  const low: UncertainWord[] = []
  utterances.forEach((u, segmentIndex) => {
    for (const w of u.words ?? []) {
      wordCount++
      if (typeof w.confidence !== 'number' || !Number.isFinite(w.confidence)) continue
      withConf++
      sum += w.confidence
      if (w.confidence < LOW_CONFIDENCE_THRESHOLD && w.text.trim()) {
        low.push({
          segmentIndex, word: w.text.trim(), confidence: Math.round(w.confidence * 100) / 100,
          kind: wordKind(w.text), startSec: typeof w.start === 'number' ? Math.round(w.start / 100) / 10 : null,
        })
      }
    }
  })
  low.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.confidence - b.confidence)
  return {
    provider: 'assemblyai',
    languageCode: meta.languageCode,
    audioDurationSec: meta.audioDurationSec,
    wordCount,
    wordsWithConfidence: withConf,
    meanConfidence: withConf > 0 ? Math.round((sum / withConf) * 100) / 100 : null,
    lowConfidenceThreshold: LOW_CONFIDENCE_THRESHOLD,
    lowConfidenceWords: low.slice(0, MAX_UNCERTAIN_WORDS).sort((a, b) => a.segmentIndex - b.segmentIndex),
    transcriptVersion: 1,
  }
}

export function isTranscriptQuality(v: unknown): v is TranscriptQuality {
  if (!v || typeof v !== 'object') return false
  const q = v as Record<string, unknown>
  return q.provider === 'assemblyai' && Array.isArray(q.lowConfidenceWords) && typeof q.wordsWithConfidence === 'number'
}

/** Recording length from the segments' own times (ms), or null when no times exist. */
export function durationFromSegments(segments: readonly TranscriptSegment[]): number | null {
  const ends = segments.map(s => s.endMs).filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  return ends.length ? Math.round(Math.max(...ends) / 100) / 10 : null
}

type Lang = 'en' | 'ar'
const NOTES: Record<string, Record<Lang, string>> = {
  veryShort: {
    en: 'This recording is under 45 seconds. Very little can be judged from it.',
    ar: 'هذا التسجيل أقل من 45 ثانية. لا يمكن الحكم إلا على القليل منه.',
  },
  short: {
    en: 'This recording is shorter than 2 minutes. Some parts of a visit may not be in it.',
    ar: 'هذا التسجيل أقصر من دقيقتين. قد لا يحتوي على كل أجزاء الزيارة.',
  },
  long: {
    en: 'This recording is longer than 4 minutes. The analysis is designed for 2 to 4 minutes; it still covers the whole recording.',
    ar: 'هذا التسجيل أطول من 4 دقائق. التحليل مصمم لمدة 2 إلى 4 دقائق، لكنه يشمل التسجيل كله.',
  },
  noTimes: {
    en: 'The transcript has no timing information, so time-based measures and replay are not available.',
    ar: 'لا توجد أوقات في النص، لذلك القياسات الزمنية وإعادة الاستماع غير متاحة.',
  },
  dominant: {
    en: 'One voice holds almost all of the talk time. The two speakers may not have been separated well. Check the speaker labels before relying on per-speaker results.',
    ar: 'صوت واحد يأخذ تقريبًا كل وقت الكلام. ربما لم يُفصل المتحدثان جيدًا. راجع تسمية المتحدثين قبل الاعتماد على النتائج لكل متحدث.',
  },
  noConfidence: {
    en: 'The transcription service did not report word confidence, so uncertain words cannot be flagged.',
    ar: 'خدمة التفريغ لم تُرسل درجة الثقة للكلمات، لذلك لا يمكن تمييز الكلمات غير المؤكدة.',
  },
  uncertain: {
    en: 'Some words were marked uncertain by the transcription service. Check drug names, doses and numbers before relying on them.',
    ar: 'خدمة التفريغ وسمت بعض الكلمات بأنها غير مؤكدة. تحقق من أسماء الأدوية والجرعات والأرقام قبل الاعتماد عليها.',
  },
  fewTurns: {
    en: 'There are few speaking turns, so rates and ratios may change a lot with one more sentence.',
    ar: 'عدد مرات الكلام قليل، لذلك قد تتغير النسب كثيرًا بجملة واحدة إضافية.',
  },
  arabicNote: {
    en: 'Arabic and Iraqi dialect transcription has not been evaluated for accuracy in this app. Treat quotes as a draft and correct them if needed.',
    ar: 'دقة تفريغ العربية واللهجة العراقية لم تُقيَّم بعد في هذا التطبيق. تعامل مع الاقتباسات كمسودة وصحّحها عند الحاجة.',
  },
  partial: {
    en: 'You marked this as only part of the visit. Stages that are missing may have happened outside the recording.',
    ar: 'حددت أن هذا جزء من الزيارة فقط. المراحل غير الظاهرة ربما حدثت خارج التسجيل.',
  },
}

/** True when this uncertain word is still in the current text of its segment (the rep may have corrected it). */
function stillPresent(word: string, segment: TranscriptSegment | undefined): boolean {
  if (!segment) return false
  const w = normalizeForMatch(word)
  return w.length > 0 && normalizeForMatch(segment.text).split(' ').includes(w)
}

/** Builds the quality block the rep sees first. Only notes that apply are included. */
export function assessRecordingQuality(
  segments: readonly TranscriptSegment[],
  quality: TranscriptQuality | null,
  opts: { partialRecording: boolean; lang: Lang; turnCount: number },
): RecordingQuality {
  const durationSec = durationFromSegments(segments) ?? quality?.audioDurationSec ?? null
  const say = (k: string) => NOTES[k][opts.lang]
  const limitations: string[] = []
  if (durationSec === null) limitations.push(say('noTimes'))
  else if (durationSec < VERY_SHORT_SEC) limitations.push(say('veryShort'))
  else if (durationSec < TARGET_MIN_SEC) limitations.push(say('short'))
  else if (durationSec > TARGET_MAX_SEC) limitations.push(say('long'))
  if (opts.turnCount < 10) limitations.push(say('fewTurns'))

  let repMs = 0, totalMs = 0
  for (const s of segments) {
    if (typeof s.startMs !== 'number' || typeof s.endMs !== 'number') continue
    const d = Math.max(0, s.endMs - s.startMs)
    totalMs += d
    if (s.speakerRole === 'rep') repMs += d
  }
  const share = totalMs > 0 ? repMs / totalMs : null
  const speakerAttributionLimited = share !== null && (share > DOMINANT_SHARE || share < 1 - DOMINANT_SHARE)
  if (speakerAttributionLimited) limitations.push(say('dominant'))

  const byIndex = new Map(segments.map(s => [s.segmentIndex, s]))
  const uncertainWords = quality && quality.transcriptVersion === 1
    ? quality.lowConfidenceWords.filter(w => stillPresent(w.word, byIndex.get(w.segmentIndex)))
    : []
  const reported = !!quality && quality.wordsWithConfidence > 0
  if (quality && !reported) limitations.push(say('noConfidence'))
  if (uncertainWords.length > 0) limitations.push(say('uncertain'))
  const arabic = quality?.languageCode?.startsWith('ar') || segments.some(s => /[؀-ۿ]/.test(s.text))
  if (arabic) limitations.push(say('arabicNote'))
  if (opts.partialRecording) limitations.push(say('partial'))

  return { durationSec, limitations, uncertainWords, speakerAttributionLimited, transcriptConfidence: reported ? 'provider_reported' : 'not_reported' }
}
