import { describe, expect, it } from 'vitest'
import { createEmptySession } from '@/schemas/session/factory'
import { validateKnowledgePack, type KnowledgePack } from '@/schemas/knowledge'
import type { SessionRecord } from '@/agents/orchestrator/types'
import { adaptAgentSession } from './fromAgentSession'

const r = validateKnowledgePack({ name: 'P', productName: 'Prod', items: [
  { id: 'f1', kind: 'indication', status: 'approved', text: { en: 'Indicated for adults with stage 1 hypertension.' }, sources: [{ title: 'Label', type: 'label', reference: 's1' }] },
  { id: 'p1', kind: 'prohibited_claim', status: 'approved', text: { en: 'cures heart disease' } },
] })
if (!r.ok) throw new Error(r.errors.join())
const pack: KnowledgePack = r.value

const turn = (turnIndex: number, role: 'doctor' | 'rep', text: string) =>
  ({ turnIndex, role, text, objectionType: null, clearStepsHit: [], state: null, vocalFeedback: null, createdAt: null })
const record = (knowledge?: KnowledgePack): SessionRecord => {
  const session = createEmptySession('s1', 'r1')
  session.lang = 'en'
  session.transcript = [turn(0, 'doctor', 'What is new?'), turn(1, 'rep', 'Honestly it cures heart disease.'), turn(2, 'doctor', 'Hmm.')]
  if (knowledge) session.knowledge = knowledge
  return { session, phase: 'reported', trace: [], report: null }
}

describe('adaptAgentSession knowledge', () => {
  it('carries both prompt sections and flags a rep turn that matches a prohibited claim', () => {
    const { context } = adaptAgentSession(record(pack))
    expect(context.knowledge?.analystSection).toContain('Indicated for adults')
    expect(context.knowledge?.coachSection).toContain('Indicated for adults')
    expect(context.knowledge?.prohibitedHits).toEqual([{ itemId: 'p1', phrase: 'cures heart disease', segmentIndex: 1 }])
  })

  it('never flags the doctor\'s own words', () => {
    const rec = record(pack)
    rec.session.transcript[0].text = 'Does it cure heart disease?'
    expect(adaptAgentSession(rec).context.knowledge?.prohibitedHits).toHaveLength(1)
  })

  it('has no knowledge entry for a session without a pack', () => {
    expect(adaptAgentSession(record()).context.knowledge).toBeUndefined()
  })
})
