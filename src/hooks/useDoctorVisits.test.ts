// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase-browser', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/offline-queue', () => ({ enqueueWrite: vi.fn(async (_table, row) => `offline-${row.id}`), listPendingWrites: vi.fn(async () => []), looksOffline: (e: unknown) => /failed to fetch/i.test(e instanceof Error ? e.message : typeof e === 'object' && e !== null && 'message' in e ? String(e.message) : String(e)) }))
import { createClient } from '@/lib/supabase-browser'
import { enqueueWrite } from '@/lib/offline-queue'
import { useDoctorVisits } from './useDoctorVisits'
let rejectInsert = true
const db: any = { auth: { getUser: async () => ({ data: { user: { id: 'rep' } } }) }, from: vi.fn(() => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }), insert: () => ({ select: () => ({ single: async () => { if (rejectInsert) throw new TypeError('Failed to fetch'); return { data: null, error: null } } }) }) })) }
beforeEach(() => { rejectInsert = true; vi.mocked(createClient).mockReturnValue(db) })
afterEach(() => vi.clearAllMocks())
describe('manual visit save recovery', () => {
  it('queues a visit when the request throws and retains its stable ID and contact date', async () => {
    const { result } = renderHook(() => useDoctorVisits('doctor'))
    let saved
    await act(async () => { saved = await result.current.addVisit({ source: 'manual', contact_at: '2026-10-01T09:00:00.000Z', note: 'late entered visit' }) })
    expect(enqueueWrite).toHaveBeenCalledWith('doctor_visits', expect.objectContaining({ id: expect.any(String), rep_id: 'rep', contact_at: '2026-10-01T09:00:00.000Z' }))
    expect(saved).toMatchObject({ id: expect.stringMatching(/^offline-/), contact_at: '2026-10-01T09:00:00.000Z' })
    expect(result.current.visits).toContain(saved)
  })
})
