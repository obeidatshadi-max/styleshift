import { behaviorIndex, defaultScoringConfig } from '@/scoring/config'
import { CAPABILITY_DIMENSIONS, type CapabilityDimension } from '@/scoring/capability'
import { asRecord, finish, Reader, type LocalText, type ValidationResult } from '@/schemas/validation'

/**
 * A company's selling methodology as CONFIGURATION over StyleShift's fixed
 * behavior ontology (the behavior keys in scoring.config.json). Customers
 * rename, group and weight behaviors; they never get their own detectors, so
 * analytics are written once against ontology keys.
 */

export interface MethodologyStage {
  id: string
  order: number
  name: LocalText
  description: LocalText
  optional: boolean
  /** Ontology behavior keys that show this stage was done well. */
  expectedBehaviors: string[]
  /** Ontology behavior keys that count against this stage. */
  prohibitedBehaviors: string[]
  /** Plain-language evidence the company wants to see (shown to coach/analyst). */
  requiredEvidence: string[]
  /** Relative weight for stage-level reporting (>= 0). */
  weight: number
  coachingPrompts: LocalText[]
}

export interface Methodology {
  name: string
  version: number
  stages: MethodologyStage[]
  /** Client-facing label per ontology behavior, e.g. specifying_question -> "Clarify the Need". */
  terminology: Record<string, LocalText>
  /** Client-facing name per capability dimension, e.g. discovery -> "Deep Discovery". */
  dimensionTerms: Partial<Record<CapabilityDimension, LocalText>>
}

export function validateMethodology(input: unknown): ValidationResult<Methodology> {
  const rec = asRecord(input)
  if (!rec) return { ok: false, errors: ['methodology must be an object'] }
  const r = new Reader(rec)
  const catalog = behaviorIndex(defaultScoringConfig)
  const keyList = (sub: Reader, key: string) => {
    const keys = sub.strList(key, { max: 30, itemMax: 80 })
    const unknown = keys.filter(k => !catalog.has(k))
    if (unknown.length) sub.fail(key, `not in the behavior ontology: ${unknown.join(', ')}`)
    return keys
  }

  const stages: MethodologyStage[] = []
  const rawStages = r.raw('stages')
  if (!Array.isArray(rawStages) || rawStages.length === 0) r.fail('stages', 'needs at least one stage')
  else {
    const ids = new Set<string>(), orders = new Set<number>()
    rawStages.forEach((raw, i) => {
      const s = new Reader(asRecord(raw) ?? {}, `stages[${i}]`)
      const id = s.str('id', { max: 60 })
      if (ids.has(id)) s.fail('id', `duplicate stage id "${id}"`)
      ids.add(id)
      const order = s.int('order', 1, 100)
      if (orders.has(order)) s.fail('order', `duplicate order ${order}`)
      orders.add(order)
      const expected = keyList(s, 'expectedBehaviors')
      const prohibited = keyList(s, 'prohibitedBehaviors')
      if (expected.some(k => prohibited.includes(k))) s.fail('prohibitedBehaviors', 'a behavior cannot be both expected and prohibited in the same stage')
      const prompts = Array.isArray(s.raw('coachingPrompts')) ? (s.raw('coachingPrompts') as unknown[]).map((p, j) => {
        const holder = new Reader({ p }, `stages[${i}].coachingPrompts[${j}]`)
        const text = holder.localText('p', { required: true, max: 400 })
        s.errors.push(...holder.errors.map(e => e.replace(/\.p:/, ':')))
        return text
      }) : []
      stages.push({
        id, order, name: s.localText('name', { required: true, max: 80 }), description: s.localText('description', { max: 500 }),
        optional: s.bool('optional', false), expectedBehaviors: expected, prohibitedBehaviors: prohibited,
        requiredEvidence: s.strList('requiredEvidence', { max: 10, itemMax: 300 }),
        weight: s.num('weight', 0, 100, 1), coachingPrompts: prompts,
      })
      r.errors.push(...s.errors)
    })
    if (stages.length && !stages.some(s => s.weight > 0)) r.fail('stages', 'at least one stage needs weight > 0')
    if (stages.length && stages.every(s => s.optional)) r.fail('stages', 'at least one stage must be required')
  }

  const terminology: Record<string, LocalText> = {}
  const rawTerms = asRecord(r.raw('terminology')) ?? {}
  for (const [key, val] of Object.entries(rawTerms)) {
    if (!catalog.has(key)) { r.fail('terminology', `"${key}" is not in the behavior ontology`); continue }
    const holder = new Reader({ v: val }, `terminology.${key}`)
    const text = holder.localText('v', { required: true, max: 80 })
    r.errors.push(...holder.errors.map(e => e.replace(/\.v:/, ':')))
    terminology[key] = text
  }

  const dimensionTerms: Partial<Record<CapabilityDimension, LocalText>> = {}
  const rawDims = asRecord(r.raw('dimensionTerms')) ?? {}
  for (const [key, val] of Object.entries(rawDims)) {
    if (!(CAPABILITY_DIMENSIONS as readonly string[]).includes(key)) { r.fail('dimensionTerms', `"${key}" is not a capability dimension`); continue }
    const holder = new Reader({ v: val }, `dimensionTerms.${key}`)
    const text = holder.localText('v', { required: true, max: 80 })
    r.errors.push(...holder.errors.map(e => e.replace(/[.]v:/, ':')))
    dimensionTerms[key as CapabilityDimension] = text
  }

  const value: Methodology = {
    name: r.str('name', { max: 120 }), version: r.int('version', 1, 100000, 1),
    stages: stages.sort((a, b) => a.order - b.order), terminology, dimensionTerms,
  }
  return finish(r, value)
}

/** Client-facing label for an ontology behavior. Falls back to the ontology
 * key humanized — never to another customer's wording. */
export function termFor(m: Pick<Methodology, 'terminology'>, behavior: string, lang: 'en' | 'ar'): string {
  const t = m.terminology[behavior]
  return t?.[lang] ?? t?.en ?? behavior.replace(/_/g, ' ')
}

export interface StageCoverage {
  stageId: string
  expectedSeen: string[]
  expectedMissing: string[]
  prohibitedSeen: string[]
}

/** Maps behaviors observed in ANY session (ontology keys) onto a company's
 * stages. This is the whole "per-customer analytics" story: one detector set,
 * many views. */
export function stageCoverage(m: Pick<Methodology, 'stages'>, observed: Iterable<string>): StageCoverage[] {
  const seen = new Set(observed)
  return m.stages.map(s => ({
    stageId: s.id,
    expectedSeen: s.expectedBehaviors.filter(k => seen.has(k)),
    expectedMissing: s.expectedBehaviors.filter(k => !seen.has(k)),
    prohibitedSeen: s.prohibitedBehaviors.filter(k => seen.has(k)),
  }))
}

/** Client-facing name for a capability dimension, or the given default (the app's own wording). */
export function dimensionTerm(m: Pick<Methodology, 'dimensionTerms'> | null | undefined, dimension: CapabilityDimension, lang: 'en' | 'ar', fallback: string): string {
  const t = m?.dimensionTerms?.[dimension]
  return t?.[lang] ?? t?.en ?? fallback
}

export type StageStatus = 'covered' | 'partial' | 'not_seen' | 'needs_attention'

/** One line per stage for a rep: what their recent practice showed against the company's stage. Descriptive only. */
export function stageStatus(c: StageCoverage): StageStatus {
  if (c.prohibitedSeen.length) return 'needs_attention'
  if (c.expectedSeen.length === 0) return 'not_seen'
  return c.expectedMissing.length === 0 ? 'covered' : 'partial'
}
