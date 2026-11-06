import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { diarizeAudio, pendingRemoteDeleteIds, MAX_ROLEPLAY_AUDIO_BYTES, type DiarizationJob } from './assemblyai-client'
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
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) }, clear: () => store.clear(),
  })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
const audio = new Blob(['test audio'], { type: 'audio/webm' })

describe('roleplay analysis recovery', () => {
  it('resumes the existing transcript after a network failure without resubmitting', async () => {
    const job: DiarizationJob = { uploadUrl: 'https://cdn.assemblyai.com/upload/test' }
    fetchMock.mockResolvedValueOnce(Response.json({ id: 'transcript' }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(Response.json({ status: 'completed', utterances }))
      .mockResolvedValueOnce(Response.json({ deleted: true }))
    await expect(diarizeAudio(audio, job)).rejects.toThrow('offline')
    expect(job.transcriptId).toBe('transcript')
    const result = await diarizeAudio(audio, job)
    expect(result).toEqual(utterances)
    const actions = fetchMock.mock.calls.map(call => JSON.parse(call[1].body).action)
    expect(actions).toEqual(['submit', 'poll', 'poll', 'delete'])
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
  it('deletes the transcript and audio at the provider once it holds the result', async () => {
    const job: DiarizationJob = { uploadUrl: 'https://cdn.assemblyai.com/upload/test' }
    fetchMock.mockResolvedValueOnce(Response.json({ id: 'transcript' }))
      .mockResolvedValueOnce(Response.json({ status: 'completed', utterances }))
      .mockResolvedValueOnce(Response.json({ deleted: true }))
    expect(await diarizeAudio(audio, job)).toEqual(utterances)
    const sent = fetchMock.mock.calls.map(call => JSON.parse(call[1].body))
    expect(sent[sent.length - 1]).toEqual({ action: 'delete', transcript_id: 'transcript' })
    // the remote copy is gone, so a retry must upload again instead of polling it
    expect(job).toEqual({})
  })
  it('still returns the result when the provider delete fails', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ id: 'transcript' }))
      .mockResolvedValueOnce(Response.json({ status: 'completed', utterances }))
      .mockResolvedValueOnce(new Response('{"error":"boom"}', { status: 500 }))
    expect(await diarizeAudio(audio, { uploadUrl: 'https://cdn.assemblyai.com/upload/test' })).toEqual(utterances)
  })
  it('does not wait on a stalled delete', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(Response.json({ id: 'transcript' }))
      .mockResolvedValueOnce(Response.json({ status: 'completed', utterances }))
      .mockImplementationOnce(() => new Promise(() => {}))
    const pending = diarizeAudio(audio, { uploadUrl: 'https://cdn.assemblyai.com/upload/test' })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await pending).toEqual(utterances)
  })
  describe('remote deletion is acknowledged or remembered, never just assumed', () => {
    const run = (job: DiarizationJob = { uploadUrl: 'https://cdn.assemblyai.com/upload/test' }) => diarizeAudio(audio, job)
    const completed = () => fetchMock.mockResolvedValueOnce(Response.json({ id: 'transcript-1' })).mockResolvedValueOnce(Response.json({ status: 'completed', utterances }))

    it('an acknowledged deletion leaves nothing to retry', async () => {
      completed(); fetchMock.mockResolvedValueOnce(Response.json({ deleted: true }))
      await run()
      expect(pendingRemoteDeleteIds()).toEqual([])
    })
    it('treats { deleted: false } as NOT acknowledged and remembers the id only', async () => {
      completed(); fetchMock.mockResolvedValue(Response.json({ deleted: false }))
      expect(await run()).toEqual(utterances)
      expect(pendingRemoteDeleteIds()).toEqual(['transcript-1'])
      expect(localStorage.getItem('styleshift.pendingRemoteDeletes')).not.toMatch(/utterance|text|audio/i)
    })
    it('retries once straight away, and succeeds on the second try', async () => {
      completed(); fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 })).mockResolvedValueOnce(Response.json({ deleted: true }))
      await run()
      expect(pendingRemoteDeleteIds()).toEqual([])
      expect(fetchMock.mock.calls.filter(c => JSON.parse(c[1].body).action === 'delete')).toHaveLength(2)
    })
    it('a remembered deletion is tried again the next time analysis runs, and forgotten once acknowledged', async () => {
      localStorage.setItem('styleshift.pendingRemoteDeletes', JSON.stringify([{ id: 'old-transcript', tries: 1 }]))
      fetchMock.mockImplementation(async (_u: string, o: { body: string }) => {
        const b = JSON.parse(o.body)
        if (b.action === 'delete') return Response.json({ deleted: true })
        if (b.action === 'submit') return Response.json({ id: 'transcript-2' })
        return Response.json({ status: 'completed', utterances })
      })
      await run()
      await vi.waitFor(() => expect(pendingRemoteDeleteIds()).toEqual([]))
      const deletedIds = fetchMock.mock.calls.map(c => JSON.parse(c[1].body)).filter(b => b.action === 'delete').map(b => b.transcript_id)
      expect(deletedIds).toContain('old-transcript')
    })
    it('gives up after a few unconfirmed tries instead of retrying for ever', async () => {
      localStorage.setItem('styleshift.pendingRemoteDeletes', JSON.stringify([{ id: 'stuck', tries: 3 }]))
      fetchMock.mockImplementation(async (_u: string, o: { body: string }) => {
        const b = JSON.parse(o.body)
        if (b.action === 'delete') return new Response('{}', { status: 500 })
        if (b.action === 'submit') return Response.json({ id: 'transcript-3' })
        return Response.json({ status: 'completed', utterances })
      })
      await run()
      await vi.waitFor(() => expect(pendingRemoteDeleteIds()).not.toContain('stuck'))
    })
    it('asks for the remote copy of a FAILED job to be removed as well', async () => {
      fetchMock.mockResolvedValueOnce(Response.json({ id: 'transcript-4' }))
        .mockResolvedValueOnce(Response.json({ status: 'error', error: 'bad audio' }))
        .mockResolvedValueOnce(Response.json({ deleted: true }))
      await expect(run()).rejects.toMatchObject({ code: 'diarize' })
      const sent = fetchMock.mock.calls.map(c => JSON.parse(c[1].body))
      expect(sent[sent.length - 1]).toEqual({ action: 'delete', transcript_id: 'transcript-4' })
    })
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
