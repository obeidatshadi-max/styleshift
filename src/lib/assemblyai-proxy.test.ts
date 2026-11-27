import { readFileSync } from 'node:fs'
import crypto from 'node:crypto'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const UID = '11111111-2222-3333-4444-555555555555'
function handler(user: object | null = { id: 'rep' }, fetchJson: object = { id: 'job' }) {
  const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => fetchJson })
  const storage = {
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://proj.supabase.co/storage/v1/object/sign/roleplay-audio/x?token=t' }, error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    bucket: '',
  }
  const exports: { handler?: (event: object) => Promise<{ statusCode: number; body: string }> } = {}
  runInNewContext(readFileSync('netlify/functions/assemblyai-proxy.js', 'utf8'), {
    exports, Buffer, console: { log: vi.fn(), error: vi.fn() }, fetch,
    process: { env: { ASSEMBLYAI_API_KEY: 'key', NEXT_PUBLIC_SUPABASE_URL: 'url', SUPABASE_SERVICE_ROLE_KEY: 'key' } },
    require: (m: string) => m === 'crypto' ? crypto : ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) }, storage: { from: (b: string) => { storage.bucket = b; return storage } } }) }),
  })
  return { run: exports.handler!, fetch, storage }
}
/** A transcript handle as the function signs it for `userId` (HMAC with the test API key 'key'). */
const signed = (userId: string, id: string) =>
  `${id}~${crypto.createHmac('sha256', 'key').update(`transcript-owner:v1:${userId}:${id}`).digest('base64url')}`
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
    const res = await run(event({ action: 'delete', transcript_id: signed('rep', 'abc-123') }))
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
    expect((await run(event({ action: 'delete', transcript_id: signed('rep', 'abc') }))).statusCode).toBe(401)
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
  it("starts a large-file transcript from a signed URL of the caller's own stored file", async () => {
    const { run, fetch, storage } = handler({ id: UID })
    const path = `${UID}/abcdef0123456789.m4a`
    expect((await run(event({ action: 'submit_storage', storage_path: path }))).statusCode).toBe(200)
    expect(storage.bucket).toBe('roleplay-audio')
    expect(storage.createSignedUrl).toHaveBeenCalledWith(path, 3600)
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      audio_url: 'https://proj.supabase.co/storage/v1/object/sign/roleplay-audio/x?token=t', speaker_labels: true, speakers_expected: 2,
    })
  })
  it("refuses another rep's or a malformed storage path", async () => {
    const { run, fetch, storage } = handler({ id: UID })
    for (const p of ['99999999-2222-3333-4444-555555555555/abcdef0123456789.m4a', `${UID}/../x.m4a`, `${UID}/a.m4a`, 'abc']) {
      expect((await run(event({ action: 'submit_storage', storage_path: p }))).statusCode).toBe(400)
    }
    expect(storage.createSignedUrl).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it("removes the stored file once the transcript is finished, and only the caller's own", async () => {
    const own = `${UID}/abcdef0123456789.m4a`
    const done = handler({ id: UID }, { status: 'completed', utterances: [] })
    await done.run(event({ action: 'poll', transcript_id: signed(UID, 'tx-1'), storage_path: own }))
    expect(done.storage.remove).toHaveBeenCalledWith([own])
    const busy = handler({ id: UID }, { status: 'processing' })
    await busy.run(event({ action: 'poll', transcript_id: signed(UID, 'tx-1'), storage_path: own }))
    expect(busy.storage.remove).not.toHaveBeenCalled()
    const foreign = handler({ id: UID }, { status: 'completed', utterances: [] })
    await foreign.run(event({ action: 'poll', transcript_id: signed(UID, 'tx-1'), storage_path: '99999999-2222-3333-4444-555555555555/abcdef0123456789.m4a' }))
    expect(foreign.storage.remove).not.toHaveBeenCalled()
  })
  it('returns a handle signed for the submitting user', async () => {
    const { run } = handler({ id: UID }, { id: 'tx-9', status: 'queued' })
    const res = await run(event({ action: 'submit', audio_url: 'https://cdn.assemblyai.com/upload/audio' }))
    expect(JSON.parse(res.body).id).toBe(signed(UID, 'tx-9'))
  })
  it("refuses to read or delete another user's transcript, or an unsigned id", async () => {
    const { run, fetch } = handler({ id: UID }, { status: 'completed', utterances: [] })
    for (const transcript_id of [signed('someone-else', 'tx-1'), 'tx-1', 'tx-1~forged', `${signed(UID, 'tx-1')}~x`]) {
      expect((await run(event({ action: 'poll', transcript_id }))).statusCode, transcript_id).toBe(400)
      expect((await run(event({ action: 'delete', transcript_id }))).statusCode, transcript_id).toBe(400)
    }
    expect(fetch).not.toHaveBeenCalled()
  })
  it('rejects third-party audio URLs', async () => {
    const { run, fetch } = handler()
    expect((await run(event({ action: 'submit', audio_url: 'https://attacker.example/audio' }))).statusCode).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })
})
