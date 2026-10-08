import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeVocalDelivery, parseVocalFeedback } from './oruk'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('Oruk vocal feedback', () => {
  it('filters malformed provider scores and ranks independent labels', () => {
    expect(parseVocalFeedback({ emotions: [null, {label: 'bad', score: 2}, {label: 'calm', score: 0.3}, {label: 'happy', score: 0.8}], styles: [] }))
      .toEqual({ emotions: [{label: 'happy', score: 0.8}, {label: 'calm', score: 0.3}], styles: [] })
    expect(parseVocalFeedback({ emotions: 'invalid' })).toBeNull()
  })
  it('never sends Arabic audio or disabled requests', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    vi.stubEnv('ORUK_API_KEY', 'test-key'); vi.stubEnv('ORUK_ANALYSIS_ENABLED', 'true')
    expect(await analyzeVocalDelivery(new Blob(['audio']), 'ar')).toBeNull()
    vi.stubEnv('ORUK_ANALYSIS_ENABLED', 'false')
    expect(await analyzeVocalDelivery(new Blob(['audio']), 'en')).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('requires a key even when enabled', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    vi.stubEnv('ORUK_API_KEY', ''); vi.stubEnv('ORUK_ANALYSIS_ENABLED', 'true')
    expect(await analyzeVocalDelivery(new Blob(['audio']), 'en')).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('sends authenticated multipart audio with the correct model and format', async () => {
    vi.stubEnv('ORUK_API_KEY', 'test-key'); vi.stubEnv('ORUK_ANALYSIS_ENABLED', 'true')
    const fetcher = vi.fn().mockResolvedValue(Response.json({ emotions: [{label: 'happy', score: 0.7}] }))
    vi.stubGlobal('fetch', fetcher)
    expect(await analyzeVocalDelivery(new Blob(['audio'], {type: 'audio/mp4'}), 'en')).toEqual({ emotions: [{label: 'happy', score: 0.7}], styles: [] })
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('https://speech-api.oruk.ai/v1/audio/analysis')
    expect(init.headers.Authorization).toBe('Bearer test-key')
    expect(init.body.get('model')).toBe('oruk-resonance')
    expect(init.body.get('file').name).toBe('practice.m4a')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })
  it('fails softly on provider rejection, timeout, or malformed JSON', async () => {
    vi.stubEnv('ORUK_API_KEY', 'test-key'); vi.stubEnv('ORUK_ANALYSIS_ENABLED', 'true')
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', {status: 429})).mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(new Response('invalid json'))
    vi.stubGlobal('fetch', fetcher)
    for (let i = 0; i < 3; i++) expect(await analyzeVocalDelivery(new Blob(['audio']), 'en')).toBeNull()
  })
})
