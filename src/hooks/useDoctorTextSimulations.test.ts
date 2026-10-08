// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useDoctorTextSimulations } from './useDoctorTextSimulations'

const db = vi.hoisted(() => ({ user: { id: 'rep-1' } as { id: string } | null, rows: [] as unknown[], calls: [] as [string, ...unknown[]][] }))
vi.mock('@/lib/supabase-browser', () => ({
  createClient: () => {
    const query = {
      select: (columns: string) => { db.calls.push(['select', columns]); return query },
      eq: (column: string, value: unknown) => { db.calls.push(['eq', column, value]); return query },
      neq: (column: string, value: unknown) => { db.calls.push(['neq', column, value]); return query },
      order: async (column: string, options: unknown) => { db.calls.push(['order', column, options]); return { data: db.rows } },
    }
    return {
      auth: { getUser: async () => ({ data: { user: db.user } }) },
      from: (table: string) => { db.calls.push(['from', table]); return query },
    }
  },
}))
afterEach(() => { db.user = { id: 'rep-1' }; db.rows = []; db.calls = [] })

describe('useDoctorTextSimulations', () => {
  it('lists finished simulations for this doctor and rep, newest first', async () => {
    db.rows = [
      { id: 'b', created_at: '2026-10-04T10:00:00Z', overall: 61.6, transcript: [{ role: 'doctor' }, { role: 'rep' }, { role: 'doctor' }, { role: 'rep' }] },
      { id: 'a', created_at: '2026-10-03T10:00:00Z', overall: null, transcript: null },
    ]
    const { result } = renderHook(() => useDoctorTextSimulations('doc-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sims).toEqual([
      { id: 'b', created_at: '2026-10-04T10:00:00Z', overall: 62, repTurns: 2 },
      { id: 'a', created_at: '2026-10-03T10:00:00Z', overall: null, repTurns: 0 },
    ])
    expect(db.calls).toContainEqual(['from', 'agent_sessions'])
    expect(db.calls).toContainEqual(['eq', 'doctor_id', 'doc-1'])
    expect(db.calls).toContainEqual(['eq', 'rep_id', 'rep-1'])
    expect(db.calls).toContainEqual(['neq', 'phase', 'in_roleplay'])
    expect(db.calls).toContainEqual(['order', 'created_at', { ascending: false }])
  })

  it('reads the score and transcript by JSON path, not the whole stored record', async () => {
    renderHook(() => useDoctorTextSimulations('doc-1'))
    await waitFor(() => expect(db.calls.some(call => call[0] === 'select')).toBe(true))
    const select = String(db.calls.find(call => call[0] === 'select')?.[1])
    expect(select).toContain('record->session->scores->overall')
    expect(select).toContain('record->session->transcript')
    expect(select).not.toMatch(/(^|,\s*)record(\s*,|$)/)
  })

  it('returns nothing when nobody is signed in', async () => {
    db.user = null
    const { result } = renderHook(() => useDoctorTextSimulations('doc-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sims).toEqual([])
    expect(db.calls.some(call => call[0] === 'from')).toBe(false)
  })
})
