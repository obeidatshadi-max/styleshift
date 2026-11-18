import { normalizeForMatch } from '@/lib/arabic-normalize'
import type { TranscriptSegment } from '@/schemas/conversationReport'
import { segmentRef } from './interaction'
import { LANGUAGE_CATEGORIES, type LanguageCategory, type LanguagePatternCount } from './types'

/**
 * Word lists for language patterns, English plus Arabic (MSA and common Iraqi forms). They count wording,
 * nothing more: a "sensory predicate" may help the rep mirror natural phrasing, but it never classifies a
 * person as visual, auditory or kinesthetic. These lists are a starting point and have not been reviewed
 * by a native Iraqi speaker.
 */
export const LEXICON: Record<LanguageCategory, readonly string[]> = {
  certainty: ['definitely', 'certainly', 'clearly', 'for sure', 'no doubt', 'absolutely', 'guaranteed', 'اكيد', 'بالتاكيد', 'اكيد اكيد', 'اضمنلك', 'مضمون', 'بدون شك', 'قطعا'],
  qualification: ['maybe', 'perhaps', 'might', 'possibly', 'probably', 'i think', 'it seems', 'not sure', 'kind of', 'ربما', 'يمكن', 'احتمال', 'على ما اعتقد', 'اظن', 'مو متاكد', 'تقريبا', 'ممكن'],
  generalization: ['always', 'never', 'every patient', 'all patients', 'nobody', 'everyone', 'none of', 'دائما', 'دايما', 'ابدا', 'كل المرضى', 'كل مريض', 'محد', 'ولا مريض', 'الكل'],
  obligation: ['must', 'have to', 'need to', 'should', 'required', 'لازم', 'يجب', 'مفروض', 'ضروري', 'لابد'],
  choice: ['you could', 'you can choose', 'option', 'up to you', 'if you prefer', 'your choice', 'حسب رايك', 'على كيفك', 'خيار', 'اذا تحب', 'اذا تفضل', 'براحتك'],
  risk_concern: ['side effect', 'side effects', 'risk', 'worried', 'concern', 'safety', 'interaction', 'tolerate', 'stop taking', 'اعراض جانبية', 'اعراض', 'خطر', 'خطورة', 'قلقان', 'خايف', 'امان', 'تداخل', 'يوقفون', 'يتركون العلاج'],
  evidence_request: ['study', 'studies', 'data', 'evidence', 'trial', 'publication', 'guideline', 'show me', 'دراسة', 'دراسات', 'بيانات', 'دليل', 'تجربة سريرية', 'بحث', 'مصدر', 'ورقة علمية'],
  practical_concern: ['price', 'cost', 'expensive', 'insurance', 'available', 'availability', 'pharmacy', 'stock', 'adherence', 'follow-up', 'follow up', 'سعر', 'غالي', 'كلفة', 'تامين', 'متوفر', 'متوفره', 'الصيدلية', 'مقطوع', 'التزام', 'مراجعة', 'متابعة'],
  conditional_interest: ['if you can', 'if it', 'if the data', 'i might try', 'i could try', 'depends', 'it depends', 'send me', 'اذا تجيبلي', 'اذا اكو', 'حسب النتائج', 'ممكن اجرب', 'ابعثلي', 'دزلي', 'جيبلي'],
  commitment: ['i will', "i'll", 'we agreed', 'next week', 'next visit', 'i promise', 'let us meet', 'راح', 'رح', 'اتفقنا', 'الاسبوع الجاي', 'الزيارة الجاية', 'اوعدك', 'نلتقي'],
  sensory_predicate: ['i see', 'looks like', 'look at', 'picture', 'sounds', 'i hear', 'sounds good', 'i feel', 'feels', 'touch base', 'اشوف', 'شايف', 'يبين', 'اسمع', 'سامع', 'احس', 'اشعر', 'حاس'],
}

export const MAX_EXAMPLES = 2

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const ARABIC = /[؀-ۿ]/
/** Whole-word match after normalisation. Arabic phrases also match with a leading و/ف/ب/ل/ك and/or ال ("السعر" for "سعر"). */
export function matchesPhrase(text: string, phrase: string): boolean {
  const p = normalizeForMatch(phrase)
  if (!p) return false
  const t = ` ${normalizeForMatch(text)} `
  if (!ARABIC.test(p)) return t.includes(` ${p} `)
  return new RegExp(` (?:[وفبلك])?(?:ال)?${escape(p)} `).test(t)
}

/** Counts each category once per segment, per speaker, with up to two quoted examples. Zero counts are dropped. */
export function computeLanguagePatterns(segments: readonly TranscriptSegment[]): LanguagePatternCount[] {
  const out: LanguagePatternCount[] = []
  for (const speaker of ['counterpart', 'rep'] as const) {
    for (const category of LANGUAGE_CATEGORIES) {
      const hits = segments.filter(s => s.speakerRole === speaker && LEXICON[category].some(p => matchesPhrase(s.text, p)))
      if (hits.length) out.push({ category, speaker, count: hits.length, examples: hits.slice(0, MAX_EXAMPLES).map(segmentRef) })
    }
  }
  return out
}
