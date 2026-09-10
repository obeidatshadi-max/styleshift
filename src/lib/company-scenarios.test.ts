import { describe, it, expect } from 'vitest'
import { validateScenarioInput, toPlayableScenario } from './company-scenarios'
import type { CompanyScenario, CompanyScenarioInput } from '@/types/game'

function validInput(overrides: Partial<CompanyScenarioInput> = {}): CompanyScenarioInput {
  return {
    style: 'driver',
    name: 'Dr. Rossi — evidence objection',
    crisis: '"Show me the trial data or I\'m not listening."',
    q: 'How do you respond?',
    opts: [
      { t: 'Lead with the phase III topline and offer the full paper.', r: 'win', why: 'Matches an analytical/driver ask for hard evidence.' },
      { t: 'Reassure them it works, most doctors are happy.', r: 'escalate', why: 'Anecdote reads as evasive to a data-driven doctor.' },
    ],
    ...overrides,
  }
}

describe('validateScenarioInput', () => {
  it('accepts a well-formed draft', () => {
    expect(validateScenarioInput(validInput())).toBeNull()
  })

  it('rejects a missing name', () => {
    expect(validateScenarioInput(validInput({ name: '' }))).toMatch(/name/i)
  })

  it('rejects fewer than two options', () => {
    expect(validateScenarioInput(validInput({ opts: [validInput().opts[0]] }))).toMatch(/two response options/i)
  })

  it('rejects a draft with no winning option', () => {
    const opts = validInput().opts.map(o => ({ ...o, r: 'escalate' as const }))
    expect(validateScenarioInput(validInput({ opts }))).toMatch(/winning response/i)
  })

  it('rejects an option missing its rationale', () => {
    const opts = [validInput().opts[0], { t: 'Change subject', r: 'escalate' as const, why: '' }]
    expect(validateScenarioInput(validInput({ opts }))).toMatch(/rationale/i)
  })

  it('rejects an invalid style', () => {
    // @ts-expect-error deliberately invalid for the test
    expect(validateScenarioInput(validInput({ style: 'friendly' }))).toMatch(/style/i)
  })
})

describe('toPlayableScenario', () => {
  it('drops the authoring/approval metadata, keeps the playable fields', () => {
    const row: CompanyScenario = {
      id: 'cs1', company_id: 'co1', created_by: 'mgr1',
      style: 'analytical', name: 'Dr. Kim', crisis: 'crisis text', q: 'question text',
      opts: validInput().opts,
      status: 'approved', approved_by: 'mgr1', approved_at: '2026-09-10T00:00:00Z', created_at: '2026-09-01T00:00:00Z',
    }
    expect(toPlayableScenario(row)).toEqual({
      name: 'Dr. Kim', style: 'analytical', crisis: 'crisis text', q: 'question text', opts: validInput().opts,
    })
  })
})
