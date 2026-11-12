// src/lib/report/socialSignals.ts
import type { TranscriptSegment, SocialStyleSignal, SignalCategory } from '@/schemas/conversationReport'

interface SignalRule { category: SignalCategory; pattern: RegExp }

// English + Iraqi Arabic (colloquial, not MSA) patterns. Kept deliberately
// small and literal — this is evidence extraction, not sentiment analysis;
// false negatives (missed signal) are safe, false positives are not, so
// each pattern targets a specific, unambiguous phrasing rather than a broad
// keyword.
//
// Three guards against false positives (validation audit 2026-11-12, W4):
// 1. Arabic word edges. \b does not work on Arabic letters, so `ar()` wraps a
//    term so it only matches as a whole word, allowing the usual attached
//    prefixes (و ف ب ل ك ال) and pronoun suffixes. "قرار" no longer fires
//    inside "استقرار" (stability).
// 2. Negation. A match is ignored when a negation word sits in the three words
//    before it ("مو مستعجل" = not in a hurry, "no need for data"). A pattern
//    that itself starts with a negation ("ما عندي وقت", "not ready") is exempt.
// 3. Clinical evidence words (study, data, evidence, دراسة, دليل...) are
//    `evidence_request`: asking for evidence is ordinary medical practice, so
//    that category never supports a style claim on its own (groundReport.ts).

const AR_LETTER = '\\u0621-\\u064A'
/** Whole-word Arabic alternation, with optional attached prefixes and pronoun suffixes. */
function ar(...terms: string[]): string {
  return `(?<![${AR_LETTER}])(?:[وف])?(?:بال|لل|ال|ب|ل|ك)?(?:${terms.join('|')})(?:ه|ها|هم|ك|كم|ي|نا)?(?![${AR_LETTER}])`
}
function rx(english: string | null, ...arabic: string[]): RegExp {
  return new RegExp([english, arabic.length ? ar(...arabic) : null].filter(Boolean).join('|'), 'giu')
}

const RULES: SignalRule[] = [
  // خلص was removed: in Iraqi speech it is mostly a filler ("fine, done"), not a request for brevity.
  { category: 'directness', pattern: rx('\\b(bottom line|just tell me|get to the point|quickly|no time for details)\\b', 'بسرعة', 'بالمختصر', 'ما\\s?عندي\\s?(?:وقت|وكت)') },
  { category: 'evidence_request', pattern: rx('\\b(evidence|study|studies|data|proof|compare|comparison|source|trial|trials)\\b', 'دليل', 'ادلة', 'دراسة', 'دراست', 'دراسات', 'بيانات', 'مصدر', 'قارن', 'مقارنة', 'تجربة', 'تجارب') },
  // Non-clinical: wanting the explanation itself in more detail.
  { category: 'detail_request', pattern: rx('\\b(step by step|in detail|more detail|walk me through|exactly how|the specifics)\\b', 'بالتفصيل', 'التفاصيل', 'خطوة\\s?بخطوة', 'شلون\\s?بالضبط') },
  // "Results" of a study or test are clinical evidence, not a results-focused style.
  { category: 'results_focus', pattern: rx('(?<!\\b(?:study|trial|lab|test|clinical)\\s)\\b(results?|outcome|decision|faster|move (this |the )?forward)\\b(?!\\s+(?:of|from)\\s+(?:the\\s+|this\\s+|that\\s+)?(?:study|trial|test|lab))', 'نتيجة(?!\\s*(?:ال)?(?:دراسة|تجربة|تحليل|فحص))', 'نتائج(?!\\s*(?:ال)?(?:دراسة|تجربة|تحليل|فحص))', 'قرار', 'اسرع') },
  { category: 'relationship_language', pattern: rx('\\b(how (are|is) (you|your family)|appreciate you|good to see you)\\b', 'شلونك', 'شخبار', 'حبيبي', 'العائلة', 'شكرا\\s?الك') },
  { category: 'possibility_interest', pattern: rx('\\b(what if|possibilit(y|ies)|could this|imagine|down the (road|line))\\b', 'شنو\\s?لو', 'ممكن\\s?بالمستقبل', 'تخيل') },
  { category: 'reassurance_request', pattern: rx('\\b(are you sure|what happens if|support (after|later)|guarantee)\\b', 'متاكد', 'شنو\\s?الضمان', 'دعم\\s?بعدين') },
  // About time, not personality: a stated limit on how long the conversation can last.
  { category: 'time_limit', pattern: rx('\\b(one|1|two|2|a few|few|couple of) minutes?\\b|\\b(short on time|in a hurry|running late|only have (a )?(minute|moment|few minutes)|keep it (short|brief)|make it (short|quick|brief))\\b', 'عندي\\s?(?:دقيقة|دقيقتين|دقايق)', 'وقتي\\s?(?:ضيق|قليل)', 'مستعجل', 'اختصر', 'باختصار') },
  { category: 'pace_preference', pattern: rx('\\b(more time|slow down|take (your|my) time|not (yet|ready))\\b', 'خذ\\s?لك\\s?(?:وقت|وكت)', 'مو\\s?جاهز', 'ببطء') },
]

