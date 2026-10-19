import type { Turn } from './roleplay-core'

/**
 * Word-level skills in a live roleplay recording, read from the REP's own
 * words (plus the partner's turn just before, for "build on the positive").
 * Counts only: the transcript is discarded after scoring, so no quotes from
 * either speaker are stored. Phrase lists are indicators, not verdicts — a
 * missed phrase may still be said another way.
 */
export interface LanguageSignals {
  /**
   * Rep turns that voiced understanding of the partner's feeling. `needed` =
   * partner turns that voiced a feeling or difficulty; `met` = how many of
   * those the rep's very next reply answered with empathy. Both absent on
   * sessions saved before "when needed" tracking.
   */
  empathy: { count: number; needed?: number; met?: number }
  /**
   * Rep turns that restated the partner's point ("so you are saying...").
   * `needed` = partner turns with a concern or a long explanation; `met` = how
   * many the rep's next reply restated. Both absent on older sessions.
   */
  paraphrasing: { count: number; needed?: number; met?: number }
  /** Whole-word "and" versus "but"/"however" in the rep's speech. */
  andBut: { and: number; but: number }
  /** Positive remarks by the partner, and how many the rep's next reply built on. */
  buildOnPositive: { positives: number; builtOn: number }
}

/** Lowercase, strip Arabic diacritics, fold common letter variants and curly quotes. */
export function normalizeForMatch(text: string): string {
  return (text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[’‘`]/g, "'")
    .replace(/[.,!?؟،;؛:"()\[\]\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(text: string): string[] {
  const n = normalizeForMatch(text)
  return n ? n.split(' ') : []
}

function norm(list: readonly string[]): string[] {
  return list.map(normalizeForMatch)
}

/** Whole-phrase containment: never matches inside a longer word. */
function hasPhrase(normalizedText: string, phrases: readonly string[]): boolean {
  const padded = ` ${normalizedText} `
  return phrases.some(p => padded.includes(` ${p} `))
}

export const EMPATHY_PHRASES = norm([
  'i understand', 'i can understand', 'i can see why', 'i can feel what you', 'i feel what you', 'i know how you feel',
  'i am with you', "i'm with you", 'i hear you', 'i get what you', 'i can imagine', 'that must be hard', 'that must be difficult',
  'افهم ما تقول', 'افهم شعورك', 'افهمك', 'فاهم عليك', 'فاهمك', 'فاهم شعورك', 'احس بك', 'احس فيك', 'احس بما تحس',
  'اشعر بك', 'اشعر بما تشعر', 'انا معك', 'اقدر شعورك', 'اقدر موقفك', 'اتفهم', 'اتفهم موقفك', 'اتفهم قلقك', 'اسمعك',
])

export const PARAPHRASE_PHRASES = norm([
  'so you are saying', "so you're saying", 'so what you are saying', "so what you're saying", 'what i am hearing', "what i'm hearing",
  'if i understand', 'if i understood', 'let me make sure i', 'in other words', 'so you mean', 'you mean that', 'so basically you',
  'just to confirm', 'to summarize', 'so to sum up', 'what you are telling me', "what you're telling me", 'let me repeat',
  'يعني تقصد', 'يعني حضرتك تقصد', 'تقصد ان', 'اذا فهمت', 'اذا فهمتك صح', 'يعني تقول', 'يعني انت تقول', 'بمعني', 'اذن انت تقول',
  'خلني اتاكد', 'خليني اتاكد',
])

/** Partner words that signal a feeling or difficulty the rep should acknowledge. */
const FEELING_TERMS = norm([
  'worried', 'worry', 'concerned', 'concern', 'frustrated', 'frustrating', 'disappointed', 'stressed', 'afraid', 'nervous',
  'upset', 'unhappy', 'difficult', 'hard for me', 'struggling', 'struggle', 'tired', 'overwhelmed', 'annoyed', 'unfortunately',
  'problem', 'complaint', 'not happy', 'not satisfied', 'worried about',
  'قلق', 'قلقان', 'قلقه', 'خايف', 'متضايق', 'زعلان', 'محبط', 'تعبان', 'مشكله', 'صعب', 'صعبه', 'مو راضي', 'غير راضي',
  'منزعج', 'مستاء', 'مشكلتي', 'شكوي', 'للاسف', 'ضغط',
])

/** Words that mark a partner turn as a concern or objection worth restating. */
const CONCERN_TERMS = norm([
  'expensive', 'too high', 'too much', 'cannot', "can't", 'not sure', "don't think", 'doubt', 'no time', 'already use',
  'side effect', 'side effects', 'why', 'i prefer', 'happy with my', 'not interested',
  'غالي', 'غاليه', 'ما اقدر', 'مو متاكد', 'مش متاكد', 'ما عندي وقت', 'اعراض جانبيه', 'اشك', 'لماذا', 'ليش', 'افضل', 'مو مهتم', 'غير مهتم',
])

/** A partner turn at least this many words long explains something worth restating. */
const LONG_TURN_WORDS = 25

const BUT_EN = ['but', 'however']
const BUT_AR = norm(['لكن', 'ولكن', 'لاكن', 'ولاكن'])
// Arabic "و" is normally written attached to the next word, so only the
// stand-alone form is counted: Arabic "and" is a floor, not an exact count.
const AND_WORDS = ['and', 'و']

const POSITIVE_TERMS = norm([
  'good', 'great', 'excellent', 'interesting', 'useful', 'helpful', 'effective', 'impressed', 'nice', 'pleased', 'happy with',
  'satisfied', 'works well', 'worked well', 'work well', 'working well', 'went well', 'i like', 'we like', 'i liked', 'i love', 'like it', 'love it', 'makes sense',
  'جيد', 'ممتاز', 'حلو', 'مفيد', 'اعجبني', 'يعجبني', 'راضي', 'مرتاح', 'فعال', 'ناجح', 'زين', 'رائع', 'احب', 'مقتنع',
])
const NEGATORS = new Set(norm(['not', 'no', 'never', "isn't", "don't", "doesn't", "wasn't", 'مو', 'ما', 'ليس', 'لا']))

/** Phrases a rep uses to acknowledge or reuse something good the partner just said. */
const BUILD_ON_PHRASES = norm([
  'glad', 'great to hear', 'good to hear', 'happy to hear', 'pleased to hear', 'that is good', 'that is great', 'since you',
  'because you', 'building on', 'as you said', 'as you mentioned', 'you mentioned', 'you said', 'which is why', 'that is why',
  'يسعدني', 'سعيد ان', 'جميل', 'بما انك', 'بما انه', 'لانك', 'كما قلت', 'زي ما قلت', 'مثل ما قلت', 'بناء علي',
])

function matchedPositive(normalizedText: string): string | null {
  const padded = ` ${normalizedText} `
  for (const term of POSITIVE_TERMS) {
    const at = padded.indexOf(` ${term} `)
    if (at === -1) continue
    // Look 2 words back for a negation ("not good", "مو زين").
    const before = padded.slice(0, at).trim()
    const prev = before ? before.split(' ').slice(-2) : []
    if (prev.some(w => NEGATORS.has(w))) continue
    return term
  }
  return null
}

function sharedLongWords(a: string, b: string): number {
  const setA = new Set(a.split(' ').filter(w => w.length > 3))
  let n = 0
  for (const w of new Set(b.split(' ').filter(w => w.length > 3))) if (setA.has(w)) n++
  return n
}

export function computeLanguageSignals(turns: Turn[], repSpeaker: string): LanguageSignals {
  let empathy = 0, paraphrasing = 0, and = 0, but = 0, positives = 0, builtOn = 0
  let empathyNeeded = 0, empathyMet = 0, paraNeeded = 0, paraMet = 0

  turns.forEach((turn, i) => {
    const n = normalizeForMatch(turn.text)
    if (turn.speaker === repSpeaker) {
      if (hasPhrase(n, EMPATHY_PHRASES)) empathy++
      if (hasPhrase(n, PARAPHRASE_PHRASES)) paraphrasing++
      for (const w of tokens(turn.text)) {
        if (AND_WORDS.includes(w)) and++
        else if (BUT_EN.includes(w) || BUT_AR.includes(w)) but++
      }
      return
    }
    // Partner turn: judged against the rep's very next reply.
    const next = turns[i + 1]
    const reply = next && next.speaker === repSpeaker ? normalizeForMatch(next.text) : null

    if (hasPhrase(n, FEELING_TERMS)) {
      empathyNeeded++
      if (reply && hasPhrase(reply, EMPATHY_PHRASES)) empathyMet++
    }
    if (hasPhrase(n, CONCERN_TERMS) || tokens(turn.text).length >= LONG_TURN_WORDS) {
      paraNeeded++
      if (reply && hasPhrase(reply, PARAPHRASE_PHRASES)) paraMet++
    }

    // A positive remark counts once.
    const positive = matchedPositive(n)
    if (!positive) return
    positives++
    if (reply === null) return
    if (hasPhrase(reply, BUILD_ON_PHRASES) || hasPhrase(reply, [positive]) || sharedLongWords(n, reply) >= 2) builtOn++
  })

  return {
    empathy: { count: empathy, needed: empathyNeeded, met: empathyMet },
    paraphrasing: { count: paraphrasing, needed: paraNeeded, met: paraMet },
    andBut: { and, but }, buildOnPositive: { positives, builtOn },
  }
}

/** "and" should clearly outweigh "but": at least twice as often, or no "but" at all. */
export function andButOnGoal(s: LanguageSignals['andBut']): boolean {
  return s.but === 0 || s.and >= s.but * 2
}

/**
 * How well a skill was applied when the moment called for it: 'none' = no such
 * moment arose (or older session without the data), 'missed' = 0, 'partly' =
 * some, 'done' = all.
 */
export function neededVerdict(needed: number | undefined, met: number | undefined): 'none' | 'done' | 'partly' | 'missed' {
  if (!needed) return 'none'
  const m = met ?? 0
  return m >= needed ? 'done' : m > 0 ? 'partly' : 'missed'
}
