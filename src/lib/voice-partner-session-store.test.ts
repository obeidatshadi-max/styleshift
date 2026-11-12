import { describe, expect, it, vi } from 'vitest'
import { priorRepTurns, recordResolvedSession } from './voice-partner-session-store'

function admin(rows: unknown[], insertError: unknown = null) {
  const insert = vi.fn(async () => ({ error: insertError }))
  return { insert, db: { from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: rows }) }) }), insert }) } as never }
}
const session = { id: 's1', repId: 'rep-1', doctorId: 'd1', style: 'driver', objectionType: 'doubt' as const, outcome: 'escalated' as const, clearSteps: ['listen' as const, 'listen' as const], turnCount: 2, difficulty: null }

describe('voice partner session store', () => {
  it('rebuilds turn count and CLEAR steps from the rows the server stored', async () => {
    const { db } = admin([
      { role: 'doctor', clear_steps_hit: [] },
      { role: 'rep', clear_steps_hit: ['listen'] }, { role: 'doctor', clear_steps_hit: [] },
      { role: 'rep', clear_steps_hit: ['listen', 'clarify', 'bogus'] },
    ])
    expect(await priorRepTurns(db, 's1', 'rep-1')).toEqual({ started: true, count: 2, clearSteps: ['listen', 'clarify'] })
  })
  it('a session the server never opened has not started', async () => {
    expect((await priorRepTurns(admin([]).db, 's1', 'rep-1')).started).toBe(false)
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
