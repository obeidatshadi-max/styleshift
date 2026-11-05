import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createKeyMessage, listForUser, practiceKeyMessage } from './key-message-service'

const REP = 'rep-1'
const MGR = 'mgr-1'
const DOC = '11111111-1111-4111-8111-111111111111'
const VERSIONS = { driver: 'Drive. Extra claim.', expressive: 'Express.', amiable: 'Amiable.', analytical: 'Analytical.' }
const feedback = { styleFit: 'a', faithful: 'b', strength: 'c', tryNext: 'd' }

type Reply = { data: unknown; error?: unknown }
/** Chainable stand-in: every query method returns itself, awaiting it yields the table's configured reply. */
function fakeDb(tables: Record<string, Reply | ((op: string) => Reply)>) {
  const calls: Array<{ table: string; op: string; arg?: unknown }> = []
  const db = {
    from(table: string) {
      let op = 'select'
      const reply = () => { const t = tables[table]; return (typeof t === 'function' ? t(op) : t) ?? { data: null } }
      const q: Record<string, unknown> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') return (res: (v: Reply) => unknown) => Promise.resolve(reply()).then(res)
          return (arg?: unknown) => {
            if (prop === 'insert' || prop === 'upsert' || prop === 'update') { op = prop; calls.push({ table, op, arg }) }
            return q
          }
        },
      })
      return q
    },
  }
  return { db: db as unknown as SupabaseClient, calls }
}
/** Successive awaits on the same table get successive replies; the last one repeats. */
const seq = (...replies: Reply[]) => { let i = 0; return () => replies[Math.min(i++, replies.length - 1)] }
const llm = (...replies: Array<string | null>) => { const f = vi.fn(); replies.forEach(r => f.mockResolvedValueOnce(r)); return f }
const input = { text: 'Statin X lowers LDL.', mode: 'written' as const, doctorId: null, repIds: null, dueDate: null }

describe('createKeyMessage', () => {
  it('rep: writes for themselves only, removes added claims, saves', async () => {
    const { db, calls } = fakeDb({ profiles: { data: { company_id: 'co', role: 'rep' } }, key_messages: { data: { id: 'new' } } })
    const complete = llm(JSON.stringify(VERSIONS), JSON.stringify({ added: { driver: ['Extra claim.'] } }))
    const r = await createKeyMessage(db, complete, REP, input)
    expect(r.status).toBe(200)
    const saved = calls.find(c => c.op === 'insert')!.arg as Record<string, unknown>
    expect(saved).toMatchObject({ created_by: REP, created_by_role: 'rep', rep_ids: [REP], company_id: 'co' })
    expect((saved.versions as Record<string, string>).driver).toBe('Drive.')
  })

  it('rep: cannot address other reps or another rep\'s doctor', async () => {
    const other = fakeDb({ profiles: { data: { company_id: 'co', role: 'rep' } } })
    expect((await createKeyMessage(other.db, llm(), REP, { ...input, repIds: ['rep-2'] })).status).toBe(403)
    const doctor = fakeDb({ profiles: { data: { company_id: 'co', role: 'rep' } }, doctors: { data: null } })
    expect((await createKeyMessage(doctor.db, llm(), REP, { ...input, doctorId: DOC })).status).toBe(404)
  })

  it('manager: no customer, and only reps of their own company', async () => {
    const a = fakeDb({ profiles: { data: { company_id: 'co', role: 'manager' } } })
    expect((await createKeyMessage(a.db, llm(), MGR, { ...input, doctorId: DOC })).status).toBe(400)
    const b = fakeDb({ profiles: seq({ data: { company_id: 'co', role: 'manager' } }, { data: [{ id: 'r1' }] }) })
    expect((await createKeyMessage(b.db, llm(), MGR, { ...input, repIds: ['r1', 'r2'] })).status).toBe(400)
  })

  it('fails closed when versions cannot be generated, and saves nothing', async () => {
    const { db, calls } = fakeDb({ profiles: { data: { company_id: 'co', role: 'rep' } } })
    expect((await createKeyMessage(db, llm(null), REP, input)).status).toBe(502)
    expect((await createKeyMessage(db, llm('not json'), REP, input)).status).toBe(502)
    expect(calls.some(c => c.op === 'insert')).toBe(false)
  })

  it('fails open when the fidelity check is down: versions kept as generated', async () => {
    const { db, calls } = fakeDb({ profiles: { data: { company_id: 'co', role: 'rep' } }, key_messages: { data: { id: 'new' } } })
    const r = await createKeyMessage(db, llm(JSON.stringify(VERSIONS), null), REP, input)
    expect(r.status).toBe(200)
    expect(((calls.find(c => c.op === 'insert')!.arg as Record<string, unknown>).versions as Record<string, string>).driver).toBe('Drive. Extra claim.')
  })

  it('403 for a user with no company', async () => {
    const { db } = fakeDb({ profiles: { data: { company_id: null, role: 'rep' } } })
    expect((await createKeyMessage(db, llm(), REP, input)).status).toBe(403)
  })
})

