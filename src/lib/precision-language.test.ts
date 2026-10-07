import { describe, it, expect } from 'vitest'
import { VAGUE_PATTERNS, PATTERN_GUIDE, TECHNIQUE_NOTES, isVaguePattern, patternPromptList } from './precision-language'
import { behaviorIndex, defaultScoringConfig } from '@/scoring/config'

describe('precision-language patterns', () => {
  it('has guidance with a book page for every pattern', () => {
    for (const p of VAGUE_PATTERNS) {
      expect(PATTERN_GUIDE[p].page).toMatch(/^pp?\. \d/)
      expect(PATTERN_GUIDE[p].question.length).toBeGreaterThan(5)
    }
  })
  it('validates pattern keys', () => {
    expect(isVaguePattern('nominalization')).toBe(true)
    expect(isVaguePattern('mind_reading')).toBe(false)
    expect(isVaguePattern(3)).toBe(false)
  })
  it('lists every pattern in the prompt list', () => {
    const list = patternPromptList()
    for (const p of VAGUE_PATTERNS) expect(list).toContain(`"${p}"`)
  })
  it('only has technique notes for behaviors that exist in the scoring catalog, each citing the book', () => {
    const catalog = behaviorIndex(defaultScoringConfig)
    for (const [behavior, note] of Object.entries(TECHNIQUE_NOTES)) {
      expect(catalog.has(behavior), behavior).toBe(true)
      expect(note).toMatch(/Structure of Magic, pp?\. \d/)
    }
  })
})

describe('precision-questioning scoring behaviors', () => {
  const b = (c: keyof typeof defaultScoringConfig.competencies, k: string) => defaultScoringConfig.competencies[c].behaviors[k]
  it('registers the new behaviors as proposed, with the expected sign', () => {
    expect(b('questioning', 'specifying_question').points).toBeGreaterThan(0)
    expect(b('questioning', 'what_stops_question').points).toBeGreaterThan(0)
    expect(b('active_listening', 'checked_interpretation').points).toBeGreaterThan(0)
    expect(b('discovery', 'accepted_vague_objection').points).toBeLessThan(0)
    for (const [c, k] of [['questioning', 'specifying_question'], ['questioning', 'what_stops_question'], ['active_listening', 'checked_interpretation'], ['discovery', 'accepted_vague_objection']] as const) {
      expect(b(c, k).source).toBe('proposed')
    }
  })
})
