// src/lib/report/socialSignals.ts
import type { TranscriptSegment, SocialStyleSignal, SignalCategory } from '@/schemas/conversationReport'

interface SignalRule { category: SignalCategory; pattern: RegExp }

// English + Iraqi Arabic (colloquial, not MSA) patterns. Kept deliberately
// small and literal — this is evidence extraction, not sentiment analysis;
// false negatives (missed signal) are safe, false positives are not, so
// each pattern targets a specific, unambiguous phrasing rather than a broad
// keyword.
//
// A few of the Arabic phrases were tightened from the original spec to
// tolerate natural Iraqi colloquial spelling/spacing variance (see
// task-8-report.md for exactly which patterns and why) — the category each
// pattern targets and its intent are unchanged. English patterns are
// untouched.
const RULES: SignalRule[] = [
  { category: 'directness', pattern: /\b(bottom line|just tell me|get to the point|quickly|no time for details)\b|بسرعة|خلص|بالمختصر|ما\s?عندي\s?(وقت|وكت)/i },
  { category: 'detail_request', pattern: /\b(evidence|study|studies|data|proof|compare|comparison|source)\b|دليل|دراسة|بيانات|مصدر|قارن/i },
  { category: 'results_focus', pattern: /\b(results?|outcome|decision|faster|move (this |the )?forward)\b|نتيجة|نتائج|قرار|اسرع/i },
  { category: 'relationship_language', pattern: /\b(how (are|is) (you|your family)|appreciate you|good to see you)\b|شلونك|شخبار|حبيبي|العائلة|شكرا الك/i },
  { category: 'possibility_interest', pattern: /\b(what if|possibilit(y|ies)|could this|imagine|down the (road|line))\b|شنو لو|ممكن بالمستقبل|تخيل/i },
  { category: 'reassurance_request', pattern: /\b(are you sure|what happens if|support (after|later)|guarantee)\b|متأكد|شنو الضمان|دعم بعدين/i },
  { category: 'pace_preference', pattern: /\b(more time|slow down|take (your|my) time|not (yet|ready))\b|خذ\s?لك\s?(وقت|وكت)|مو جاهز|ببطء|بروية/i },
]

/**
 * Diacritic/hamza-insensitive normalization for Arabic matching, mirroring
 * classifyQuestions() in roleplay-core.ts: strips tashkeel/tatweel and folds
 * alef-hamza variants to bare alef so a pattern matches regardless of how a
 * given transcript happens to render them. A no-op on English text. Used
 * only to decide whether a rule fires — the stored evidence always quotes
 * the segment's original, unmodified text.
 */
function normalizeForMatch(text: string): string {
  return text.normalize('NFKC').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا')
}

export function extractSocialSignals(segments: TranscriptSegment[], speakerRole: 'rep' | 'counterpart'): SocialStyleSignal[] {
  const signals: SocialStyleSignal[] = []
  for (const seg of segments) {
    if (seg.speakerRole !== speakerRole) continue
    const normalized = normalizeForMatch(seg.text)
    for (const rule of RULES) {
      if (rule.pattern.test(normalized)) {
        signals.push({
          text: seg.text,
          evidence: { segmentIndex: seg.segmentIndex, speakerRole: seg.speakerRole, quote: seg.text },
          category: rule.category,
        })
        break // one signal per segment keeps the strongest-match, avoids over-counting a single line
      }
    }
  }
  return signals
}