describe('practiceKeyMessage', () => {
  const message = (over: Record<string, unknown> = {}) => ({ id: 'm1', company_id: 'co', created_by: MGR, created_by_role: 'manager', rep_ids: null, active: true, created_at: '2026-11-01T00:00:00Z', message_text: 'Statin X lowers LDL.', ...over })
  const ok = (over: Record<string, unknown> = {}) => fakeDb({ profiles: { data: { company_id: 'co', role: 'rep' } }, key_messages: { data: message(over) }, key_message_attempts: { data: { id: 'att' } }, key_message_progress: { data: null } })
  const attempt = { style: 'driver' as const, text: 'Statin X lowers LDL, can I start a patient?', share: false, spoken: false }

  it('saves the attempt, returns feedback, marks the message done', async () => {
    const { db, calls } = ok()
    const r = await practiceKeyMessage(db, llm(JSON.stringify(feedback)), REP, 'm1', attempt)
    expect(r).toEqual({ status: 200, body: { id: 'att', feedback } })
    expect(calls.find(c => c.table === 'key_message_attempts')!.arg).toMatchObject({ rep_id: REP, style: 'driver', shared_with_manager: false })
    expect(calls.find(c => c.op === 'upsert')!.arg).toEqual({ key_message_id: 'm1', rep_id: REP })
  })

  it('asks the coach to judge words only when the attempt is spoken', async () => {
    const { db } = ok()
    const complete = llm(JSON.stringify(feedback))
    await practiceKeyMessage(db, complete, REP, 'm1', { ...attempt, spoken: true })
    expect(complete.mock.calls[0][0].system).toMatch(/transcript of the rep speaking aloud/)
    const plain = llm(JSON.stringify(feedback))
    await practiceKeyMessage(ok().db, plain, REP, 'm1', attempt)
    expect(plain.mock.calls[0][0].system).not.toMatch(/transcript of the rep speaking aloud/)
  })

  it('shares with the manager only when the rep ticks share AND a manager set the message', async () => {
    const a = ok()
    await practiceKeyMessage(a.db, llm(JSON.stringify(feedback)), REP, 'm1', { ...attempt, share: true })
    expect(a.calls.find(c => c.table === 'key_message_attempts')!.arg).toMatchObject({ shared_with_manager: true })
    const own = ok({ created_by: REP, created_by_role: 'rep', rep_ids: [REP] })
    await practiceKeyMessage(own.db, llm(JSON.stringify(feedback)), REP, 'm1', { ...attempt, share: true })
    expect(own.calls.find(c => c.table === 'key_message_attempts')!.arg).toMatchObject({ shared_with_manager: false })
  })

  it('managers cannot practise; a message addressed to another rep is not found', async () => {
    const mgr = fakeDb({ profiles: { data: { company_id: 'co', role: 'manager' } } })
    expect((await practiceKeyMessage(mgr.db, llm(), MGR, 'm1', attempt)).status).toBe(403)
    expect((await practiceKeyMessage(ok({ rep_ids: ['rep-2'] }).db, llm(), REP, 'm1', attempt)).status).toBe(404)
    expect((await practiceKeyMessage(ok({ active: false }).db, llm(), REP, 'm1', attempt)).status).toBe(404)
  })

  it('502 and nothing saved when the coach is down or returns junk', async () => {
    const { db, calls } = ok()
    expect((await practiceKeyMessage(db, llm(null), REP, 'm1', attempt)).status).toBe(502)
    expect((await practiceKeyMessage(db, llm('{"styleFit":"only"}'), REP, 'm1', attempt)).status).toBe(502)
    expect(calls.length).toBe(0)
  })
})

describe('listForUser', () => {
  const rows = [
    { id: 'm-all', company_id: 'co', created_by: MGR, created_by_role: 'manager', rep_ids: null, message_text: 'A', mode: 'written', versions: null, due_date: null, doctor_id: null, active: true, created_at: '2026-11-01T00:00:00Z' },
    { id: 'm-other', company_id: 'co', created_by: MGR, created_by_role: 'manager', rep_ids: ['rep-2'], message_text: 'B', mode: 'written', versions: null, due_date: null, doctor_id: null, active: true, created_at: '2026-11-01T00:00:00Z' },
    { id: 'm-rep2-own', company_id: 'co', created_by: 'rep-2', created_by_role: 'rep', rep_ids: ['rep-2'], message_text: 'C', mode: 'written', versions: null, due_date: null, doctor_id: DOC, active: true, created_at: '2026-11-01T00:00:00Z' },
  ]

  it('rep sees only their own and addressed messages, never another rep\'s private one', async () => {
    const { db } = fakeDb({ profiles: { data: { company_id: 'co', role: 'rep' } }, key_messages: { data: rows }, key_message_progress: { data: [{ key_message_id: 'm-all' }] }, doctors: { data: [] } })
    const r = await listForUser(db, REP)
    expect((r.body.messages as Array<{ id: string; completed: boolean }>).map(m => [m.id, m.completed])).toEqual([['m-all', true]])
  })

  it('manager sees only manager messages with completion counts', async () => {
    const reps = [{ id: REP, display_name: 'Rana' }, { id: 'rep-2', display_name: 'Omar' }]
    const { db } = fakeDb({
      profiles: seq({ data: { company_id: 'co', role: 'manager' } }, { data: reps }),
      key_messages: { data: rows }, key_message_progress: { data: [{ key_message_id: 'm-all', rep_id: REP }] },
      key_message_attempts: { data: [{ key_message_id: 'm-all', rep_id: REP, style: 'driver', attempt_text: 'Shared text', feedback: null, created_at: '2026-11-02T00:00:00Z' }] },
    })
    const r = await listForUser(db, MGR)
    expect((r.body.messages as Array<{ shared: unknown[] }>)[0].shared).toEqual([{ repName: 'Rana', style: 'driver', text: 'Shared text', feedback: null, createdAt: '2026-11-02T00:00:00Z' }])
    const messages = r.body.messages as Array<{ id: string; total: number; completed: number }>
    expect(messages.map(m => m.id)).toEqual(['m-all', 'm-other'])
    expect(messages[0]).toMatchObject({ total: 2, completed: 1 })
    expect(messages[1]).toMatchObject({ total: 1, completed: 0 })
    expect(JSON.stringify(r.body)).not.toContain('m-rep2-own')
  })
})
