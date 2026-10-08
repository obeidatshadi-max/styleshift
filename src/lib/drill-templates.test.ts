import { describe, expect, it } from 'vitest'
import { DRILL_TEMPLATES, drillRegistry } from '@/lib/drill-templates'
import { DRILL_TYPES } from '@/schemas/drill'
import { assessDrillResponse, drillSession, observedBehaviors } from '@/lib/drill-run'
import { attemptsToday, historyByDrill } from '@/lib/drill-attempts'
import type { Observation } from '@/schemas/observation'

const obs = (behavior: string, confidence = 0.9, quote = 'my words'): Observation => ({
  competency: 'discovery', behavior, observation: 'x', evidence: [{ turnIndex: 1, role: 'rep', quote }], timestamp: null, direction: 'positive', confidence,
})

describe('shipped drill library', () => {
  it('has exactly one validated drill for each of the 15 types', () => {
    expect(DRILL_TEMPLATES).toHaveLength(15)
    expect(drillRegistry.list().map(t => t.type).sort()).toEqual([...DRILL_TYPES].sort())
  })

  it('is English-only and flags every drill as awaiting native Arabic review', () => {
    for (const t of drillRegistry.list()) {
      expect(t.languages).toEqual(['en'])
      expect(t.arabicReviewed).toBe(false)
      expect(t.durationMin).toBeGreaterThanOrEqual(2)
      expect(t.durationMin).toBeLessThanOrEqual(5)
      expect(t.hint.en).toBeTruthy()
    }
  })

  it('contains no numeric clinical figures or drug names in doctor lines', () => {
    for (const t of drillRegistry.list()) expect(t.prompt.en).not.toMatch(/\d/)
  })

  it('always has at least one required criterion', () => {
    for (const t of drillRegistry.list()) expect(t.criteria.some(c => c.required)).toBe(true)
  })
})

describe('drill run helpers', () => {
  const t = drillRegistry.get('precision-questioning-1')!

  it('builds a two-turn session the analyst can read (doctor line without the "says" wrapper)', () => {
    const s = drillSession(t, '  Which patients?  ', 'en', 'rep-1')
    expect(s.status).toBe('abandoned')
    expect(s.transcript.map(x => [x.turnIndex, x.role, x.text])).toEqual([[0, 'doctor', 'Results with the current treatment are mixed.'], [1, 'rep', 'Which patients?']])
    expect(s.socialStyle.dominant).toBe('analytical')
  })

  it('ignores low-confidence observations, like the scorer does', () => {
    expect(observedBehaviors([obs('clarification', 0.2), obs('open_question', 0.8)])).toEqual(['open_question'])
  })

  it('shows the rep\'s own quote only for criteria that were met', () => {
    const { result, feedback } = assessDrillResponse(t, [obs('clarification', 0.9, 'which patients')], 'en')
    expect(result).toMatchObject({ score: 75, passed: true }) // clarification (2) + avoided leading_question (1) of 4 total weight, required met
    const met = feedback.find(f => f.behavior === 'clarification')!
    expect(met).toMatchObject({ met: true, quote: 'which patients' })
    expect(feedback.find(f => f.behavior === 'open_question')).toMatchObject({ met: false, quote: null })
  })
})

describe('attempt history helpers', () => {
  const a = (drillId: string, at: string, score: number | null, passed = false) => ({ drillId, drillVersion: 1, repId: 'r', attemptNo: 1, at, observedBehaviors: [], score, passed, lang: 'en' as const })

  it('counts only today\'s attempts at that drill (UTC)', () => {
    const now = new Date('2026-10-08T12:00:00Z')
    const list = [a('x', '2026-10-08T00:00:01Z', 10), a('x', '2026-10-07T23:59:59Z', 10), a('y', '2026-10-08T05:00:00Z', 10)]
    expect(attemptsToday(list, 'x', now)).toBe(1)
  })

  it('groups history per drill', () => {
    const h = historyByDrill([a('x', '2026-10-01T00:00:00Z', 40), a('x', '2026-10-02T00:00:00Z', 90, true), a('y', '2026-10-02T00:00:00Z', null)])
    expect(h.x).toMatchObject({ attempts: 2, completions: 1, personalBest: 90 })
    expect(h.y).toMatchObject({ attempts: 1, personalBest: null })
  })
})
