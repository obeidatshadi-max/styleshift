// src/hooks/useCustomerVisitRecorder.test.ts
// @vitest-environment jsdom
//
// Matches this repo's established hook-testing pattern (see
// useVoiceLive.test.ts: a per-file jsdom pragma + @testing-library/react's
// renderHook, since vitest.config.ts's global environment is 'node').
// Only confirmSpeaker is covered: start/stop depend on MediaRecorder/
// getUserMedia, browser APIs this hook shares unchanged with
// useRoleplayRecorder; confirmSpeaker is the pure state-transition logic
// (persist-on-success, fail-closed-on-error) worth covering directly.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

vi.mock('@/lib/supabase-browser', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/assemblyai-client', () => ({
  diarizeAudio: vi.fn(),
  DiarizationError: class extends Error {
    code: string
    constructor(code: string, message: string) { super(message); this.code = code }
  },
}))
vi.mock('@/lib/transcript-segments', () => ({ persistTranscriptSegments: vi.fn() }))

import { useCustomerVisitRecorder } from './useCustomerVisitRecorder'
import { createClient } from '@/lib/supabase-browser'
import { persistTranscriptSegments } from '@/lib/transcript-segments'

afterEach(() => vi.clearAllMocks())

function mockSupabase(updateResult: { data: unknown; error: unknown }, userId = 'rep-1') {
  const update = vi.fn(() => ({ eq: () => ({ select: () => Promise.resolve(updateResult) }) }))
  return { auth: { getUser: async () => ({ data: { user: { id: userId } } }) }, from: () => ({ update }) }
}

describe('useCustomerVisitRecorder confirmSpeaker', () => {
  it('sets phase("error") and never persists segments when the customer_visits update fails', async () => {
    const supabase = mockSupabase({ data: null, error: { message: 'RLS denied' } })
    vi.mocked(createClient).mockReturnValue(supabase as never)
    const { result } = renderHook(() => useCustomerVisitRecorder('visit-1'))

    await act(async () => { await result.current.confirmSpeaker('speaker_a') })

    expect(result.current.phase).toBe('error')
    expect(result.current.error).toBe('visit')
    expect(persistTranscriptSegments).not.toHaveBeenCalled()
  })

  it('sets phase("error") when the update returns no rows (RLS blocked, no thrown error)', async () => {
    const supabase = mockSupabase({ data: [], error: null })
    vi.mocked(createClient).mockReturnValue(supabase as never)
    const { result } = renderHook(() => useCustomerVisitRecorder('visit-1'))

    await act(async () => { await result.current.confirmSpeaker('speaker_a') })

    expect(result.current.phase).toBe('error')
    expect(result.current.error).toBe('visit')
    expect(persistTranscriptSegments).not.toHaveBeenCalled()
  })

  it('persists segments and reaches "done" when the visit update succeeds', async () => {
    const supabase = mockSupabase({ data: [{ id: 'visit-1' }], error: null })
    vi.mocked(createClient).mockReturnValue(supabase as never)
    vi.mocked(persistTranscriptSegments).mockResolvedValue({ ok: true })
    const { result } = renderHook(() => useCustomerVisitRecorder('visit-1'))

    await act(async () => { await result.current.confirmSpeaker('speaker_a') })

    expect(persistTranscriptSegments).toHaveBeenCalled()
    expect(result.current.phase).toBe('done')
  })
})
