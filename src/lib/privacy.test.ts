import { describe, expect, it, vi } from 'vitest'

const calls: string[] = []
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {}
      chain.delete = () => { calls.push(`${table}:delete`); return chain }
      chain.eq = (c: string, v: unknown) => { calls.push(`${table}:eq:${c}=${v}`); return chain }
      chain.in = (c: string, v: unknown[]) => { calls.push(`${table}:in:${c}=${v.join('|')}`); return chain }
      chain.then = (resolve: (v: unknown) => void) => resolve({ error: null })
      return chain
    },
  }),
}))

import { deleteVoiceHistory } from './privacy'

describe('deleteVoiceHistory', () => {
  it('also removes practice transcripts and AI reports (they hold quotes), scoped to the rep and never customer visits', async () => {
    await deleteVoiceHistory('rep-9')
    expect(calls).toContain('transcript_segments:eq:rep_id=rep-9')
    expect(calls).toContain('transcript_segments:eq:session_type=human_partner')
    expect(calls).toContain('conversation_reports:eq:rep_id=rep-9')
    expect(calls).toContain('conversation_reports:in:session_type=human_partner|ai_doctor_voice|ai_doctor_text')
    expect(calls).toContain('drill_attempts:eq:rep_id=rep-9')
    expect(calls.some(c => c.includes('customer_visit'))).toBe(false)
  })
})
