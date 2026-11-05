// src/app/api/transcript-segments/correct/route.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
import { POST } from './route'
import { createClient } from '@/lib/supabase-server'

afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs() })

const request = (body: unknown) => new Request('http://localhost/api/transcript-segments/correct', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

function mockDb(opts: { insertError?: boolean; proposalError?: boolean } = {}) {
  const insert = vi.fn(async () => ({ error: opts.insertError ? { message: 'x' } : null }))
  const proposalInsert = vi.fn(async () => ({ error: opts.proposalError ? { message: 'x' } : null }))
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: 'rep-1' } } }) },
    from: (table: string) => table === 'ihia_proposals' ? { insert: proposalInsert } : ({
      select: () => ({ eq: () => ({ eq: () => ({ order: async () => ({ data: [
        { segment_index: 0, speaker_role: 'counterpart', text: 'hi', start_ms: 0, end_ms: 500, transcript_version: 1 },
        { segment_index: 1, speaker_role: 'rep', text: 'عندك وكت', start_ms: 500, end_ms: 900, transcript_version: 1 },
      ], error: null }) }) }) }),
      insert,
    }),
  } as never)
  return { insert, proposalInsert }
}

describe('POST /api/transcript-segments/correct', () => {
  it('writes a new transcript_version with the corrected speaker roles', async () => {
    const { insert } = mockDb()
    const res = await POST(request({ sessionType: 'human_partner', sessionId: 's1', swapSegmentIndexes: [0, 1] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.newTranscriptVersion).toBe(2)
    expect(insert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ segment_index: 0, speaker_role: 'rep', transcript_version: 2 }),
      expect.objectContaining({ segment_index: 1, speaker_role: 'counterpart', transcript_version: 2 }),
    ]))
  })

  it('writes corrected text into the new version and keeps the timing', async () => {
    const { insert, proposalInsert } = mockDb()
    const res = await POST(request({ sessionType: 'human_partner', sessionId: 's1', edits: [{ segmentIndex: 1, text: 'عندك وقت' }] }))
    expect(res.status).toBe(200)
    expect(insert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ segment_index: 1, text: 'عندك وقت', start_ms: 500, end_ms: 900, transcript_version: 2, rep_id: 'rep-1' }),
      expect.objectContaining({ segment_index: 0, text: 'hi', transcript_version: 2 }),
    ]))
    expect(proposalInsert).not.toHaveBeenCalled()
  })

  it('sends only the changed words to the phrase reviewers, only when the rep opted in and IHIA is on', async () => {
    vi.stubEnv('IHIA_ENABLED', 'true')
    const { proposalInsert } = mockDb()
    const res = await POST(request({ sessionType: 'human_partner', sessionId: 's1', proposePhrases: true, edits: [{ segmentIndex: 1, text: 'عندك وقت' }] }))
    expect((await res.json()).proposalsSent).toBe(1)
    expect(proposalInsert).toHaveBeenCalledWith([{ rep_id: 'rep-1', heard: 'وكت', meant: 'وقت' }])
  })

  it('does not send phrases when the rep did not tick the box, or IHIA is off', async () => {
    vi.stubEnv('IHIA_ENABLED', 'true')
    const a = mockDb()
    await POST(request({ sessionType: 'human_partner', sessionId: 's1', proposePhrases: false, edits: [{ segmentIndex: 1, text: 'عندك وقت' }] }))
    expect(a.proposalInsert).not.toHaveBeenCalled()
    vi.stubEnv('IHIA_ENABLED', 'false')
    const b = mockDb()
    await POST(request({ sessionType: 'human_partner', sessionId: 's1', proposePhrases: true, edits: [{ segmentIndex: 1, text: 'عندك وقت' }] }))
    expect(b.proposalInsert).not.toHaveBeenCalled()
  })

  it('keeps the saved correction when sending the phrases fails', async () => {
    vi.stubEnv('IHIA_ENABLED', 'true')
    mockDb({ proposalError: true })
    const res = await POST(request({ sessionType: 'human_partner', sessionId: 's1', proposePhrases: true, edits: [{ segmentIndex: 1, text: 'عندك وقت' }] }))
    expect(res.status).toBe(200)
    expect((await res.json()).proposalsSent).toBe(0)
  })

  it('rejects a correction that changes nothing, an unknown line and an empty line', async () => {
    mockDb()
    expect((await POST(request({ sessionType: 'human_partner', sessionId: 's1', edits: [{ segmentIndex: 1, text: 'عندك وكت' }] }))).status).toBe(400)
    expect((await POST(request({ sessionType: 'human_partner', sessionId: 's1', edits: [{ segmentIndex: 7, text: 'x' }] }))).status).toBe(400)
    expect((await POST(request({ sessionType: 'human_partner', sessionId: 's1', edits: [{ segmentIndex: 1, text: '  ' }] }))).status).toBe(400)
  })

  it('returns 500 and no proposals when the new version cannot be saved', async () => {
    vi.stubEnv('IHIA_ENABLED', 'true')
    const { proposalInsert } = mockDb({ insertError: true })
    const res = await POST(request({ sessionType: 'human_partner', sessionId: 's1', proposePhrases: true, edits: [{ segmentIndex: 1, text: 'عندك وقت' }] }))
    expect(res.status).toBe(500)
    expect(proposalInsert).not.toHaveBeenCalled()
  })
})
