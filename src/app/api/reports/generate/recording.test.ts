import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ client: vi.fn(), limit: vi.fn(), complete: vi.fn(), factory: vi.fn(), knowledge: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ createClient: m.client }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: m.limit }))
vi.mock('@/agents/openai-complete', () => ({ createOpenAiJsonComplete: m.factory }))
vi.mock('@/lib/ihia/server', async original => ({ ...await original<typeof import('@/lib/ihia/server')>(), approvedKnowledge: m.knowledge }))
import { POST } from './route'

const originalText = 'ما عندي وكت هسه، خلي الـ follow-up بعدين.'
const rows = [{ segment_index: 0, speaker_role: 'counterpart', text: originalText, transcript_version: 2, start_ms: 0, end_ms: 3000 },
  { segment_index: 1, speaker_role: 'rep', text: 'شنو الوقت المناسب أرجعلك؟', transcript_version: 2, start_ms: 3000, end_ms: 5000 }]
const entry = { id: 'e', expression: 'ما عندي وكت', literal_meaning: 'I have no time', contextual_meaning: 'May be a time constraint',
  region: 'baghdad', specialty: 'general', kind: 'workflow', uncertainty: 'Clarify context', source_reference: 'Expert-fixture-source', status: 'approved', version: 2 }
const raw = {
  visitSummary: { summary: 'The doctor mentioned limited time and the rep asked when to return.', objectiveStatus: 'partial', objectiveStatusReason: 'Follow-up timing not specified.', evidence: [{ segmentIndex: 0 }] },
  customerUnderstanding: { needs: [], concerns: [], decisionCriteria: [], openQuestions: [] },
  criticalMoments: [{ observedBehavior: 'Mentioned time', interpretation: 'Could refer to being busy now', interpretationCertainty: 'inferred', evidence: { segmentIndex: 0, quote: 'Invented translated quote' }, betterResponseExample: null }],
  coachingPriority: { behavior: 'Clarify a follow-up time', betterPhrase: 'What time suits you?', practiceExercise: 'Ask one timing question.', successLooksLike: 'A time is clarified.', evidence: [{ segmentIndex: 1 }] },
  performance: [], commitments: [], strength: { behavior: 'Asked before returning', evidence: [{ segmentIndex: 1 }] },
  socialStyle: { customer: { strongestSignals: [], possibleStyle: null }, rep: { strongestSignals: [], possibleStyle: null }, adaptation: [], signalChanges: [] },
}
const req = (sessionType = 'human_partner') => new Request('http://localhost/api/reports/generate', {
  method: 'POST', body: JSON.stringify({ sessionType, sessionId: 's', lang: 'ar', analysisConsent: true }),
})
function database(owned = true, consent = true) {
  const filters: unknown[] = [], writes: string[] = []
  return { filters, writes, db: {
    auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) },
    from: (table: string) => {
      if (table === 'conversation_reports') return {
        insert: () => { writes.push(table); return { select: () => ({ single: async () => ({ data: { id: 'report' }, error: null }) }) } },
        update: () => ({ eq: () => ({ eq: () => ({ lt: async () => ({ error: null }) }) }) }),
      }
      const q = { select: () => q, eq: (key: string, value: unknown) => { filters.push([key, value]); return q },
        order: async () => ({ data: rows }), single: async () => ({ data: owned ? {
          consent_confirmed_at: consent ? '2026-10-16T00:00:00Z' : null,
          objective: 'Arrange follow-up', product_context: null, retention_policy: 'discard_after_report',
        } : null }) }
      return q
    },
  } }
}
beforeEach(() => {
  vi.stubEnv('IHIA_ENABLED', 'true'); vi.stubEnv('OPENAI_API_KEY', 'test-only')
  m.limit.mockResolvedValue(true); m.knowledge.mockResolvedValue([entry]); m.factory.mockReturnValue(m.complete)
  m.complete.mockResolvedValue(JSON.stringify(raw)); m.client.mockResolvedValue(database().db)
})
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })
describe('IHIA connection to existing human recording reports', () => {
  it.each(['human_partner', 'customer_visit'])('grounds %s analysis in original speech with separate dialect references', async sessionType => {
    const db = database(); m.client.mockResolvedValue(db.db)
    const res = await POST(req(sessionType))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.report.criticalMoments[0].evidence.quote).toBe(originalText)
    expect(data.report.transcriptVersion).toBe(2)
    expect(db.filters).toContainEqual(['rep_id', 'u'])
    expect(db.writes).toEqual(['conversation_reports'])
    expect(m.complete).toHaveBeenCalledTimes(4)
    for (const [args] of m.complete.mock.calls) {
      expect(args.system).toContain('IHIA Iraqi-language support')
      expect(args.system).toContain('Never replace a quote with a translation')
      expect(args.prompt).toContain(originalText)
      expect(args.prompt).toContain('Expert-fixture-source')
      expect(args.prompt).toContain('Write every free-text field in Arabic')
    }
  })
  it('continues cautiously without dictionary data and never uses drafts as references', async () => {
    m.knowledge.mockResolvedValue([{ ...entry, status: 'draft', source_reference: 'unapproved-source' }])
    expect((await POST(req())).status).toBe(200)
    expect(m.complete.mock.calls[0][0].prompt).not.toContain('unapproved-source')
    m.knowledge.mockRejectedValue(new Error('database unavailable'))
    expect((await POST(req())).status).toBe(200)
    expect(m.complete.mock.calls.at(-1)![0].prompt).toContain('No verified dialect gloss is available')
  })
  it('requires ownership and existing customer recording consent before analysis', async () => {
    m.client.mockResolvedValue(database(false).db)
    expect((await POST(req())).status).toBe(404)
    m.client.mockResolvedValue(database(true, false).db)
    expect((await POST(req('customer_visit'))).status).toBe(404)
    expect(m.complete).not.toHaveBeenCalled()
  })
  it('requires explicit AI analysis consent', async () => {
    const request = new Request('http://localhost/api/reports/generate', { method: 'POST', body: JSON.stringify({ sessionType: 'human_partner', sessionId: 's' }) })
    expect((await POST(request)).status).toBe(400)
    expect(m.complete).not.toHaveBeenCalled()
  })
  it('does not silently use a rejected provider when OpenAI configuration is missing', async () => {
    vi.stubEnv('OPENAI_API_KEY', ''); vi.stubEnv('ANTHROPIC_API_KEY', 'other')
    expect((await POST(req())).status).toBe(503)
    expect(m.complete).not.toHaveBeenCalled()
  })
})
