import { afterEach, describe, expect, it, vi } from 'vitest'
import { transcribeWithDeepgram } from './deepgram'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('transcribeWithDeepgram', () => {
  it('requires a key', async () => {
    vi.stubEnv('DEEPGRAM_API_KEY', '')
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    expect(await transcribeWithDeepgram(new Blob(['audio']), 'ar')).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('sends the Iraqi Arabic dialect code, authenticated as a Token', async () => {
    vi.stubEnv('DEEPGRAM_API_KEY', 'test-key')
    const fetcher = vi.fn().mockResolvedValue(Response.json({ results: { channels: [{ alternatives: [{ transcript: 'شلونك' }] }] } }))
    vi.stubGlobal('fetch', fetcher)
    expect(await transcribeWithDeepgram(new Blob(['audio'], { type: 'audio/webm' }), 'ar')).toBe('شلونك')
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toContain('model=nova-3')
    expect(url).toContain('language=ar-IQ')
    expect(init.headers.authorization).toBe('Token test-key')
    expect(init.headers['content-type']).toBe('audio/webm')
  })

  it('sends plain English for the en path', async () => {
    vi.stubEnv('DEEPGRAM_API_KEY', 'test-key')
    const fetcher = vi.fn().mockResolvedValue(Response.json({ results: { channels: [{ alternatives: [{ transcript: 'hello' }] }] } }))
    vi.stubGlobal('fetch', fetcher)
    await transcribeWithDeepgram(new Blob(['audio']), 'en')
    expect(fetcher.mock.calls[0][0]).toContain('language=en')
  })

  it('returns null on empty transcript, malformed response, or upstream rejection', async () => {
    vi.stubEnv('DEEPGRAM_API_KEY', 'test-key')
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ results: { channels: [{ alternatives: [{ transcript: '' }] }] } }))
      .mockResolvedValueOnce(Response.json({ nonsense: true }))
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockRejectedValueOnce(new Error('timeout'))
    vi.stubGlobal('fetch', fetcher)
    for (let i = 0; i < 4; i++) expect(await transcribeWithDeepgram(new Blob(['audio']), 'ar')).toBeNull()
  })
})
