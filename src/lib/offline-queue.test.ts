import { describe, it, expect, afterEach, vi } from 'vitest'
import { looksOffline } from './offline-queue'

describe('looksOffline', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('treats navigator.onLine === false as offline regardless of the error', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(looksOffline(new Error('some unrelated server error'))).toBe(true)
  })

  it('treats a "Failed to fetch" TypeError as offline even if onLine is true', () => {
    vi.stubGlobal('navigator', { onLine: true })
    expect(looksOffline(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('does not treat a real validation/RLS error as offline', () => {
    vi.stubGlobal('navigator', { onLine: true })
    expect(looksOffline(new Error('new row violates row-level security policy'))).toBe(false)
  })
})


import { replayPendingWrites, type PendingWrite } from './offline-queue'
import type { SupabaseClient } from '@supabase/supabase-js'
const pending = (id: number, rep = 'owner'): PendingWrite => ({ id, table: 'doctor_visits', created_at: '2026-10-05', payload: { id: `uuid-${id}`, rep_id: rep, doctor_id: 'doctor', note: 'visit' } })
function client(insert: ReturnType<typeof vi.fn>, existing: unknown = null) {
  const query = { eq: vi.fn(), maybeSingle: async () => ({ data: existing }) }; query.eq.mockReturnValue(query)
  return { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) }, from: () => ({ insert, select: () => query }) } as unknown as SupabaseClient
}
it('acknowledges a committed visit after its first response was lost', async () => {
  const entry = pending(1), remove = vi.fn(async () => {})
  const insert = vi.fn(async () => ({ error: { code: '23505' } }))
  expect(await replayPendingWrites(client(insert, entry.payload), [entry], remove)).toEqual({ flushed: 1, failed: 0 })
  expect(insert).toHaveBeenCalledWith(entry.payload); expect(remove).toHaveBeenCalledWith(1)
})
it('does not remove an unrelated unique conflict, and continues with independent valid visits', async () => {
  const insert = vi.fn().mockResolvedValueOnce({ error: { code: '23505' } }).mockResolvedValueOnce({ error: null })
  const remove = vi.fn(async () => {})
  expect(await replayPendingWrites(client(insert, { ...pending(1).payload, note: 'different' }), [pending(1), pending(2)], remove)).toEqual({ flushed: 1, failed: 1 })
  expect(remove.mock.calls).toEqual([[2]])
})
it('never replays another account’s writes', async () => {
  const insert = vi.fn(async () => ({ error: null })), remove = vi.fn(async () => {})
  await replayPendingWrites(client(insert), [pending(1, 'other'), pending(2)], remove)
  expect(insert.mock.calls).toEqual([[pending(2).payload]])
})
it('keeps writes after a network failure', async () => {
  const insert = vi.fn(async () => ({ error: { message: 'Failed to fetch' } })), remove = vi.fn(async () => {})
  await replayPendingWrites(client(insert), [pending(1), pending(2)], remove)
  expect(insert).toHaveBeenCalledTimes(1); expect(remove).not.toHaveBeenCalled()
})
