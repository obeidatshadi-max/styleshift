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

/** Arabic (Iraqi/MSA) markers — to be supplied and reviewed by a native speaker before use.
 * Left empty on purpose: an unreviewed list would mislabel ordinary Iraqi phrasing as weak speech. */
export const HEDGES_AR: readonly string[] = []
export const FILLERS_AR: readonly string[] = []
export const INTENSIFIERS_AR: readonly string[] = []

export interface HedgeResult {
  /** Total markers found. */
  count: number
  /** Each marker found, in order of appearance, for quoting in coaching. */
  markers: string[]
}

const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[.,!?؟،;:"()]/g, ' ').replace(/\s+/g, ' ').trim()
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function buildMatcher(list: readonly string[]): RegExp | null {
  if (list.length === 0) return null
  // Longest first so multi-word markers win; whitespace-delimited so Arabic and English both work.
  const alt = [...list].sort((a, b) => b.length - a.length).map(escapeRe).join('|')
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
