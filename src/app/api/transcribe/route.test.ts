import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'
const MAX_AUDIO_BYTES = 8 * 1024 * 1024

const fetchMock = vi.fn()
const request = (fields: Record<string, string | Blob>) => {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  return new Request('http://localhost/api/transcribe', { method: 'POST', body: form })
}
const clip = (bytes = 10) => new Blob([new Uint8Array(bytes)], { type: 'audio/webm' })
const sentToWhisper = () => (fetchMock.mock.calls[0][1].body as FormData)

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('TRANSCRIPTION_ENABLED', 'true'); vi.stubEnv('OPENAI_API_KEY', 'k')
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } } as never)
  vi.mocked(checkRateLimit).mockResolvedValue(true)
  fetchMock.mockResolvedValue(Response.json({ text: ' hello ' }))
})

describe('transcribe route', () => {
  it('rate limits per user before reading or forwarding any audio', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(false)
    expect((await POST(request({ audio: clip() }))).status).toBe(429)
    expect(checkRateLimit).toHaveBeenCalledWith('transcribe', 'u1', 60, 3600)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('rejects empty and oversized audio without calling the provider', async () => {
    expect((await POST(request({ audio: clip(0) }))).status).toBe(400)
    expect((await POST(request({ audio: clip(MAX_AUDIO_BYTES + 1) }))).status).toBe(413)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('pins the language for ar and en and auto-detects for anything else', async () => {
    expect((await POST(request({ audio: clip(), lang: 'ar' }))).status).toBe(200)
    expect(sentToWhisper().get('language')).toBe('ar')
    fetchMock.mockClear(); fetchMock.mockResolvedValue(Response.json({ text: 'x' }))
    await POST(request({ audio: clip(), lang: 'xx' }))
    expect(sentToWhisper().has('language')).toBe(false)
    fetchMock.mockClear(); fetchMock.mockResolvedValue(Response.json({ text: 'x' }))
    await POST(request({ audio: clip() }))
    expect(sentToWhisper().has('language')).toBe(false)
  })
  it('returns the trimmed transcript', async () => {
    expect(await (await POST(request({ audio: clip(), lang: 'en' }))).json()).toEqual({ text: 'hello' })
  })
})
