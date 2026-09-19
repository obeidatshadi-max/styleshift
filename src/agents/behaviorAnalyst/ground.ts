import { isCompetency, isDirection, type EvidenceRef, type Observation } from '@/schemas/observation'
import type { TranscriptTurn } from '@/schemas/session'
import { behaviorIndex, defaultScoringConfig, type ScoringConfig } from '@/scoring/config'

export const MAX_OBSERVATIONS = 15
const MIN_QUOTE_CHARS = 3

/** Advisory phrasing the analyst must never emit. English-only screen; the
 * prompt forbids it in every language, this catches the obvious slips. */
const COACHING_RE = /\b(should|could have|would have|ought to|needs? to|try (to|asking|using)|next time|i recommend|recommend(ed|s)?|consider (asking|using|trying))\b/i

export function looksLikeCoaching(text: string): boolean {
  return COACHING_RE.test(text)
}

/** Whitespace/case/quote-insensitive form used only to compare quotes. */
export function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[‘’“”"'`«»]/g, '').replace(/\s+/g, ' ').trim()
}

export function extractJson(text: string): unknown | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try { return JSON.parse(text.slice(start, end + 1)) } catch { return null }
}

/** Returns a grounded evidence ref, or null if the quote is not really in the
 * transcript. Role comes from the transcript, never from the model. If the
 * stated turn does not contain the quote but exactly one other turn does, it
 * is re-pointed there. */
function groundEvidence(raw: unknown, turns: TranscriptTurn[]): EvidenceRef | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  if (typeof e.quote !== 'string' || typeof e.turnIndex !== 'number') return null
  const quote = e.quote.trim()
  const needle = normalizeForMatch(quote)
  if (needle.length < MIN_QUOTE_CHARS) return null

  const stated = turns.find(t => t.turnIndex === e.turnIndex)
  if (stated && normalizeForMatch(stated.text).includes(needle)) {
    return { turnIndex: stated.turnIndex, role: stated.role, quote }
  }
  const hits = turns.filter(t => normalizeForMatch(t.text).includes(needle))
  if (hits.length === 1) return { turnIndex: hits[0].turnIndex, role: hits[0].role, quote }
  return null
}

export interface GroundResult { observations: Observation[]; dropped: number }

/** Validates model output into fully-grounded Observations. Anything without
 * real evidence, with an unknown competency/direction, or that reads as
 * coaching is dropped — never repaired into something the model did not say. */
export function groundObservations(
  parsed: unknown, turns: TranscriptTurn[], cfg: ScoringConfig = defaultScoringConfig,
): GroundResult | null {
  const catalog = behaviorIndex(cfg)
  if (!parsed || typeof parsed !== 'object') return null
  const list = (parsed as Record<string, unknown>).observations
  if (!Array.isArray(list)) return null

  const out: Observation[] = []
  let dropped = 0
  for (const item of list) {
    const o = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const behavior = typeof o.behavior === 'string' ? o.behavior.trim() : ''
    const observation = typeof o.observation === 'string' ? o.observation.trim() : ''
    const evidence = (Array.isArray(o.evidence) ? o.evidence : [])
      .map(ev => groundEvidence(ev, turns))
      .filter((ev): ev is EvidenceRef => ev !== null)

    // Scored behaviors must be a catalog key: the catalog decides the competency
    // and the direction (its points' sign), so the model cannot mislabel them.
    // communication_clarity has no catalog and stays a free-label observation.
    const entry = typeof o.behavior === 'string' ? catalog.get(o.behavior.trim()) : undefined
    const competency = entry ? entry.competency : (o.competency === 'communication_clarity' ? o.competency : null)
    const direction = entry ? (entry.rule.points > 0 ? 'positive' : 'negative') : (isDirection(o.direction) ? o.direction : null)

    if (
      !competency || !isCompetency(competency) || !direction ||
      !behavior || !observation || evidence.length === 0 ||
      looksLikeCoaching(behavior) || looksLikeCoaching(observation)
    ) { dropped++; continue }

    const first = evidence.reduce((a, b) => (b.turnIndex < a.turnIndex ? b : a))
    const confidence = typeof o.confidence === 'number' && Number.isFinite(o.confidence)
      ? Math.max(0, Math.min(1, o.confidence)) : 0.5
    out.push({
      competency, behavior, observation, evidence,
      timestamp: turns.find(t => t.turnIndex === first.turnIndex)?.createdAt ?? null,
      direction, confidence,
    })
    if (out.length >= MAX_OBSERVATIONS) break
  }
  return { observations: out, dropped }
}
