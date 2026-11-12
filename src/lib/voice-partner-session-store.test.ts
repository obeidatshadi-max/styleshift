import { describe, expect, it, vi } from 'vitest'
import { sessionState, recordResolvedSession } from './voice-partner-session-store'

function admin(rows: unknown[], insertError: unknown = null, resolved = false) {
  const insert = vi.fn(async () => ({ error: insertError }))
  const from = (table: string) => table === 'voice_partner_sessions'
    ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: resolved ? { id: 's1' } : null }) }) }), insert }
    : { select: () => ({ eq: () => ({ eq: async () => ({ data: rows }) }) }), insert }
  return { insert, db: { from } as never }
}
const session = { id: 's1', repId: 'rep-1', doctorId: 'd1', style: 'driver', objectionType: 'doubt' as const, outcome: 'escalated' as const, clearSteps: ['listen' as const, 'listen' as const], turnCount: 2, difficulty: null }

describe('voice partner session store', () => {
  it('rebuilds turn count, next index, doctor and CLEAR steps from the rows the server stored', async () => {
    const { db } = admin([
      { turn_index: 3, role: 'rep', clear_steps_hit: ['listen', 'clarify', 'bogus'], doctor_id: 'd1' },
      { turn_index: 0, role: 'doctor', clear_steps_hit: [], doctor_id: 'd1' },
      { turn_index: 1, role: 'rep', clear_steps_hit: ['listen'], doctor_id: 'd1' }, { turn_index: 2, role: 'doctor', clear_steps_hit: [], doctor_id: 'd1' },
    ])
    expect(await sessionState(db, 's1', 'rep-1')).toEqual({ started: true, doctorId: 'd1', rowCount: 4, count: 2, clearSteps: ['listen', 'clarify'], resolved: false })
  })
  it('a session the server never opened has not started', async () => {
    expect((await sessionState(admin([]).db, 's1', 'rep-1')).started).toBe(false)
  })
  it('reports a session the judge already resolved', async () => {
    expect((await sessionState(admin([{ turn_index: 0, role: 'doctor', clear_steps_hit: [], doctor_id: 'd1' }], null, true).db, 's1', 'rep-1')).resolved).toBe(true)
  })
  it('stores a result once, de-duplicating CLEAR steps', async () => {
    const { db, insert } = admin([])
    expect(await recordResolvedSession(db, session)).toBe('saved')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ id: 's1', rep_id: 'rep-1', outcome: 'escalated', clear_steps_hit: ['listen'], turn_count: 2 }))
  })
  it('a second resolution of the same session is not stored over the first', async () => {
    expect(await recordResolvedSession(admin([], { code: '23505', message: 'duplicate' }).db, { ...session, outcome: 'won' })).toBe('exists')
  })
})
