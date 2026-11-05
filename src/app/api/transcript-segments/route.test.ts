import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
import { GET } from './route'
import { createClient } from '@/lib/supabase-server'

afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs() })
const get = (qs: string) => GET(new Request(`http://localhost/api/transcript-segments?${qs}`))
const mock = (user: unknown, rows: unknown[] | null, error: unknown = null) => vi.mocked(createClient).mockResolvedValue({
  auth: { getUser: async () => ({ data: { user } }) },
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ order: async () => ({ data: rows, error }) }) }) }) }) }),
} as never)

describe('GET /api/transcript-segments', () => {
  it('needs a signed-in rep and a valid session type', async () => {
    mock(null, [])
    expect((await get('sessionType=human_partner&sessionId=s1')).status).toBe(401)
    mock({ id: 'r' }, [])
    expect((await get('sessionType=ai_doctor_text&sessionId=s1')).status).toBe(400)
    expect((await get('sessionType=human_partner')).status).toBe(400)
  })

  it('returns only the newest version, in line order', async () => {
    vi.stubEnv('IHIA_ENABLED', 'true')
    mock({ id: 'r' }, [
      { segment_index: 0, speaker_role: 'rep', text: 'old a', transcript_version: 1 },
      { segment_index: 0, speaker_role: 'counterpart', text: 'new a', transcript_version: 2 },
      { segment_index: 1, speaker_role: 'rep', text: 'old b', transcript_version: 1 },
      { segment_index: 1, speaker_role: 'rep', text: 'new b', transcript_version: 2 },
    ])
    const body = await (await get('sessionType=human_partner&sessionId=s1')).json()
    expect(body.transcriptVersion).toBe(2)
    expect(body.canProposePhrases).toBe(true)
    expect(body.segments).toEqual([
      { segmentIndex: 0, speakerRole: 'counterpart', text: 'new a' }, { segmentIndex: 1, speakerRole: 'rep', text: 'new b' },
    ])
  })

  it('404s with no transcript and 503s when the lookup fails', async () => {
    mock({ id: 'r' }, [])
    expect((await get('sessionType=customer_visit&sessionId=s1')).status).toBe(404)
    mock({ id: 'r' }, null, { message: 'x' })
    expect((await get('sessionType=customer_visit&sessionId=s1')).status).toBe(503)
  })
})
