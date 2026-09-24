import { describe, it, expect, vi } from 'vitest'
import { persistReport } from './persistReport'
import type { ConversationReport } from '@/schemas/conversationReport'

const report = { reportSchemaVersion: 1, sessionType: 'human_partner', transcriptVersion: 2 } as unknown as ConversationReport

function mockSupabase() {
  const updateEq = vi.fn(async () => ({ error: null }))
  const insertSelectSingle = vi.fn(async () => ({ data: { id: 'report-2' }, error: null }))
  return {
    from: (table: string) => {
      if (table !== 'conversation_reports') throw new Error('unexpected table')
      return {
        update: () => ({ eq: () => ({ eq: () => ({ lt: updateEq }) }) }),
        insert: () => ({ select: () => ({ single: insertSelectSingle }) }),
      }
    },
    _updateEq: updateEq, _insertSelectSingle: insertSelectSingle,
  }
}

describe('persistReport', () => {
  it('inserts the new report and marks older transcript versions superseded', async () => {
    const supabase = mockSupabase()
    const res = await persistReport(supabase as never, report, 'human_partner', 'sess-1', 'rep-1')
    expect(res).toEqual({ ok: true, id: 'report-2' })
    expect(supabase._insertSelectSingle).toHaveBeenCalled()
  })
})
