/** Powerless-speech markers in the REP's own words (hedges, vocal fillers, intensifiers).
 * Source: Conley et al. 1978 as summarised by Gadzhiyeva & Sager 2017 — powerful language raised
 * perceived speaker power and persuasion; the effect was found for audio/video, not print.
 *
 * Measurement only, never a verdict on a person. Polite forms such as "sir"/"doctor" are deliberately
 * NOT counted: respectful address is appropriate with a physician and must not be penalised.
 * Apply to the rep only — a doctor's hedging says nothing about the doctor (see CONTEXT_COACHING_RULES). */

/** Phrases first, so "sort of" is not also counted through a shorter entry. English v1. */
export const HEDGES_EN = [
  'sort of', 'kind of', 'i guess', 'i suppose', 'i think maybe', "i'm not sure", 'i am not sure',
  'maybe', 'perhaps', 'probably', 'somewhat', 'possibly',
] as const

export const FILLERS_EN = ['you know', 'i mean', 'um', 'uh', 'er', 'erm', 'hmm'] as const

export const INTENSIFIERS_EN = ['really', 'very', 'extremely', 'honestly', 'truly'] as const

/** Arabic (Iraqi/MSA) markers, supplied by a native speaker (2026-10-06). These are REVIEW INDICATORS, not
 * automatic verdicts: honest uncertainty about medical facts ("مو متأكد", "يمكن") and meaningful "يعني" /
 * "زين" / "تعرف" are fine in context, so the analyst judges the sentence, repetition and length.
 * Respectful address (دكتور، عمي، حضرتك، سيدي، إذا تسمح، من فضلك) is deliberately absent.
 * Spelling variants (أگصد/أقصد, صدگ/صدك) are listed together; longer phrases win, so
 * "مو متأكد كلش" is ONE marker. No fixed numeric cut-off: repetition is judged against length. */
export const HEDGES_AR = [
  'يمكن', 'يجوز', 'احتمال', 'أظن', 'أعتقد', 'على ما أظن', 'حسب ظني', 'مو متأكد', 'مو متأكد كلش',
  'ما أدري بالضبط', 'ما أعرف بالضبط', 'يمكن أكون غلطان', 'إذا ما غلطان', 'نوعاً ما', 'تقريباً',
] as const
export const FILLERS_AR = [
  'اممم', 'آآآ', 'يعني', 'يعني شلون أگلك', 'شلون أگول', 'شلون أشرحلك', 'شسمه', 'شنو اسمه', 'تعرف',
  'تعرف شلون', 'أقصد', 'أگصد', 'هو يعني', 'إي يعني', 'زين',
] as const
export const INTENSIFIERS_AR = [
  'كلش', 'هواية', 'حيل', 'كلش كلش', 'هواية هواية', 'حيل حيل', 'صدگ', 'صدك', 'صدگ صدگ',
  'بصراحة', 'الصراحة', 'والله', 'والله العظيم', 'فعلاً', 'أكيد أكيد',
] as const

export interface HedgeResult {
  /** Total markers found. */
  count: number
  /** Each marker found, in order of appearance, for quoting in coaching. */
  markers: string[]
}

/** Lower-cases, drops Arabic diacritics/tatweel, unifies alef/ya/ta-marbuta-free spellings and the Iraqi گ→ك,
 * and strips punctuation. Applied to BOTH the text and the marker lists so they compare on equal terms. */
const norm = (s: string) => s.toLowerCase()
  .replace(/[’‘]/g, "'")
  .replace(/[ً-ٰٟـ]/g, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/گ/g, 'ك')
  .replace(/[.,!?؟،;:"()«»]/g, ' ').replace(/\s+/g, ' ').trim()
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function buildMatcher(list: readonly string[]): RegExp | null {
  if (list.length === 0) return null
  // Longest first so multi-word markers win; whitespace-delimited so Arabic and English both work.
  const alt = [...new Set(list.map(norm))].sort((a, b) => b.length - a.length).map(escapeRe).join('|')
  return new RegExp(`(?<![\\p{L}\\p{N}'])(?:${alt})(?![\\p{L}\\p{N}'])`, 'gu')
}

const MATCHER = buildMatcher([
  ...HEDGES_EN, ...FILLERS_EN, ...INTENSIFIERS_EN,
  ...HEDGES_AR, ...FILLERS_AR, ...INTENSIFIERS_AR,
])

export function countHedges(text: string): HedgeResult {
  if (!MATCHER) return { count: 0, markers: [] }
  const markers = norm(text).match(MATCHER) ?? []
  return { count: markers.length, markers }
}
