// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/voice-events', () => ({ logVoiceEvent: vi.fn() }))
import { useAudioRecorder } from './useAudioRecorder'
const trackStop = vi.fn()
const stream = { getTracks: () => [{ stop: trackStop }] }
let getMedia: ReturnType<typeof vi.fn>
class Recorder {
  state = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  start() { this.state = 'recording' }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['voice']) }); queueMicrotask(() => this.onstop?.()) }
}
beforeEach(() => {
  vi.clearAllMocks()
  getMedia = vi.fn().mockResolvedValue(stream)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: getMedia } })
  vi.stubGlobal('MediaRecorder', Recorder)
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => vi.unstubAllGlobals())
describe('audio recorder lifecycle', () => {
  it('releases a microphone granted after the user leaves', async () => {
    let resolve!: (value: unknown) => void
    getMedia.mockReturnValue(new Promise(r => { resolve = r }))
    const { result } = renderHook(() => useAudioRecorder(null, 'en'))
    let pending!: Promise<boolean>
    act(() => { pending = result.current.start(); result.current.abort() })
    await act(async () => { resolve(stream); expect(await pending).toBe(false) })
    expect(trackStop).toHaveBeenCalled()
    expect(result.current.previewUrl).toBeNull()
  })
  it('does not recreate a preview when abort happens during stop', async () => {
    const { result } = renderHook(() => useAudioRecorder(null, 'en'))
    await act(async () => { await result.current.start() })
    await act(async () => { const stopping = result.current.stop(); result.current.abort(); await stopping })
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(trackStop).toHaveBeenCalled()
  })
  it('provides a preview and the recording for transcription, then releases the URL', async () => {
    const { result } = renderHook(() => useAudioRecorder(null, 'en'))
    await act(async () => { await result.current.start(); await result.current.stop() })
    expect(result.current.previewUrl).toBe('blob:preview')
    act(() => { expect(result.current.take()?.blob.size).toBeGreaterThan(0) })
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
    expect(result.current.previewUrl).toBeNull()
  })
})
