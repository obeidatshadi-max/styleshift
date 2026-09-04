import { describe, it, expect } from 'vitest'
import { DRIVE, buildHistoryContext } from './doctor-context'
import type { DoctorVisit } from '@/types/game'

function visit(overrides: Partial<DoctorVisit>): DoctorVisit {
  return {
    id: 'v1', doctor_id: 'd1', rep_id: 'r1', source: 'manual',
    objection_raised: null, promise_made: null, what_worked: null, note: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('DRIVE', () => {
  it('has copy for all four styles', () => {
    expect(Object.keys(DRIVE).sort()).toEqual(['amiable', 'analytical', 'driver', 'expressive'])
  })
})

describe('buildHistoryContext', () => {
  it('returns empty string for no visits', () => {
    expect(buildHistoryContext([])).toBe('')
  })

  it('formats objection/promise/what-worked fields into a bulleted context block', () => {
    const ctx = buildHistoryContext([
      visit({ objection_raised: 'too expensive', promise_made: 'sample pack next visit', what_worked: 'led with safety data' }),
    ])
    expect(ctx).toContain('objection: "too expensive"')
    expect(ctx).toContain('rep promised: "sample pack next visit"')
    expect(ctx).toContain('worked well: "led with safety data"')
    expect(ctx).toContain('Past visit history with this doctor')
  })

  it('falls back to the general note when no structured fields are set', () => {
    const ctx = buildHistoryContext([visit({ note: 'quick hallway chat, no real objection' })])
    expect(ctx).toContain('quick hallway chat, no real objection')
  })

  it('only uses the 5 most recent visits', () => {
    const visits = Array.from({ length: 8 }, (_, i) => visit({ objection_raised: `objection-${i}` }))
    const ctx = buildHistoryContext(visits)
    expect(ctx).toContain('objection-0')
    expect(ctx).toContain('objection-4')
    expect(ctx).not.toContain('objection-5')
  })

  it('returns empty string when every visit has no usable fields', () => {
    expect(buildHistoryContext([visit({})])).toBe('')
  })
})
