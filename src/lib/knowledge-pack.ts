import { containsPhrase } from '@/lib/arabic-normalize'
import {
  TIER_BY_KIND, type ContentTier, type ItemKind, type KnowledgeItem, type KnowledgePack,
} from '@/schemas/knowledge'

/** Who is asking for content. Decides which tiers may be returned. */
export type KnowledgeAudience = 'doctor' | 'coach' | 'analyst'

/** The Doctor may challenge with facts but never sees company talking points or
 * coaching opinions; the Analyst judges messaging against facts and rules; only
 * the Coach sees coaching interpretation. */
const AUDIENCE_TIERS: Record<KnowledgeAudience, readonly ContentTier[]> = {
  doctor: ['approved_fact'],
  analyst: ['approved_fact', 'company_messaging'],
  coach: ['approved_fact', 'company_messaging', 'coaching_interpretation'],
}

export interface PromptItem {
  id: string
  kind: ItemKind
  tier: ContentTier
  text: string
  /** Short citations, e.g. "Label v3 — section 4.2". Empty only for non-fact tiers. */
  citations: string[]
  /** Set when the text is an Arabic string not yet checked by a native speaker. */
  needsArabicReview: boolean
}

export interface KnowledgeSelection {
  items: PromptItem[]
  /** Requested kinds that have no approved item for this audience/language — say "unavailable", never improvise. */
  unavailable: ItemKind[]
}

export interface SelectOptions {
  audience: KnowledgeAudience
  lang: 'en' | 'ar'
  /** Only these kinds; omit for everything the audience may see. */
  kinds?: readonly ItemKind[]
  /** Keep items whose topics intersect; items with no topics are kept (general). */
  topics?: readonly string[]
}

/**
 * The ONLY path by which pack content should reach a prompt. Draft and
 * retired items never leave; tiers are filtered by audience; an item with no
 * text in the requested language is skipped (never auto-translated), which
 * surfaces as `unavailable` when nothing else covers that kind.
 */
export function selectForPrompt(pack: KnowledgePack, opts: SelectOptions): KnowledgeSelection {
  const tiers = AUDIENCE_TIERS[opts.audience]
  const wanted = opts.kinds ?? (Object.keys(TIER_BY_KIND) as ItemKind[]).filter(k => tiers.includes(TIER_BY_KIND[k]))
  const topics = opts.topics?.map(t => t.toLowerCase())
  const items: PromptItem[] = []
  for (const it of pack.items) {
    if (it.status !== 'approved') continue
    const tier = TIER_BY_KIND[it.kind]
    if (!tiers.includes(tier) || !wanted.includes(it.kind)) continue
    if (topics?.length && it.topics.length && !it.topics.some(t => topics.includes(t))) continue
    const text = it.text[opts.lang]
    if (!text) continue
    items.push({
      id: it.id, kind: it.kind, tier, text,
      citations: it.sources.map(s => `${s.title} — ${s.reference}`),
      needsArabicReview: opts.lang === 'ar' && !it.arabicReviewed,
    })
  }
  const covered = new Set(items.map(i => i.kind))
  const unavailable = wanted.filter(k => tiers.includes(TIER_BY_KIND[k]) && !covered.has(k))
  return { items, unavailable }
}

/** Renders a selection as a prompt block with the tiers visibly separated and
 * an explicit instruction for gaps. Returns '' when there is nothing at all. */
export function renderPromptBlock(sel: KnowledgeSelection): string {
  const byTier = (tier: ContentTier) => sel.items.filter(i => i.tier === tier)
  const section = (title: string, tier: ContentTier) => {
    const rows = byTier(tier)
    if (!rows.length) return ''
    return `${title}\n${rows.map(i => `- [${i.id}] (${i.kind}) ${i.text}${i.citations.length ? ` — source: ${i.citations.join('; ')}` : ''}`).join('\n')}`
  }
  const parts = [
    section('APPROVED FACTS (cite by id; do not go beyond them):', 'approved_fact'),
    section('COMPANY MESSAGING (approved wording and rules; not clinical proof):', 'company_messaging'),
    section('COACHING NOTES (interpretation, not fact):', 'coaching_interpretation'),
  ].filter(Boolean)
  if (sel.unavailable.length) {
    parts.push(`NOT AVAILABLE in the approved pack: ${sel.unavailable.join(', ')}. If asked about these, say the information is not available. Never invent clinical data.`)
  }
  return parts.join('\n\n')
}

export interface ProhibitedHit { itemId: string; phrase: string }

/** Deterministic check of free text (a rep's turn) against the pack's approved
 * prohibited claims. A hit is a REVIEW SIGNAL for the Clinical/message feedback
 * layer, not a verdict: the analyst/coach decides in context. */
export function findProhibitedClaimHits(text: string, pack: KnowledgePack, lang: 'en' | 'ar'): ProhibitedHit[] {
  const hits: ProhibitedHit[] = []
  for (const it of pack.items as KnowledgeItem[]) {
    if (it.kind !== 'prohibited_claim' || it.status !== 'approved') continue
    const phrase = it.text[lang]
    if (phrase && containsPhrase(text, phrase)) hits.push({ itemId: it.id, phrase })
  }
  return hits
}
