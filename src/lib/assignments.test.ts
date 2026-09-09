import { describe, it, expect } from 'vitest'
import { latestReplyPerRep } from './assignments'
import type { AssignmentReply } from '@/types/game'

function reply(overrides: Partial<AssignmentReply>): AssignmentReply {
  return {
    id: 'r1', assignment_id: 'a1', rep_id: 'rep1', kind: 'note',
    session_id: null, note_text: 'hi', created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('latestReplyPerRep', () => {
  it('keeps the most recent reply per rep', () => {
    const replies = [
      reply({ id: 'r1', rep_id: 'rep1', created_at: '2026-01-01T00:00:00Z', note_text: 'first' }),
      reply({ id: 'r2', rep_id: 'rep1', created_at: '2026-01-02T00:00:00Z', note_text: 'second' }),
      reply({ id: 'r3', rep_id: 'rep2', created_at: '2026-01-01T00:00:00Z', note_text: 'only' }),
    ]
    const out = latestReplyPerRep(replies)
    expect(out.get('rep1')?.note_text).toBe('second')
    expect(out.get('rep2')?.note_text).toBe('only')
  })

  it('returns an empty map for no replies', () => {
    expect(latestReplyPerRep([]).size).toBe(0)
  })

  it('order in the input does not matter', () => {
    const replies = [
      reply({ id: 'r2', rep_id: 'rep1', created_at: '2026-01-02T00:00:00Z', note_text: 'second' }),
      reply({ id: 'r1', rep_id: 'rep1', created_at: '2026-01-01T00:00:00Z', note_text: 'first' }),
    ]
    expect(latestReplyPerRep(replies).get('rep1')?.note_text).toBe('second')
  })
})
