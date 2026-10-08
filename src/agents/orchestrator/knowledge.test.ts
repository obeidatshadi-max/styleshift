import { describe, expect, it, vi } from 'vitest'
import { createEmptySession } from '@/schemas/session/factory'
import { createDoctorAgent } from '@/agents/doctor'
import { createBehaviorAnalystAgent } from '@/agents/behaviorAnalyst'
import { createCoachAgent } from '@/agents/coach'
import { validateKnowledgePack, type KnowledgePack } from '@/schemas/knowledge'
import type { CompleteFn } from '@/agents/llm'
import { createOrchestrator } from './index'
import { InMemorySessionStore } from './memory-store'
import type { PersonaLoader } from './types'

const persona: PersonaLoader = {
  async load(repId, doctorId) {
    if (doctorId !== 'doc-1') return null
    const base = createEmptySession('x', repId)
    return {
      rep: base.rep,
      physician: { ...base.physician, doctorId, name: 'Dr. Salim', initialState: { trust: 50, skepticism: 50, engagement: 50, timePressure: 30 } },
      specialty: 'cardiology', socialStyle: base.socialStyle,
      objections: { activeType: null, onProfile: [], notes: null }, product: base.product,
    }
  },
}
const parsed = validateKnowledgePack({ name: 'P', productName: 'Prod', items: [{ id: 'f1', kind: 'indication', status: 'approved', text: { en: 'Indicated for adults with stage 1 hypertension.' }, sources: [{ title: 'Label', type: 'label', reference: 's1' }] }] })
if (!parsed.ok) throw new Error(parsed.errors.join())
const pack: KnowledgePack = parsed.value

function build(knowledge?: (scenarioId: string, repId: string) => Promise<KnowledgePack | null>) {
  const model = vi.fn(async () => 'Hmm. Tell me more.')
  const store = new InMemorySessionStore()
  const complete = model as unknown as CompleteFn
  const orchestrator = createOrchestrator({
    store, personas: persona,
    doctor: createDoctorAgent(complete), analyst: createBehaviorAnalystAgent(complete), coach: createCoachAgent(complete),
    newId: () => 'sess-1', now: () => new Date('2026-10-08T01:00:00Z'), pickObjection: () => 'doubt',
    ...(knowledge ? { knowledge } : {}),
  })
  return { store, orchestrator, model }
}

describe('knowledge snapshot at session start', () => {
  it('snapshots the scenario\'s pack onto the session and the doctor prompt uses it', async () => {
    const knowledge = vi.fn(async () => pack)
    const { orchestrator, store, model } = build(knowledge)
    const started = await orchestrator.start({ repId: 'rep-1', doctorId: 'doc-1', scenarioId: 'sc-1' })
    expect(started.ok).toBe(true)
    expect(knowledge).toHaveBeenCalledWith('sc-1', 'rep-1')
    expect((await store.get('sess-1'))!.session.knowledge?.items[0].id).toBe('f1')
    expect((model.mock.calls[0] as unknown as [{ prompt: string }])[0].prompt).toContain('Indicated for adults with stage 1 hypertension.')
  })

  it('starts generic when the lookup returns nothing or throws', async () => {
    for (const lookup of [async () => null, async (): Promise<KnowledgePack | null> => { throw new Error('db down') }]) {
      const { orchestrator, store } = build(lookup)
      expect((await orchestrator.start({ repId: 'rep-1', doctorId: 'doc-1', scenarioId: 'sc-1' })).ok).toBe(true)
      expect((await store.get('sess-1'))!.session.knowledge).toBeUndefined()
    }
  })

  it('does not look anything up for a session that is not from a scenario', async () => {
    const knowledge = vi.fn(async () => pack)
    const { orchestrator } = build(knowledge)
    await orchestrator.start({ repId: 'rep-1', doctorId: 'doc-1' })
    expect(knowledge).not.toHaveBeenCalled()
  })
})
