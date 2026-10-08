// src/hooks/useRoleplayRecorder.test.ts
// @vitest-environment jsdom
//
// Covers the mic-death dispatch added alongside the Screen Wake Lock fix:
// iOS Safari kills getUserMedia capture on screen-lock without ever
// throwing or erroring the MediaRecorder — the only observable signal is
// the audio track firing 'ended' (or the browser auto-stopping the
// recorder outright). Before this fix that left the rep staring at a
// still-ticking elapsed timer over dead audio. A fake MediaRecorder/
// AudioContext/getUserMedia stand in for jsdom, which implements none of
// them; only the onstop-dispatch logic (mic-death vs. rep-pressed-Stop)
// is under test, not real audio capture.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

vi.mock('@/lib/supabase-browser', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/assemblyai-client', () => ({
  diarizeAudio: vi.fn(),
  DiarizationError: class extends Error {
    code: string
    constructor(code: string, message: string) { super(message); this.code = code }
  },
}))

import { useRoleplayRecorder } from './useRoleplayRecorder'
import { createClient } from '@/lib/supabase-browser'
import { diarizeAudio } from '@/lib/assemblyai-client'

let lastTrack: { onended: (() => void) | null; stop: () => void }
let lastRecorder: FakeMediaRecorder | null = null

class FakeMediaRecorder {
  state: 'recording' | 'inactive' = 'recording'
  mimeType = 'audio/webm'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor(_stream: unknown, _opts?: unknown) { lastRecorder = this }
  start() { /* no-op */ }
  stop() { this.state = 'inactive'; this.onstop?.() }
}

class FakeAnalyser {
  fftSize = 2048
  smoothingTimeConstant = 0.8
  frequencyBinCount = 1024
  getFloatTimeDomainData() { /* no-op */ }
  getByteFrequencyData() { /* no-op */ }
}

class FakeAudioContext {
  sampleRate = 48000
  createMediaStreamSource() { return { connect: () => {} } }
  createAnalyser() { return new FakeAnalyser() }
  close() { return Promise.resolve() }
}

function setupBrowserMocks() {
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() })
  lastTrack = { onended: null, stop: vi.fn() }
  const stream = { getTracks: () => [lastTrack], getAudioTracks: () => [lastTrack] }
  // Deliberately omits `wakeLock` (jsdom's navigator doesn't have it either) —
  // mic-death dispatch must not depend on Wake Lock support to work.
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  })
}

function mockSupabaseSession() {
  const supabase = { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } }
  vi.mocked(createClient).mockReturnValue(supabase as never)
  return supabase
}

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); lastRecorder = null })

describe('useRoleplayRecorder mic-death handling', () => {
  it('surfaces mic_lost (not a silent hang) when the audio track ends mid-recording', async () => {
    setupBrowserMocks()
    mockSupabaseSession()
    const { result } = renderHook(() => useRoleplayRecorder('doc-1', null))

    await act(async () => { await result.current.start() })
    expect(result.current.phase).toBe('recording')

    act(() => { lastTrack.onended?.() })

    expect(result.current.phase).toBe('error')
    expect(result.current.error).toBe('mic_lost')
    expect(result.current.previewUrl).toBe('blob:mock')
  })

  it('does not misreport mic_lost when the browser auto-stops the recorder itself', async () => {
    setupBrowserMocks()
    mockSupabaseSession()
    const { result } = renderHook(() => useRoleplayRecorder('doc-1', null))

    await act(async () => { await result.current.start() })
    act(() => { lastRecorder?.stop() }) // recorder stops without the track ever firing 'ended'

    expect(result.current.phase).toBe('error')
    expect(result.current.error).toBe('mic_lost')
  })

  it('a rep-initiated stop() resolves normally and is never mistaken for mic death', async () => {
    setupBrowserMocks()
    mockSupabaseSession()
    vi.mocked(diarizeAudio).mockResolvedValue([
      { speaker: 'A', text: 'hello', start: 0, end: 1, words: [] },
      { speaker: 'B', text: 'hi there', start: 1, end: 2, words: [] },
    ])
    const { result } = renderHook(() => useRoleplayRecorder('doc-1', null))

    await act(async () => { await result.current.start() })
    await act(async () => { await result.current.stop() })

    await waitFor(() => expect(result.current.phase).toBe('pick-speaker'))
    expect(result.current.error).toBeNull()
  })
})
