import { describe, it, expect } from 'vitest'
import { createEmptySession } from '@/schemas/session/factory'
import { adaptAgentSession } from './fromAgentSession'
import type { SessionRecord } from '@/agents/orchestrator/types'

function record(): SessionRecord {
  const session = createEmptySession('s1', 'r1')
  session.transcript = [
    { turnIndex: 0, role: 'doctor', text: 'I have five minutes only.', objectionType: null, clearStepsHit: [], state: { trust: 0.4, skepticism: 0.6, engagement: 0.3, timePressure: 0.8 }, vocalFeedback: null, createdAt: '2026-09-24T09:00:00.000Z' },
    { turnIndex: 1, role: 'rep', text: 'Understood, I will be brief.', objectionType: null, clearStepsHit: [], state: null, vocalFeedback: null, createdAt: '2026-09-24T09:00:05.000Z' },
  ]
  session.socialStyle = { primary: 'driver', weights: { driver: 0.7, expressive: 0.1, amiable: 0.1, analytical: 0.1 }, dominant: 'driver', source: 'weighted', assertiveness: 'tell', responsiveness: 'controls' }
  session.physician.hiddenConcern = 'worried about switching cost'
  return { session, phase: 'ended', trace: [], report: null }
}

describe('adaptAgentSession', () => {
  it('maps doctor/rep turns to counterpart/rep segments with real timestamps, no audio offsets', () => {
    const { segments } = adaptAgentSession(record())
    expect(segments).toEqual([
      { segmentIndex: 0, speakerRole: 'counterpart', text: 'I have five minutes only.', startMs: null, endMs: null, createdAt: '2026-09-24T09:00:00.000Z' },
      { segmentIndex: 1, speakerRole: 'rep', text: 'Understood, I will be brief.', startMs: null, endMs: null, createdAt: '2026-09-24T09:00:05.000Z' },
    ])
  })
  it('marks the doctor persona as a simulation setting, never customer data', () => {
    const { context } = adaptAgentSession(record())
    expect(context.isSimulation).toBe(true)
    expect(context.simulationPersona).toEqual({ style: 'driver', hiddenConcern: 'worried about switching cost' })
    expect(context.savedCounterpartStyle).toBeNull() // no independent "saved profile" concept in this flow
  })
})
