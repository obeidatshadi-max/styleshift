import type { ItemKind, ItemStatus, SourceType } from '@/schemas/knowledge'
import type { KnowledgePackRecord } from '@/lib/knowledge-packs'

export interface SourceForm { title: string; type: SourceType; reference: string; version: string }
export interface ItemForm {
  id: string; kind: ItemKind; textEn: string; textAr: string; topics: string
  status: ItemStatus; arabicReviewed: boolean; sources: SourceForm[]
}
export interface PackForm { name: string; productName: string; indication: string; version: number; items: ItemForm[] }

export const BLANK_PACK: PackForm = { name: '', productName: '', indication: '', version: 1, items: [] }
export const newSource = (): SourceForm => ({ title: '', type: 'label', reference: '', version: '' })
export const newItem = (n: number): ItemForm => ({
  id: `item-${n}`, kind: 'indication', textEn: '', textAr: '', topics: '', status: 'draft', arabicReviewed: false, sources: [],
})
export const nextItemNumber = (items: ItemForm[]) =>
  items.reduce((n, i) => Math.max(n, Number(/^item-(\d+)$/.exec(i.id)?.[1] ?? 0)), 0) + 1

const text = (en: string, ar: string) => ({ ...(en.trim() ? { en: en.trim() } : {}), ...(ar.trim() ? { ar: ar.trim() } : {}) })

export function toPayload(f: PackForm) {
  return {
    name: f.name.trim(), productName: f.productName.trim(), indication: f.indication.trim() || null, version: f.version,
    items: f.items.map(i => ({
      id: i.id, kind: i.kind, status: i.status, text: text(i.textEn, i.textAr), arabicReviewed: i.arabicReviewed,
      topics: i.topics.split(',').map(t => t.trim().toLowerCase()).filter(Boolean),
      sources: i.sources.map(s => ({
        title: s.title.trim(), type: s.type, reference: s.reference.trim(), version: s.version.trim() || null, externalSystem: null, externalId: null,
      })),
    })),
  }
}

export function fromRecord(r: Pick<KnowledgePackRecord, 'name' | 'productName' | 'indication' | 'version' | 'items'>): PackForm {
  return {
    name: r.name, productName: r.productName, indication: r.indication ?? '', version: r.version,
    items: r.items.map(i => ({
      id: i.id, kind: i.kind, textEn: i.text.en ?? '', textAr: i.text.ar ?? '', topics: i.topics.join(', '), status: i.status,
      arabicReviewed: i.arabicReviewed,
      sources: i.sources.map(s => ({ title: s.title, type: s.type, reference: s.reference, version: s.version ?? '' })),
    })),
  }
}