// Negation words, Arabic (Iraqi + MSA) and English. Reviewed list pending: an Iraqi trainer should check it.
const NEGATIONS = new Set([
  'ما', 'مو', 'مش', 'لا', 'ماكو', 'مافي', 'بدون', 'موب', 'ليس', 'لست', 'غير', 'بلا',
  'no', 'not', "don't", 'dont', "doesn't", 'doesnt', 'never', 'without', "isn't", 'isnt', "aren't", "won't", "i'm not", 'nor',
])
const NEGATION_WINDOW = 3

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[\s,.;:!?،؛؟()"“”]+/u).filter(Boolean)
    // An attached و ("and") before a negation: "وما" still negates.
    .map(t => (t.length > 2 && t.startsWith('و') && NEGATIONS.has(t.slice(1)) ? t.slice(1) : t))
}

/** True when the match is negated by a word just before it, unless the match itself opens with a negation. */
function isNegated(text: string, index: number, match: string): boolean {
  const own = tokens(match)
  if (own.length && NEGATIONS.has(own[0])) return false
  return tokens(text.slice(0, index)).slice(-NEGATION_WINDOW).some(t => NEGATIONS.has(t))
}

/** True when the rule matches somewhere in the text that is not negated. */
function firesOn(rule: SignalRule, text: string): boolean {
  for (const m of text.matchAll(rule.pattern)) if (!isNegated(text, m.index ?? 0, m[0])) return true
  return false
}

/**
 * Diacritic/hamza-insensitive normalization for Arabic matching, mirroring
 * classifyQuestions() in roleplay-core.ts: strips tashkeel/tatweel and folds
 * alef-hamza variants to bare alef so a pattern matches regardless of how a
 * given transcript happens to render them. A no-op on English text. Used
 * only to decide whether a rule fires — the stored evidence always quotes
 * the segment's original, unmodified text.
 */
function normalizeForMatch(text: string): string {
  return text.normalize('NFKC').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا')
}

export function extractSocialSignals(segments: TranscriptSegment[], speakerRole: 'rep' | 'counterpart'): SocialStyleSignal[] {
  const signals: SocialStyleSignal[] = []
  // One signal per (segment, speaker, category): a single line can carry more than one kind of statement
  // ("I have one minute, but leave the study"), but the same category is never counted twice for it.
  // Counts are not probabilities of a personality type.
  const seen = new Set<string>()
  for (const seg of segments) {
    if (seg.speakerRole !== speakerRole) continue
    const normalized = normalizeForMatch(seg.text)
    for (const rule of RULES) {
      const key = `${seg.segmentIndex}|${seg.speakerRole}|${rule.category}`
      if (seen.has(key) || !firesOn(rule, normalized)) continue
      seen.add(key)
      signals.push({
        text: seg.text,
        evidence: { segmentIndex: seg.segmentIndex, speakerRole: seg.speakerRole, quote: seg.text },
        category: rule.category,
      })
    }
  }
  return signals
}
