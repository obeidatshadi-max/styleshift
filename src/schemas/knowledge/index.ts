import { asRecord, finish, Reader, type LocalText, type ValidationResult } from '@/schemas/validation'

/**
 * Product / clinical knowledge pack.
 *
 * Three content tiers are kept apart and the tier is DERIVED from the item
 * kind, never chosen freely, so an editor cannot file a coaching opinion as a
 * clinical fact:
 *   approved_fact           — clinical content that must be traceable to a source
 *   company_messaging       — what the company wants said (approved wording, rules)
 *   coaching_interpretation — internal notes on how to coach; never sent to the Doctor
 */

export const CONTENT_TIERS = ['approved_fact', 'company_messaging', 'coaching_interpretation'] as const
export type ContentTier = typeof CONTENT_TIERS[number]

export const ITEM_KINDS = [
  'indication', 'target_patient', 'mechanism', 'efficacy', 'safety', 'dosing', 'key_study', 'approved_claim',
  'competitor_comparison',
  'approved_messaging', 'differentiator', 'objection', 'objection_response', 'prohibited_claim', 'disclaimer',
  'coaching_note',
] as const
export type ItemKind = typeof ITEM_KINDS[number]

export const TIER_BY_KIND: Record<ItemKind, ContentTier> = {
  indication: 'approved_fact', target_patient: 'approved_fact', mechanism: 'approved_fact', efficacy: 'approved_fact',
  safety: 'approved_fact', dosing: 'approved_fact', key_study: 'approved_fact', approved_claim: 'approved_fact',
  competitor_comparison: 'approved_fact',
  approved_messaging: 'company_messaging', differentiator: 'company_messaging', objection: 'company_messaging',
  objection_response: 'company_messaging', prohibited_claim: 'company_messaging', disclaimer: 'company_messaging',
  coaching_note: 'coaching_interpretation',
}

export const SOURCE_TYPES = ['label', 'study', 'guideline', 'internal_doc', 'repository'] as const
export type SourceType = typeof SOURCE_TYPES[number]

/** Where an item came from. `externalSystem`/`externalId` are the hook for a
 * later Veeva / document-repository sync (read-only reference, no live link now). */
export interface KnowledgeSource {
  title: string
  type: SourceType
  /** Citation, page, section or URL as a human would quote it. */
  reference: string
  version: string | null
  externalSystem: string | null
  externalId: string | null
}

export const ITEM_STATUSES = ['draft', 'approved', 'retired'] as const
export type ItemStatus = typeof ITEM_STATUSES[number]

export interface KnowledgeItem {
  id: string
  kind: ItemKind
  text: LocalText
  sources: KnowledgeSource[]
  status: ItemStatus
  /** Arabic wording written/checked by a native speaker. False = flag for review. */
  arabicReviewed: boolean
  /** Free tags used for retrieval (e.g. "renal", "price", "head-to-head"). */
  topics: string[]
}

export interface KnowledgePack {
  name: string
  productName: string
  indication: string | null
  items: KnowledgeItem[]
  version: number
}

function readSource(r: Reader, raw: unknown, i: number, key: string): KnowledgeSource | null {
  const rec = asRecord(raw)
  if (!rec) { r.fail(`${key}[${i}]`, 'must be an object'); return null }
  const s = new Reader(rec, `${key}[${i}]`)
  const out: KnowledgeSource = {
    title: s.str('title', { max: 200 }),
    type: s.oneOf('type', SOURCE_TYPES),
    reference: s.str('reference', { max: 400 }),
    version: s.optStr('version', { max: 60 }),
    externalSystem: s.optStr('externalSystem', { max: 60 }),
    externalId: s.optStr('externalId', { max: 120 }),
  }
  r.errors.push(...s.errors)
  return out
}

export function validateKnowledgePack(input: unknown): ValidationResult<KnowledgePack> {
  const rec = asRecord(input)
  if (!rec) return { ok: false, errors: ['knowledge pack must be an object'] }
  const r = new Reader(rec)
  const items: KnowledgeItem[] = []
  const rawItems = r.raw('items')
  if (!Array.isArray(rawItems)) r.fail('items', 'must be a list')
  else {
    const ids = new Set<string>()
    rawItems.forEach((raw, i) => {
      const irec = asRecord(raw)
      if (!irec) { r.fail(`items[${i}]`, 'must be an object'); return }
      const ir = new Reader(irec, `items[${i}]`)
      const id = ir.str('id', { max: 64 })
      if (id && ids.has(id)) ir.fail('id', `duplicate id "${id}"`)
      ids.add(id)
      const kind = ir.oneOf('kind', ITEM_KINDS)
      const status = ir.oneOf('status', ITEM_STATUSES, 'draft')
      const text = ir.localText('text', { required: true, max: 2000 })
      const rawSources = irec.sources
      const sources: KnowledgeSource[] = []
      if (Array.isArray(rawSources)) rawSources.forEach((s, j) => { const src = readSource(ir, s, j, 'sources'); if (src) sources.push(src) })
      else if (rawSources !== undefined) ir.fail('sources', 'must be a list')
      // Clinical facts are only usable if traceable. A draft may be incomplete; an approved one may not.
      if (TIER_BY_KIND[kind] === 'approved_fact' && status === 'approved' && sources.length === 0) {
        ir.fail('sources', 'an approved clinical fact needs at least one source')
      }
      items.push({
        id, kind, text, sources, status,
        arabicReviewed: ir.bool('arabicReviewed', false),
        topics: ir.strList('topics', { max: 12, itemMax: 40 }).map(t => t.toLowerCase()),
      })
      r.errors.push(...ir.errors)
    })
  }
  const value: KnowledgePack = {
    name: r.str('name', { max: 120 }),
    productName: r.str('productName', { max: 120 }),
    indication: r.optStr('indication', { max: 300 }),
    items,
    version: r.int('version', 1, 100000, 1),
  }
  return finish(r, value)
}
