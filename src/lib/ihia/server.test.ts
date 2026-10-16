import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { approvedKnowledge, isReviewer, voiceVocabulary } from './server'

function mockDb(data: unknown, error: unknown = null) {
  const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn() }
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.order.mockReturnValue(query)
  query.limit.mockResolvedValue({ data, error }); query.maybeSingle.mockResolvedValue({ data, error })
  const db = { from: vi.fn().mockReturnValue(query) }
  return { db: db as unknown as SupabaseClient, from: db.from, query }
}
afterEach(() => vi.unstubAllEnvs())
describe('IHIA knowledge boundary', () => {
  it('does not query the database when disabled', async () => {
    vi.stubEnv('IHIA_ENABLED', 'false')
    const { db, from } = mockDb([])
    expect(await voiceVocabulary(db)).toBeUndefined()
    expect(from).not.toHaveBeenCalled()
  })
  it('never falls back to unapproved knowledge on a database failure', async () => {
    vi.stubEnv('IHIA_ENABLED', 'true')
    const { db } = mockDb(null, { message: 'private diagnostic' })
    await expect(approvedKnowledge(db)).rejects.toThrow('knowledge_unavailable')
    expect(await voiceVocabulary(db)).toBeUndefined()
  })
  it('asks the database for approved knowledge only', async () => {
    const { db, query } = mockDb([])
    expect(await approvedKnowledge(db)).toEqual([])
    expect(query.eq).toHaveBeenCalledWith('status', 'approved')
  })
  it('requires an explicit reviewer grant and fails closed', async () => {
    const { db, query } = mockDb(null)
    expect(await isReviewer(db, 'u')).toBe(false)
    expect(query.eq).toHaveBeenCalledWith('user_id', 'u')
    query.maybeSingle.mockResolvedValue({ data: { user_id: 'u' }, error: null })
    expect(await isReviewer(db, 'u')).toBe(true)
    query.maybeSingle.mockResolvedValue({ data: { user_id: 'u' }, error: {} })
    expect(await isReviewer(db, 'u')).toBe(false)
  })
})
