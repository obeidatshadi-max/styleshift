import { RUBRIC_DOMAINS, isRubricDomain, type RubricDomain } from './rubric'

/** One rubric domain as an assessor rated it. "Not observable" has no score; an observable one needs a turn reference. */
export interface RatingItemInput {
  domain: RubricDomain
  observable: boolean
  score: number | null
  turnRefs: number[]
  note: string | null
  uncertain: boolean
}

export interface RatingInput {
  /** The whole case cannot be rated (audio too poor, wrong scenario, ...). Then no domain item is needed. */
  unscorable: boolean
  items: RatingItemInput[]
}

export type RatingCheck = { ok: true; value: RatingInput } | { ok: false; error: string }

export const NOTE_MAX = 300

/**
 * Check a rating before it reaches the database, with messages an assessor can act on. The database enforces the same
 * rules (human_rating_items checks); this only makes the failure readable.
 *
 * `turnIndexes` are the turn numbers that exist in the case. When given, a reference to a turn that is not in the case
 * is rejected. `submit` additionally requires every domain to be answered, unless the case is marked unscorable.
 */
export function validateRating(raw: unknown, opts: { submit: boolean; turnIndexes?: readonly number[] }): RatingCheck {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Send the rating as an object.' }
  const r = raw as Record<string, unknown>
  const unscorable = r.unscorable === true
  if (r.unscorable !== undefined && typeof r.unscorable !== 'boolean') return { ok: false, error: 'unscorable must be true or false.' }
  if (!Array.isArray(r.items)) return { ok: false, error: 'items must be a list.' }
  const known = opts.turnIndexes ? new Set(opts.turnIndexes) : null

  const items: RatingItemInput[] = []
  const seen = new Set<string>()
  for (const entry of r.items) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return { ok: false, error: 'Each item must be an object.' }
    const e = entry as Record<string, unknown>
    if (!isRubricDomain(e.domain)) return { ok: false, error: `Unknown domain: ${String(e.domain)}.` }
    const domain = e.domain
    if (seen.has(domain)) return { ok: false, error: `${domain} appears twice.` }
    seen.add(domain)
    if (typeof e.observable !== 'boolean') return { ok: false, error: `${domain}: say whether it was observable.` }

    const note = e.note === undefined || e.note === null || e.note === '' ? null : e.note
    if (note !== null && (typeof note !== 'string' || note.length > NOTE_MAX)) return { ok: false, error: `${domain}: the note is at most ${NOTE_MAX} characters.` }
    if (e.uncertain !== undefined && typeof e.uncertain !== 'boolean') return { ok: false, error: `${domain}: uncertain must be true or false.` }

    const refsRaw = e.turnRefs === undefined ? [] : e.turnRefs
    if (!Array.isArray(refsRaw) || !refsRaw.every(n => Number.isInteger(n) && n >= 0)) return { ok: false, error: `${domain}: turn references must be whole numbers.` }
    const turnRefs = [...new Set(refsRaw as number[])].sort((a, b) => a - b)
    if (known && turnRefs.some(n => !known.has(n))) return { ok: false, error: `${domain}: a turn reference is not in this case.` }

    if (e.observable) {
      if (typeof e.score !== 'number' || !Number.isInteger(e.score) || e.score < 1 || e.score > 5) return { ok: false, error: `${domain}: score 1 to 5, or mark it not observable.` }
      if (turnRefs.length < 1) return { ok: false, error: `${domain}: point to at least one turn that shows it.` }
      // Rubric hrr-1.0.0 section 1: "A 5 needs at least two separate pieces of evidence."
      if (e.score === 5 && turnRefs.length < 2) return { ok: false, error: `${domain}: a 5 needs at least two turns as evidence; otherwise give a 4.` }
      items.push({ domain, observable: true, score: e.score, turnRefs, note, uncertain: e.uncertain === true })
    } else {
      if (e.score !== undefined && e.score !== null) return { ok: false, error: `${domain}: a domain that was not observable has no score.` }
      items.push({ domain, observable: false, score: null, turnRefs, note, uncertain: e.uncertain === true })
    }
  }

  if (opts.submit && !unscorable) {
    const missing = RUBRIC_DOMAINS.filter(d => !seen.has(d))
    if (missing.length) return { ok: false, error: `Answer every domain before submitting. Missing: ${missing.join(', ')}.` }
  }
  return { ok: true, value: { unscorable, items } }
}
