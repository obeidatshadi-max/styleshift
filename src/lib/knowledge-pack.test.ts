import { describe, expect, it } from 'vitest'
import { validateKnowledgePack } from '@/schemas/knowledge'
import { findProhibitedClaimHits, renderPromptBlock, selectForPrompt } from '@/lib/knowledge-pack'
import { containsPhrase, normalizeForMatch } from '@/lib/arabic-normalize'

const src = { title: 'Label', type: 'label', reference: 'sec 4.2' }
const raw = {
  name: 'Pack', productName: 'Examplestatin',
  items: [
    { id: 'f1', kind: 'efficacy', status: 'approved', text: { en: 'Lowered LDL by 40% in the pivotal trial.' }, sources: [src] },
    { id: 'f2', kind: 'dosing', status: 'draft', text: { en: 'Draft dosing text.' }, sources: [] },
    { id: 'm1', kind: 'approved_messaging', status: 'approved', text: { en: 'Once-daily convenience.' } },
    { id: 'c1', kind: 'coaching_note', status: 'approved', text: { en: 'Reps overclaim here.' } },
    { id: 'p1', kind: 'prohibited_claim', status: 'approved', text: { en: 'cures heart disease', ar: 'يشفي أمراض القلب' } },
    { id: 's1', kind: 'safety', status: 'approved', text: { ar: 'سلامة موثقة' }, sources: [src] },
  ],
}
const pack = () => { const r = validateKnowledgePack(raw); if (!r.ok) throw new Error(r.errors.join()); return r.value }

describe('validateKnowledgePack', () => {
  it('rejects an approved clinical fact without a source', () => {
    const res = validateKnowledgePack({ ...raw, items: [{ id: 'x', kind: 'efficacy', status: 'approved', text: { en: 'Claim' }, sources: [] }] })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.join()).toMatch(/needs at least one source/)
  })

  it('allows an unsourced DRAFT fact and unsourced company messaging', () => {
    expect(validateKnowledgePack({ ...raw, items: [{ id: 'x', kind: 'efficacy', status: 'draft', text: { en: 'Claim' } }, { id: 'y', kind: 'differentiator', status: 'approved', text: { en: 'Edge' } }] }).ok).toBe(true)
  })

  it('rejects duplicate ids, empty text and unknown kinds', () => {
    const res = validateKnowledgePack({ ...raw, items: [
      { id: 'a', kind: 'efficacy', text: { en: 'x' } }, { id: 'a', kind: 'nope', text: {} },
    ] })
    expect(res.ok).toBe(false)
  })
})

describe('selectForPrompt', () => {
  it('never returns drafts or retired items', () => {
    const sel = selectForPrompt(pack(), { audience: 'coach', lang: 'en' })
    expect(sel.items.map(i => i.id)).not.toContain('f2')
  })

  it('keeps the tiers apart by audience', () => {
    const doctor = selectForPrompt(pack(), { audience: 'doctor', lang: 'en' }).items
    expect(doctor.every(i => i.tier === 'approved_fact')).toBe(true)
    const analyst = selectForPrompt(pack(), { audience: 'analyst', lang: 'en' }).items.map(i => i.id)
    expect(analyst).toContain('m1')
    expect(analyst).not.toContain('c1')
    expect(selectForPrompt(pack(), { audience: 'coach', lang: 'en' }).items.map(i => i.id)).toContain('c1')
  })

  it('reports requested kinds that have no approved content instead of filling the gap', () => {
    const sel = selectForPrompt(pack(), { audience: 'doctor', lang: 'en', kinds: ['efficacy', 'dosing'] })
    expect(sel.unavailable).toEqual(['dosing'])
    expect(renderPromptBlock(sel)).toMatch(/NOT AVAILABLE in the approved pack: dosing/)
  })

  it('never auto-translates: an English-only item is absent from an Arabic request', () => {
    const sel = selectForPrompt(pack(), { audience: 'doctor', lang: 'ar', kinds: ['efficacy', 'safety'] })
    expect(sel.items.map(i => i.id)).toEqual(['s1'])
    expect(sel.unavailable).toEqual(['efficacy'])
    expect(sel.items[0].needsArabicReview).toBe(true)
  })

  it('carries source citations next to facts', () => {
    const block = renderPromptBlock(selectForPrompt(pack(), { audience: 'doctor', lang: 'en', kinds: ['efficacy'] }))
    expect(block).toMatch(/\[f1\].*source: Label — sec 4\.2/)
  })
})

describe('findProhibitedClaimHits', () => {
  it('flags a prohibited English claim as a whole phrase, case-insensitively', () => {
    expect(findProhibitedClaimHits('Honestly it Cures Heart Disease, doctor', pack(), 'en')).toEqual([{ itemId: 'p1', phrase: 'cures heart disease' }])
    expect(findProhibitedClaimHits('it procures heart diseases', pack(), 'en')).toEqual([])
  })

  it('flags an Arabic claim despite diacritics and spelling variants', () => {
    expect(findProhibitedClaimHits('هذا الدواء يَشْفِي أمراض القلب', pack(), 'ar')).toHaveLength(1)
  })
})

describe('arabic normalization', () => {
  it('folds alef, ya, ta marbuta and removes diacritics/tatweel', () => {
    expect(normalizeForMatch('أَحْمَدُ')).toBe(normalizeForMatch('احمد'))
    expect(normalizeForMatch('مدرســة')).toBe(normalizeForMatch('مدرسه'))
    expect(normalizeForMatch('على')).toBe(normalizeForMatch('علي'))
  })

  it('maps Iraqi letters and Arabic-Indic digits for matching only', () => {
    expect(normalizeForMatch('أگول')).toBe(normalizeForMatch('اكول')) // keyboard fallback for گ is ك; ق is deliberately NOT merged
    expect(normalizeForMatch('٥٠ ملغم')).toBe('50 ملغم')
  })

  it('matches whole words, not substrings', () => {
    expect(containsPhrase('كلش مهم', 'كلش')).toBe(true)
    expect(containsPhrase('كلشي مهم', 'كلش')).toBe(false)
  })
})
