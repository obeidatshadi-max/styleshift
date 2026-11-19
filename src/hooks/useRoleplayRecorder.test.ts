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
vi.mock('@/lib/assemblyai-client', () => {
  const diarizeAudio = vi.fn()
  return {
    diarizeAudio,
    // The hook calls the metadata variant; it delegates to the same mock so existing tests stay as written.
    diarizeAudioWithMeta: vi.fn(async (...args: unknown[]) => ({ utterances: await diarizeAudio(...args), meta: { languageCode: 'en', audioDurationSec: 2 } })),
    MAX_ROLEPLAY_AUDIO_BYTES: 4 * 1024 * 1024,
    DiarizationError: class extends Error {
      code: string
      constructor(code: string, message: string) { super(message); this.code = code }
    },
  }
})

import { useRoleplayRecorder } from './useRoleplayRecorder'
import { createClient } from '@/lib/supabase-browser'
import { diarizeAudio } from '@/lib/assemblyai-client'
import { MAX_RECORDING_SEC, RECORDING_SIZE_GUARD_BYTES } from '@/lib/roleplay-limits'

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

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); lastRecorder = null })

const twoSpeakers = [
  { speaker: 'A', text: 'hello', start: 0, end: 1, words: [] },
  { speaker: 'B', text: 'hi there', start: 1, end: 2, words: [] },
]

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

describe('useRoleplayRecorder automatic stop', () => {
  it('stops by itself and goes to analysis when the recording reaches the size guard', async () => {
    setupBrowserMocks()
    mockSupabaseSession()
    vi.mocked(diarizeAudio).mockResolvedValue(twoSpeakers)
    const { result } = renderHook(() => useRoleplayRecorder('doc-1', null))

    await act(async () => { await result.current.start() })
    await act(async () => {
      lastRecorder?.ondataavailable?.({ data: new Blob([new Uint8Array(RECORDING_SIZE_GUARD_BYTES)]) })
    })

    await waitFor(() => expect(result.current.phase).toBe('pick-speaker'))
    expect(result.current.autoStopped).toBe(true)
    expect(result.current.error).toBeNull()
    expect(diarizeAudio).toHaveBeenCalledTimes(1)
  })

  it('stops by itself at the time limit, not before', async () => {
    vi.useFakeTimers()
    setupBrowserMocks()
    mockSupabaseSession()
    vi.mocked(diarizeAudio).mockResolvedValue(twoSpeakers)
    const { result } = renderHook(() => useRoleplayRecorder('doc-1', null))

    await act(async () => { await result.current.start() })
    await act(async () => { await vi.advanceTimersByTimeAsync((MAX_RECORDING_SEC - 5) * 1000) })
    expect(result.current.phase).toBe('recording')
    expect(result.current.autoStopped).toBe(false)

    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 1000) })
    expect(result.current.autoStopped).toBe(true)
    expect(result.current.phase).toBe('pick-speaker')
    expect(diarizeAudio).toHaveBeenCalledTimes(1)
  })

  it('shows the real limit when the phone records more bytes per second than asked, and reports where it stopped', async () => {
    vi.useFakeTimers()
    setupBrowserMocks()
    mockSupabaseSession()
    vi.mocked(diarizeAudio).mockResolvedValue(twoSpeakers)
    const { result } = renderHook(() => useRoleplayRecorder('doc-1', null))

    await act(async () => { await result.current.start() })
    expect(result.current.limitSec).toBe(MAX_RECORDING_SEC)
    // 20 seconds at 4x the planned rate: the size guard, not the clock, will end this recording.
    const perSec = Math.ceil(RECORDING_SIZE_GUARD_BYTES / 200)
    for (let s = 0; s < 20; s++) {
      await act(async () => {
        lastRecorder?.ondataavailable?.({ data: new Blob([new Uint8Array(perSec)]) })
        await vi.advanceTimersByTimeAsync(1000)
      })
    }
    expect(result.current.limitSec).toBeGreaterThanOrEqual(195)
    expect(result.current.limitSec).toBeLessThanOrEqual(205)

    await act(async () => {
      lastRecorder?.ondataavailable?.({ data: new Blob([new Uint8Array(RECORDING_SIZE_GUARD_BYTES)]) })
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.autoStopped).toBe(true)
    expect(result.current.stoppedAtSec).toBe(20)
  })

  it('does not mark a rep-pressed Stop as automatic', async () => {
    setupBrowserMocks()
    mockSupabaseSession()
    vi.mocked(diarizeAudio).mockResolvedValue(twoSpeakers)
    const { result } = renderHook(() => useRoleplayRecorder('doc-1', null))

    await act(async () => { await result.current.start() })
    await act(async () => { await result.current.stop() })

    await waitFor(() => expect(result.current.phase).toBe('pick-speaker'))
    expect(result.current.autoStopped).toBe(false)
  })
})

describe('useRoleplayRecorder silent audio and uploaded files', () => {
  it('reports no_speech (not a speaker error) when the provider finds no words', async () => {
    setupBrowserMocks()
    mockSupabaseSession()
    vi.mocked(diarizeAudio).mockResolvedValue([])
    const { result } = renderHook(() => useRoleplayRecorder('doc-1', null))
    await act(async () => { await result.current.start() })
    await act(async () => { await result.current.stop() })
    await waitFor(() => expect(result.current.phase).toBe('error'))
    expect(result.current.error).toBe('no_speech')
  })

  it('rejects an empty file, a non-audio file and an oversize file before any upload', async () => {
    setupBrowserMocks()
    mockSupabaseSession()
    const { result } = renderHook(() => useRoleplayRecorder('doc-1', null))
    await act(async () => { await result.current.startFromFile(new File([], 'empty.webm', { type: 'audio/webm' })) })
    expect(result.current.error).toBe('no_speech')
    await act(async () => { await result.current.startFromFile(new File(['x'], 'notes.pdf', { type: 'application/pdf' })) })
    expect(result.current.error).toBe('bad_file')
    await act(async () => { await result.current.startFromFile(new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'big.m4a', { type: 'audio/mp4' })) })
    expect(result.current.error).toBe('too_large')
    expect(diarizeAudio).not.toHaveBeenCalled()
  })

  it('analyses a valid uploaded file through the same speaker-picking flow', async () => {
    setupBrowserMocks()
    mockSupabaseSession()
    vi.mocked(diarizeAudio).mockResolvedValue(twoSpeakers)
    const { result } = renderHook(() => useRoleplayRecorder('doc-1', null))
    await act(async () => { await result.current.startFromFile(new File(['abc'], 'visit.m4a', { type: 'audio/mp4' })) })
    await waitFor(() => expect(result.current.phase).toBe('pick-speaker'))
    expect(result.current.previewUrl).toBe('blob:mock')
    expect(result.current.speakerPreviews.map(p => p.speaker)).toEqual(['A', 'B'])
  })
})
