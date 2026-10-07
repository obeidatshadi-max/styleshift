/** Comparative or superlative claims in the REP's own words that name no comparison
 * ("it's better tolerated", "the most effective option"). Source: Bandler & Grinder 1975,
 * The Structure of Magic I, p. 66 ("Class I: Real Compared to What?") — one term of the
 * comparison has been deleted. For a rep, an unanchored comparative is a weak and possibly
 * non-compliant claim: better than what, for which patients, in which data?
 *
 * Measurement only, never a verdict on a person: a review indicator for the analyst, like
 * countHedges(). English v1 — an Arabic list needs a native speaker's review before it is
 * added (the Arabic hedge lists were supplied that way). Apply to the rep only. */

/** Comparative/superlative words that typically carry a product claim. Deliberately not every
 * "-er"/"-est" word: "later", "sooner", "faster appointment" are not claims about a product. */
export const CLAIM_COMPARATIVES_EN = [
  'better', 'best', 'safer', 'safest', 'stronger', 'strongest', 'superior', 'cheaper', 'cheapest',
  'more effective', 'most effective', 'more efficacious', 'more potent', 'more powerful',
  'better tolerated', 'best tolerated', 'more convenient', 'most convenient', 'more reliable',
  'fewer side effects', 'less side effects', 'fewer adverse events', 'more affordable',
] as const

/** Words that state what is being compared with. If one appears after the comparative in the
 * same sentence, the comparison is anchored. */
const ANCHORS_EN = /\b(than|compared (to|with)|in comparison (to|with)|versus|vs\.?|relative to|over (the|your|other|its)|head[- ]to[- ]head|of (all|the|any) )\b/i

/** A sentence that asks a question is not a claim ("is it better for your elderly patients?"). */
const isQuestion = (sentence: string) => /[?؟]\s*$/.test(sentence.trim())

export interface ComparativeResult {
  /** Unanchored comparatives found. */
  count: number
  /** Each one, in order, for quoting in coaching. */
  markers: string[]
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const MATCHER = new RegExp(
  `\\b(?:${[...CLAIM_COMPARATIVES_EN].sort((a, b) => b.length - a.length).map(escapeRe).join('|')})\\b`, 'gi')

/** Everyday idioms that use these words without making a claim. Removed before matching. */
const IDIOMS_EN = /\b(do|doing|did|try|trying) (my|our|your) best\b|\bbest (regards|wishes)\b|\b(had|you'd|we'd|i'd) better\b|\bbetter (understand|know)\b|\bthe best way to (reach|contact)\b/gi

export function findUnanchoredComparatives(text: string): ComparativeResult {
  const markers: string[] = []
  const sentences = text.replace(/[’‘]/g, "'").replace(IDIOMS_EN, ' ').split(/(?<=[.!?؟])\s+|\n+/)
  for (const sentence of sentences) {
    if (!sentence.trim() || isQuestion(sentence)) continue
    for (const m of sentence.matchAll(MATCHER)) {
      const rest = sentence.slice((m.index ?? 0) + m[0].length)
      if (!ANCHORS_EN.test(rest)) markers.push(m[0].toLowerCase())
    }
  }
  return { count: markers.length, markers }
}
