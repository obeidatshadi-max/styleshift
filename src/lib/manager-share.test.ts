import { describe, expect, it } from 'vitest'
import { debriefForManager, parseShareRequest, simulationForManager } from './manager-share'

const id = '11111111-1111-4111-8111-111111111111'

describe('parseShareRequest', () => {
  it('accepts a known kind, a uuid and a boolean', () => {
    expect(parseShareRequest({ kind: 'debrief', id, shared: true })).toEqual({ kind: 'debrief', id, shared: true })
    expect(parseShareRequest({ kind: 'simulation', id, shared: false })).toEqual({ kind: 'simulation', id, shared: false })
  })
  it('rejects anything else, including a truthy string for shared', () => {
    for (const bad of [null, 'x', {}, { kind: 'roleplay', id, shared: true }, { kind: 'debrief', id: 'nope', shared: true },
      { kind: 'debrief', id, shared: 'true' }, { kind: 'debrief', id }]) expect(parseShareRequest(bad)).toBeNull()
  })
})

describe('what a manager can see', () => {
  const row = { id, rep_id: 'rep-1', doctor_name: 'Dr. Example', created_at: '2026-11-03T08:00:00Z', shared_with_manager_at: '2026-11-03T09:00:00Z' }

  it('shows a debrief as its coaching report only, never the rep\'s own account', () => {
    const item = debriefForManager({
      ...row,
      result: { report: { summary: 'You asked about his patients.', priority: 'Open before pitching.', nextAction: 'Ask first.', hypothesis: 'He may feel unheard.', betterResponse: 'secret wording' }, promises: ['Send data'] },
    })!
    expect(item).toMatchObject({ kind: 'debrief', summary: 'You asked about his patients.', priority: 'Open before pitching.', nextStep: 'Ask first.' })
    const text = JSON.stringify(item)
    expect(text).not.toContain('secret wording')
    expect(text).not.toContain('He may feel unheard')
    expect(text).not.toContain('Send data')
    expect(Object.keys(item)).not.toContain('account')
  })

  it('returns nothing for a debrief without a usable summary', () => {
    expect(debriefForManager({ ...row, result: { report: { summary: '   ' } } })).toBeNull()
    expect(debriefForManager({ ...row, result: null })).toBeNull()
  })

  it('shows a simulation as summary and coaching priority only, never quotes or transcript', () => {
    const item = simulationForManager(row, 'Dr. Sim', {
      visitSummary: { summary: 'Short intro visit.', evidence: [{ quote: 'private quote' }] },
      coachingPriority: { behavior: 'Ask before pitching', successLooksLike: 'Customer states a need.', evidence: [{ quote: 'another private quote' }] },
    })!
    expect(item).toMatchObject({ kind: 'simulation', doctorName: 'Dr. Sim', summary: 'Short intro visit.', priority: 'Ask before pitching', nextStep: 'Customer states a need.' })
    expect(JSON.stringify(item)).not.toContain('private quote')
  })

  it('returns nothing for a simulation whose report is missing, and falls back to a generic doctor name', () => {
    expect(simulationForManager(row, null, null)).toBeNull()
    expect(simulationForManager(row, null, { visitSummary: { summary: 'ok' } })!.doctorName).toBe('AI doctor')
  })

  it('shortens very long text', () => {
    const item = debriefForManager({ ...row, result: { report: { summary: 'x'.repeat(2000) } } })!
    expect(item.summary.length).toBeLessThanOrEqual(600)
    expect(item.summary.endsWith('…')).toBe(true)
  })
})
