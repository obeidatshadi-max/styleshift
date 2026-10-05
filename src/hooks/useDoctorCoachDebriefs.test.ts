// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useDoctorCoachDebriefs } from './useDoctorCoachDebriefs'

const db = vi.hoisted(() => ({ user: { id: 'rep-1' } as { id: string } | null, rows: [] as unknown[], calls: [] as [string, ...unknown[]][] }))
vi.mock('@/lib/supabase-browser', () => ({
  createClient: () => {
    const query = {
      select: (columns: string) => { db.calls.push(['select', columns]); return query },
      eq: (column: string, value: unknown) => { db.calls.push(['eq', column, value]); return query },
      order: async (column: string, options: unknown) => { db.calls.push(['order', column, options]); return { data: db.rows } },
    }
    return {
      auth: { getUser: async () => ({ data: { user: db.user } }) },
      from: (table: string) => { db.calls.push(['from', table]); return query },
    }
  },
}))
afterEach(() => { db.user = { id: 'rep-1' }; db.rows = []; db.calls = [] })

describe('useDoctorCoachDebriefs', () => {
  it('lists this doctor\'s debriefs for this rep, newest first', async () => {
    db.rows = [
      { id: 'b', created_at: '2026-10-04T10:00:00Z', objective: 'Agree a follow-up', nextAction: 'Ask for a time', visitDate: null },
      { id: 'a', created_at: '2026-10-03T10:00:00Z', objective: null, nextAction: null },
    ]
    const { result } = renderHook(() => useDoctorCoachDebriefs('doc-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.debriefs).toEqual([
      { id: 'b', created_at: '2026-10-04T10:00:00Z', objective: 'Agree a follow-up', nextAction: 'Ask for a time', visitDate: null },
      { id: 'a', created_at: '2026-10-03T10:00:00Z', objective: '', nextAction: '', visitDate: null },
    ])
    expect(db.calls).toContainEqual(['from', 'coach_debriefs'])
    expect(db.calls).toContainEqual(['eq', 'input->>doctorId', 'doc-1'])
    expect(db.calls).toContainEqual(['eq', 'rep_id', 'rep-1'])
    expect(db.calls).toContainEqual(['order', 'created_at', { ascending: false }])
  })

  it('reads the objective and next action by JSON path, not the rep\'s whole account', async () => {
    renderHook(() => useDoctorCoachDebriefs('doc-1'))
    await waitFor(() => expect(db.calls.some(call => call[0] === 'select')).toBe(true))
    const select = String(db.calls.find(call => call[0] === 'select')?.[1])
    expect(select).toContain('input->>objective')
    expect(select).toContain('result->report->>nextAction')
    expect(select).not.toContain('account')
    expect(select).not.toMatch(/(^|,\s*)(input|result)(\s*,|$)/)
  })

  it('returns nothing, without querying, when nobody is signed in', async () => {
    db.user = null
    const { result } = renderHook(() => useDoctorCoachDebriefs('doc-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.debriefs).toEqual([])
    expect(db.calls.some(call => call[0] === 'from')).toBe(false)
  })
})
