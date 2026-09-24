// src/app/api/transcript-segments/correct/route.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
import { POST } from './route'
import { createClient } from '@/lib/supabase-server'

afterEach(() => vi.clearAllMocks())

const request = (body: unknown) => new Request('http://localhost/api/transcript-segments/correct', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

describe('POST /api/transcript-segments/correct', () => {
  it('writes a new transcript_version with the corrected speaker roles', async () => {
    const insert = vi.fn(async () => ({ error: null }))
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'rep-1' } } }) },
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ order: async () => ({ data: [
          { segment_index: 0, speaker_role: 'counterpart', text: 'hi', start_ms: 0, end_ms: 500, transcript_version: 1 },
          { segment_index: 1, speaker_role: 'rep', text: 'hello', start_ms: 500, end_ms: 900, transcript_version: 1 },
        ], error: null }) }) }) }),
        insert,
      }),
    } as never)
    const res = await POST(request({ sessionType: 'human_partner', sessionId: 's1', swapSegmentIndexes: [0, 1] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.newTranscriptVersion).toBe(2)
    expect(insert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ segment_index: 0, speaker_role: 'rep', transcript_version: 2 }),
      expect.objectContaining({ segment_index: 1, speaker_role: 'counterpart', transcript_version: 2 }),
    ]))
  })
})
