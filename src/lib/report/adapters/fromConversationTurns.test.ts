import { describe, it, expect } from 'vitest'
import { adaptConversationTurns } from './fromConversationTurns'
import type { ConversationTurn, Doctor } from '@/types/game'

const turns: ConversationTurn[] = [
  { id: 't0', session_id: 's1', rep_id: 'r1', doctor_id: 'd1', turn_index: 0, role: 'doctor', text: 'Why should I switch?', objection_type: 'cost', clear_steps_hit: [], trust: 0.3, skepticism: 0.7, engagement: 0.4, time_pressure: 0.2, created_at: '2026-09-24T09:00:00.000Z' },
  { id: 't1', session_id: 's1', rep_id: 'r1', doctor_id: 'd1', turn_index: 1, role: 'rep', text: 'It cuts your refill calls in half.', objection_type: null, clear_steps_hit: ['clarify'], trust: null, skepticism: null, engagement: null, time_pressure: null, created_at: '2026-09-24T09:00:04.000Z' },
]
const doctor = { id: 'd1', style: 'analytical', style_driver: null, style_expressive: null, style_amiable: null, style_analytical: null } as unknown as Doctor

describe('adaptConversationTurns', () => {
  it('maps turns to segments, doctor as counterpart, no audio offsets', () => {
    const { segments } = adaptConversationTurns(turns, doctor)
    expect(segments[0]).toEqual({ segmentIndex: 0, speakerRole: 'counterpart', text: 'Why should I switch?', startMs: null, endMs: null, createdAt: '2026-09-24T09:00:00.000Z' })
    expect(segments[1].speakerRole).toBe('rep')
  })
  it('resolves the doctor persona style via the legacy single-style field, flagged as simulation', () => {
    const { context } = adaptConversationTurns(turns, doctor)
    expect(context.isSimulation).toBe(true)
    expect(context.simulationPersona?.style).toBe('analytical')
  })
})
