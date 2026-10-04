// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useSavedReport } from './useSavedReport'

const db = vi.hoisted(() => ({
  user: { id: 'rep-1' } as { id: string } | null,
  result: { data: [] as unknown, error: null as unknown },
  throws: false,
  calls: [] as [string, ...unknown[]][],
}))
vi.mock('@/lib/supabase-browser', () => ({
  createClient: () => {
    const query = {
      select: (columns: string) => { db.calls.push(['select', columns]); return query },
      eq: (column: string, value: unknown) => { db.calls.push(['eq', column, value]); return query },
      is: (column: string, value: unknown) => { db.calls.push(['is', column, value]); return query },
      order: (column: string, options: unknown) => { db.calls.push(['order', column, options]); return query },
      limit: async (n: number) => { db.calls.push(['limit', n]); if (db.throws) throw new Error('network'); return db.result },
    }
    return {
      auth: { getUser: async () => ({ data: { user: db.user } }) },
      from: (table: string) => { db.calls.push(['from', table]); return query },
    }
  },
}))
afterEach(() => { db.user = { id: 'rep-1' }; db.result = { data: [], error: null }; db.throws = false; db.calls = [] })

describe('useSavedReport', () => {
  it('returns the newest complete, non-superseded report for this rep and session', async () => {
    db.result = { data: [{ report: { label: 'Saved' } }], error: null }
    const { result } = renderHook(() => useSavedReport('ai_doctor_text', 'sim-1'))
    await waitFor(() => expect(result.current.status).toBe('found'))
    expect(result.current).toEqual({ status: 'found', report: { label: 'Saved' } })
    for (const call of [['from', 'conversation_reports'], ['eq', 'session_type', 'ai_doctor_text'], ['eq', 'session_id', 'sim-1'],
      ['eq', 'rep_id', 'rep-1'], ['eq', 'status', 'complete'], ['is', 'superseded_by', null],
      ['order', 'created_at', { ascending: false }], ['limit', 1]]) expect(db.calls).toContainEqual(call)
  })

  it('reports missing when no report was ever saved', async () => {
    const { result } = renderHook(() => useSavedReport('ai_doctor_text', 'sim-2'))
    await waitFor(() => expect(result.current.status).toBe('missing'))
  })

  it('reports missing, without querying, when nobody is signed in', async () => {
    db.user = null
    const { result } = renderHook(() => useSavedReport('ai_doctor_text', 'sim-3'))
    await waitFor(() => expect(result.current.status).toBe('missing'))
    expect(db.calls.some(call => call[0] === 'from')).toBe(false)
  })

  it('reports an error when the lookup fails, whether as an error result or an exception', async () => {
    db.result = { data: null, error: { message: 'boom' } }
    const first = renderHook(() => useSavedReport('ai_doctor_text', 'sim-4'))
    await waitFor(() => expect(first.result.current.status).toBe('error'))
    db.throws = true
    const second = renderHook(() => useSavedReport('ai_doctor_text', 'sim-5'))
    await waitFor(() => expect(second.result.current.status).toBe('error'))
  })
})
