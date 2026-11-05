import { describe, expect, it } from 'vitest'
import { listReps, resetPin, type ManagerStats } from './rep-pin-service'

const stats: ManagerStats = { companyId: 'co-1', reps: [{ id: 'r1', display_name: 'Ibrahim' }, { id: 'r2', display_name: 'Rana' }] }
const emails: Record<string, string | undefined> = { r1: '0780563731@s.styleshift.rep', r2: 'rana@gmail.com', other: '0790000000@s.styleshift.rep' }

function fakeDb(opts: { auditError?: boolean; updateError?: boolean; lookupError?: boolean } = {}) {
  const calls: string[] = []
  const audits: Array<Record<string, unknown>> = []
  const updates: Array<{ id: string; password: string }> = []
  const db = {
    auth: { admin: {
      getUserById: async (id: string) => opts.lookupError ? { data: null, error: { message: 'x' } } : { data: { user: emails[id] ? { email: emails[id] } : null }, error: null },
      updateUserById: async (id: string, patch: { password: string }) => { calls.push('update'); updates.push({ id, password: patch.password }); return { error: opts.updateError ? { message: 'x' } : null } },
    } },
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => { calls.push(`audit:${row.action}`); audits.push({ table, ...row }); return { error: opts.auditError && row.action === 'rep.pin_reset' ? { message: 'x' } : null } },
    }),
  }
  return { db: db as never, calls, audits, updates }
}

describe('listReps', () => {
  it('says which reps sign in with a mobile number and which with an email', async () => {
    const { db } = fakeDb()
    const r = await listReps(db, stats)
    expect(r.body.reps).toEqual([
      { id: 'r1', name: 'Ibrahim', kind: 'mobile', mobile: '0780563731' },
      { id: 'r2', name: 'Rana', kind: 'email', mobile: null },
    ])
  })
})

describe('resetPin', () => {
  it('records the reset first, then sets the new PIN, and returns it once', async () => {
    const { db, calls, audits, updates } = fakeDb()
    const r = await resetPin(db, 'mgr-1', stats, 'r1', '482913')
    expect(r).toEqual({ status: 200, body: { pin: '482913', repName: 'Ibrahim', mobile: '0780563731' } })
    expect(calls).toEqual(['audit:rep.pin_reset', 'update'])
    expect(updates).toEqual([{ id: 'r1', password: '482913' }])
    expect(audits[0]).toMatchObject({ table: 'audit_events', company_id: 'co-1', actor_id: 'mgr-1', action: 'rep.pin_reset', subject_type: 'rep', subject_id: 'r1' })
  })

  it('never puts the PIN in the audit record', async () => {
    const { db, audits } = fakeDb()
    await resetPin(db, 'mgr-1', stats, 'r1', '482913')
    expect(JSON.stringify(audits)).not.toContain('482913')
  })

  it('refuses a rep outside the manager\'s team, and a non-string id, without touching anything', async () => {
    const { db, calls } = fakeDb()
    expect((await resetPin(db, 'mgr-1', stats, 'other', '482913')).status).toBe(404)
    expect((await resetPin(db, 'mgr-1', stats, undefined, '482913')).status).toBe(404)
    expect((await resetPin(db, 'mgr-1', stats, { id: 'r1' }, '482913')).status).toBe(404)
    expect(calls).toEqual([])
  })

  it('refuses a rep who signs in with an email, because they have no PIN', async () => {
    const { db, calls } = fakeDb()
    const r = await resetPin(db, 'mgr-1', stats, 'r2', '482913')
    expect(r).toEqual({ status: 409, body: { error: 'not_a_pin_account' } })
    expect(calls).toEqual([])
  })

  it('changes nothing when the record cannot be written', async () => {
    const { db, calls } = fakeDb({ auditError: true })
    const r = await resetPin(db, 'mgr-1', stats, 'r1', '482913')
    expect(r.status).toBe(503)
    expect(calls).toEqual(['audit:rep.pin_reset'])
  })

  it('records a failed reset and does not hand out a PIN that was never set', async () => {
    const { db, calls } = fakeDb({ updateError: true })
    const r = await resetPin(db, 'mgr-1', stats, 'r1', '482913')
    expect(r).toEqual({ status: 503, body: { error: 'reset_failed' } })
    expect(calls).toEqual(['audit:rep.pin_reset', 'update', 'audit:rep.pin_reset_failed'])
  })

  it('reports a failed account lookup without changing anything', async () => {
    const { db, calls } = fakeDb({ lookupError: true })
    expect((await resetPin(db, 'mgr-1', stats, 'r1', '482913')).status).toBe(503)
    expect(calls).toEqual([])
  })
})
