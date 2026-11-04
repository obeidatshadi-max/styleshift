import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

function handler(user: object | null = { id: 'rep' }) {
  const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'job' }) })
  const exports: { handler?: (event: object) => Promise<{ statusCode: number; body: string }> } = {}
  runInNewContext(readFileSync('netlify/functions/assemblyai-proxy.js', 'utf8'), {
    exports, Buffer, console: { log: vi.fn(), error: vi.fn() }, fetch,
    process: { env: { ASSEMBLYAI_API_KEY: 'key', NEXT_PUBLIC_SUPABASE_URL: 'url', SUPABASE_SERVICE_ROLE_KEY: 'key' } },
    require: () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) } }) }),
  })
  return { run: exports.handler!, fetch }
}
const event = (body: object, authorization = 'Bearer token') => ({ httpMethod: 'POST', headers: { authorization }, body: JSON.stringify(body) })

describe('roleplay transcription function', () => {
  it('uses multilingual speech models with two speaker labels', async () => {
    const { run, fetch } = handler()
    expect((await run(event({ action: 'submit', audio_url: 'https://cdn.assemblyai.com/upload/audio' }))).statusCode).toBe(200)
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      language_detection: true, speaker_labels: true, speakers_expected: 2,
      speech_models: ['universal-3-pro', 'universal-2'],
    })
  })
  it('deletes a transcript with the DELETE method', async () => {
    const { run, fetch } = handler()
    const res = await run(event({ action: 'delete', transcript_id: 'abc-123' }))
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ deleted: true })
    expect(fetch.mock.calls[0][0]).toBe('https://api.assemblyai.com/v2/transcript/abc-123')
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'DELETE' })
  })
  it('refuses to delete with a malformed transcript id', async () => {
    const { run, fetch } = handler()
    expect((await run(event({ action: 'delete', transcript_id: '../upload' }))).statusCode).toBe(400)
    expect((await run(event({ action: 'delete' }))).statusCode).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('requires a signed-in user to delete', async () => {
    const { run, fetch } = handler(null)
    expect((await run(event({ action: 'delete', transcript_id: 'abc' }))).statusCode).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('rejects unauthenticated requests independently of page middleware', async () => {
    const { run, fetch } = handler()
    expect((await run(event({ action: 'upload', audio: 'AA==' }, ''))).statusCode).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('rejects expired bearer tokens', async () => {
    const { run, fetch } = handler(null)
    expect((await run(event({ action: 'upload', audio: 'AA==' }))).statusCode).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('rejects third-party audio URLs', async () => {
    const { run, fetch } = handler()
    expect((await run(event({ action: 'submit', audio_url: 'https://attacker.example/audio' }))).statusCode).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })
})
