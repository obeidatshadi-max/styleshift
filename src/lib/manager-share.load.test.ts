import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn() }))
import { createAdminClient } from '@/lib/supabase-admin'
import { getSharedItems } from './manager-share'

type Call = { method: string; args: unknown[] }
let calls: Record<string, Call[]>
let rows: Record<string, unknown[]>

// A query builder that records every filter and resolves to the rows configured for its table.
function builder(table: string) {
  const b: any = new Proxy({}, {
    get: (_t, method: string) => {
      if (method === 'then') return (resolve: (v: unknown) => void) => resolve({ data: rows[table] ?? [], error: null })
      return (...args: unknown[]) => { (calls[table] ??= []).push({ method, args }); return b }
    },
  })
  return b
}
const has = (table: string, method: string, ...args: unknown[]) =>
  (calls[table] ?? []).some(c => c.method === method && JSON.stringify(c.args) === JSON.stringify(args))

beforeEach(() => {
  calls = {}; rows = {}
  vi.mocked(createAdminClient).mockReturnValue({ from: (t: string) => builder(t) } as never)
})

const sim = { id: 'sim-1', rep_id: 'rep-1', doctor_id: 'doc-1', created_at: '2026-11-03T08:00:00Z', shared_with_manager_at: '2026-11-03T09:00:00Z' }
const report = (summary: string) => ({ visitSummary: { summary }, coachingPriority: { behavior: 'Ask first', successLooksLike: 'A need is stated.' } })

describe('getSharedItems', () => {
  it('reads nothing when the manager has no reps', async () => {
    expect(await getSharedItems('company-1', [])).toEqual([])
    expect(Object.keys(calls)).toEqual([])
  })

  it('only reads items shared with THIS company, for THIS company\'s reps', async () => {
    await getSharedItems('company-1', ['rep-1', 'rep-2'])
    for (const table of ['coach_debriefs', 'agent_sessions']) {
      expect(has(table, 'eq', 'shared_with_company_id', 'company-1')).toBe(true)
      expect(has(table, 'in', 'rep_id', ['rep-1', 'rep-2'])).toBe(true)
      expect(has(table, 'not', 'shared_with_manager_at', 'is', null)).toBe(true)
    }
  })

  it('looks up simulation reports only for the company\'s reps', async () => {
    rows.agent_sessions = [sim]
    await getSharedItems('company-1', ['rep-1'])
    expect(has('conversation_reports', 'in', 'rep_id', ['rep-1'])).toBe(true)
  })

  it('uses a report only when it belongs to the same rep as the session', async () => {
    rows.agent_sessions = [sim]
    rows.doctors = [{ id: 'doc-1', name: 'Dr. Sim' }]
    // The only report for this session id belongs to a different rep: it must not be shown.
    rows.conversation_reports = [{ session_id: 'sim-1', rep_id: 'rep-2', report: report('Someone else\'s report.'), created_at: '2026-11-03T10:00:00Z' }]
    expect(await getSharedItems('company-1', ['rep-1', 'rep-2'])).toEqual([])
    // With the owner's report present (newest first), the owner's report is used.
    rows.conversation_reports = [
      { session_id: 'sim-1', rep_id: 'rep-2', report: report('Someone else\'s report.'), created_at: '2026-11-03T11:00:00Z' },
      { session_id: 'sim-1', rep_id: 'rep-1', report: report('The rep\'s own report.'), created_at: '2026-11-03T10:00:00Z' },
    ]
    const items = await getSharedItems('company-1', ['rep-1', 'rep-2'])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'simulation', repId: 'rep-1', doctorName: 'Dr. Sim', summary: 'The rep\'s own report.' })
  })

  it('merges debriefs and simulations, newest practice first', async () => {
    rows.coach_debriefs = [{ id: 'deb-1', rep_id: 'rep-1', doctor_name: 'Dr. A', created_at: '2026-11-04T08:00:00Z', shared_with_manager_at: '2026-11-04T09:00:00Z', result: { report: { summary: 'Debrief summary.' } } }]
    rows.agent_sessions = [sim]
    rows.conversation_reports = [{ session_id: 'sim-1', rep_id: 'rep-1', report: report('Sim summary.'), created_at: '2026-11-03T10:00:00Z' }]
    const items = await getSharedItems('company-1', ['rep-1'])
    expect(items.map(i => i.id)).toEqual(['deb-1', 'sim-1'])
  })
})
