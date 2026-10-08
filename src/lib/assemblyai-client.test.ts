import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { diarizeAudio, MAX_ROLEPLAY_AUDIO_BYTES, type DiarizationJob } from './assemblyai-client'
import { buildRoleplayResult } from './roleplay-core'
const auth = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/supabase-browser', () => ({ createClient: () => ({ auth }) }))
const utterances = [
  { speaker: 'A', text: 'What concerns would you like to discuss?', start: 0, end: 5000, words: [] },
  { speaker: 'B', text: 'I need more time to review the evidence.', start: 6000, end: 11000, words: [] },
  { speaker: 'A', text: 'Would a short follow-up next week help?', start: 12000, end: 17000, words: [] },
]
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  auth.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } } })
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
const audio = new Blob(['test audio'], { type: 'audio/webm' })

describe('roleplay analysis recovery', () => {
  it('resumes the existing transcript after a network failure without resubmitting', async () => {
    const job: DiarizationJob = { uploadUrl: 'https://cdn.assemblyai.com/upload/test' }
    fetchMock.mockResolvedValueOnce(Response.json({ id: 'transcript' }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(Response.json({ status: 'completed', utterances }))
    await expect(diarizeAudio(audio, job)).rejects.toThrow('offline')
    expect(job.transcriptId).toBe('transcript')
    const result = await diarizeAudio(audio, job)
    expect(result).toEqual(utterances)
    const actions = fetchMock.mock.calls.map(call => JSON.parse(call[1].body).action)
    expect(actions).toEqual(['submit', 'poll', 'poll'])
    const report = buildRoleplayResult(result, 'A', [], [])
    expect(report.talkRatio.repRatio).toBeGreaterThan(0)
    expect(report.durationSec).toBe(15)
  })
  it('keeps polling beyond the old 90-second limit', async () => {
    vi.useFakeTimers()
    let polls = 0
    fetchMock.mockImplementation(async () => Response.json(++polls < 35
      ? { status: 'processing' } : { status: 'completed', utterances }))
    const pending = diarizeAudio(audio, { transcriptId: 'slow-job' })
    await vi.advanceTimersByTimeAsync(105_000)
    expect(await pending).toEqual(utterances)
  })
  it('recognizes a login redirect instead of parsing HTML as a report', async () => {
    fetchMock.mockResolvedValue({ redirected: true, status: 200 })
    await expect(diarizeAudio(audio, { transcriptId: 'job' })).rejects.toMatchObject({ code: 'session' })
  })
  it('retains the job when the provider returns invalid JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>unavailable</html>', { status: 502 }))
    const job = { transcriptId: 'job' }
    await expect(diarizeAudio(audio, job)).rejects.toMatchObject({ code: 'diarize' })
    expect(job.transcriptId).toBe('job')
  })
  it('rejects oversized audio before upload', async () => {
    const large = new Blob([new Uint8Array(MAX_ROLEPLAY_AUDIO_BYTES + 1)])
    await expect(diarizeAudio(large)).rejects.toMatchObject({ code: 'too_large' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('bounds a stalled HTTP request without losing the job', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')))
    }))
    const pending = expect(diarizeAudio(audio, { transcriptId: 'job' })).rejects.toMatchObject({ code: 'timeout' })
    await vi.advanceTimersByTimeAsync(60_000)
    await pending
  })
})
