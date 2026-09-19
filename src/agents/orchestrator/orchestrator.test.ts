import { describe, it, expect, vi } from 'vitest'
import type { Doctor } from '@/types/game'
import { createEmptySession } from '@/schemas/session/factory'
import type { Observation } from '@/schemas/observation'
import type { Difficulty } from '@/lib/voice-partner-core'
import { scoreSession } from '@/scoring/engine'
import { createDoctorAgent } from '@/agents/doctor'
import { createBehaviorAnalystAgent } from '@/agents/behaviorAnalyst'
import { createCoachAgent } from '@/agents/coach'
import type { CompleteFn } from '@/agents/llm'
import { createOrchestrator, type OrchestratorDeps } from './index'
import { InMemorySessionStore } from './memory-store'
import { applyAgentPatch, AgentBoundaryError } from './patch'
import { personaFromDoctor } from './persona'
import type { PersonaLoader } from './types'

const REP = 'rep-1'
const MSG1 = 'Our product is great and works for everyone.'
const MSG2 = 'What worries you most about your patients?'

const persona: PersonaLoader = {
  async load(repId, doctorId) {
    if (doctorId !== 'doc-1') return null
    const base = createEmptySession('x', repId)
    return {
      rep: { ...base.rep, displayName: 'Rana' },
      physician: { ...base.physician, doctorId, name: 'Dr. Salim', hiddenConcern: 'SECRET-CONCERN', initialState: { trust: 50, skepticism: 50, engagement: 50, timePressure: 30 } },
      specialty: 'cardiology', socialStyle: base.socialStyle,
      objections: { activeType: null, onProfile: [], notes: null }, product: base.product,
    }
  },
}

/** One fake model that answers as whichever agent is calling, by system prompt. */
function fakeModel(opts: { coachFails?: () => boolean; analystFails?: () => boolean } = {}): CompleteFn {
  return vi.fn(async ({ system }) => {
    if (system.includes('ONLY job is to be that physician')) return 'Hmm. Tell me more.'
    if (system.includes('behavioral observer')) {
      if (opts.analystFails?.()) return 'garbage'
      return JSON.stringify({ observations: [
        { competency: 'discovery', behavior: 'premature_pitch', observation: 'The rep pitched before asking anything.', evidence: [{ turnIndex: 1, quote: MSG1 }], direction: 'negative', confidence: 0.9 },
        { competency: 'questioning', behavior: 'open_question', observation: 'The rep asked about the doctor\'s patients.', evidence: [{ turnIndex: 3, quote: MSG2 }], direction: 'positive', confidence: 0.9 },
      ] })
    }
    if (opts.coachFails?.()) return null
    return JSON.stringify({ points: [{
      ref: 'c1', whatHappened: 'You pitched first.', whyItMattered: 'The doctor gave a flat reply.', whatToDoDifferently: 'Ask first.',
      betterResponseExample: 'Before I share anything, which patients matter most to you?', practiceAction: 'Ask two open questions before any pitch.', objectiveId: null,
    }] })
  })
}

function build(model: CompleteFn = fakeModel(), overrides: Partial<OrchestratorDeps> = {}, maxRepTurns?: number) {
  const store = new InMemorySessionStore()
  const orchestrator = createOrchestrator({
    store, personas: persona,
    doctor: createDoctorAgent(model), analyst: createBehaviorAnalystAgent(model), coach: createCoachAgent(model),
    newId: () => 'sess-1', now: () => new Date('2026-09-19T01:00:00Z'), pickObjection: () => 'doubt',
    ...overrides,
  }, { maxRepTurns })
  return { store, orchestrator, model }
}

async function playThrough(o: ReturnType<typeof build>['orchestrator']) {
  const started = await o.start({ repId: REP, doctorId: 'doc-1' })
  expect(started.ok).toBe(true)
  await o.sendMessage('sess-1', REP, MSG1)
  await o.sendMessage('sess-1', REP, MSG2)
}

describe('full workflow', () => {
  it('runs start -> role-play -> end -> analyze -> score -> coach -> report in order', async () => {
    const { orchestrator, store } = build()
    const started = await orchestrator.start({ repId: REP, doctorId: 'doc-1', lang: 'en' })
    expect(started).toMatchObject({ ok: true, sessionId: 'sess-1', doctorText: 'Hmm. Tell me more.' })

    const mid = await store.get('sess-1')
    expect(mid?.phase).toBe('in_roleplay')
    expect(mid?.session.transcript).toHaveLength(1)
    expect(mid?.session.objections.activeType).toBe('doubt')

    await orchestrator.sendMessage('sess-1', REP, MSG1)
    const sent = await orchestrator.sendMessage('sess-1', REP, MSG2)
    expect(sent).toMatchObject({ ok: true, repTurns: 2 })
    expect((await store.get('sess-1'))!.session.transcript).toHaveLength(5)

    const ended = await orchestrator.endSimulation('sess-1', REP)
    expect(ended.ok).toBe(true)
    if (!ended.ok) return
    expect(ended.phase).toBe('reported')
    expect(ended.report.scores.overall).not.toBeNull()
    expect(ended.report.coachingStatus).toBe('ready')
    expect(ended.report.coaching).toHaveLength(1)
    expect(ended.report.header).toMatchObject({ physicianName: 'Dr. Salim', specialty: 'Cardiology', repTurns: 2, outcome: 'abandoned' })

    const steps = (await store.get('sess-1'))!.trace.map(t => t.step)
    expect(steps).toEqual([
      'create_session', 'load_persona', 'doctor_open', 'doctor_reply', 'doctor_reply',
      'end_simulation', 'analyze', 'score', 'coach', 'report',
    ])
  })

  it('never leaks internal state or the hidden concern into the report', async () => {
    const { orchestrator } = build()
    await playThrough(orchestrator)
    const ended = await orchestrator.endSimulation('sess-1', REP)
    const json = JSON.stringify(ended.ok ? ended.report : {})
    expect(json).not.toContain('SECRET-CONCERN')
    expect(json).not.toContain('"trust"')
    expect(json).not.toContain('"skepticism"')
  })

  it('records the outcome the user ended with', async () => {
    const { orchestrator } = build()
    await playThrough(orchestrator)
    const ended = await orchestrator.endSimulation('sess-1', REP, { outcome: 'won' })
    expect(ended.ok && ended.report.header.outcome).toBe('won')
  })
})

describe('coordination only', () => {
  it('scoring goes through the injected deterministic scorer, with the analyst\'s observations', async () => {
    const scorer = vi.fn((obs: Observation[], d: Difficulty) => ({ ...scoreSession(obs, d), overall: 42, configVersion: 'test' }))
    const { orchestrator } = build(fakeModel(), { scorer })
    await playThrough(orchestrator)
    const ended = await orchestrator.endSimulation('sess-1', REP)
    expect(scorer).toHaveBeenCalledTimes(1)
    expect(scorer.mock.calls[0][0].map((o: { behavior: string }) => o.behavior).sort()).toEqual(['open_question', 'premature_pitch'])
    expect(ended.ok && ended.report.scores.overall).toBe(42)
  })

  it('enforces agent boundaries and append-only transcript', () => {
    const s = createEmptySession('s', 'r')
    expect(() => applyAgentPatch('doctor', s, { observations: [] })).toThrow(AgentBoundaryError)
    expect(() => applyAgentPatch('coach', s, { scores: null })).toThrow(AgentBoundaryError)
    const withTurn = applyAgentPatch('doctor', s, { transcript: [{ turnIndex: 0, role: 'doctor', text: 'hi', objectionType: null, clearStepsHit: [], state: null, vocalFeedback: null, createdAt: null }] })
    expect(() => applyAgentPatch('doctor', withTurn, { transcript: [] })).toThrow(/append/)
    expect(() => applyAgentPatch('doctor', withTurn, { transcript: [{ ...withTurn.transcript[0], text: 'edited' }] })).toThrow(/append/)
  })
})

describe('guards', () => {
  it('rejects another rep and unknown sessions', async () => {
    const { orchestrator } = build()
    await orchestrator.start({ repId: REP, doctorId: 'doc-1' })
    expect(await orchestrator.sendMessage('sess-1', 'someone-else', 'hi')).toMatchObject({ ok: false, error: 'forbidden' })
    expect(await orchestrator.endSimulation('sess-1', 'someone-else')).toMatchObject({ ok: false, error: 'forbidden' })
    expect(await orchestrator.sendMessage('nope', REP, 'hi')).toMatchObject({ ok: false, error: 'not_found' })
  })

  it('stores nothing when the persona is missing or the doctor cannot open', async () => {
    const a = build()
    expect(await a.orchestrator.start({ repId: REP, doctorId: 'missing' })).toMatchObject({ ok: false, error: 'persona_not_found' })
    expect(a.store.size).toBe(0)
    const b = build(vi.fn().mockResolvedValue(null))
    expect(await b.orchestrator.start({ repId: REP, doctorId: 'doc-1' })).toMatchObject({ ok: false, error: 'doctor_unavailable' })
    expect(b.store.size).toBe(0)
  })

  it('rejects empty messages, messages after the end, and turns over the cap', async () => {
    const { orchestrator } = build(fakeModel(), {}, 1)
    await orchestrator.start({ repId: REP, doctorId: 'doc-1' })
    expect(await orchestrator.sendMessage('sess-1', REP, '   ')).toMatchObject({ ok: false, error: 'empty_message' })
    await orchestrator.sendMessage('sess-1', REP, MSG1)
    expect(await orchestrator.sendMessage('sess-1', REP, MSG2)).toMatchObject({ ok: false, error: 'turn_limit' })
    await orchestrator.endSimulation('sess-1', REP)
    expect(await orchestrator.sendMessage('sess-1', REP, MSG2)).toMatchObject({ ok: false, error: 'wrong_phase' })
  })

  it('ending with no rep messages reports no_rep_turns and does not score', async () => {
    const { orchestrator, store } = build()
    await orchestrator.start({ repId: REP, doctorId: 'doc-1' })
    expect(await orchestrator.endSimulation('sess-1', REP)).toMatchObject({ ok: false, error: 'no_rep_turns' })
    expect((await store.get('sess-1'))!.phase).toBe('ended')
  })

  it('endSimulation is idempotent once reported: no further model calls', async () => {
    const { orchestrator, model } = build()
    await playThrough(orchestrator)
    await orchestrator.endSimulation('sess-1', REP)
    const calls = (model as ReturnType<typeof vi.fn>).mock.calls.length
    const again = await orchestrator.endSimulation('sess-1', REP)
    expect(again.ok).toBe(true)
    expect((model as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls)
  })
})

describe('failure and resume', () => {
  it('an analyst failure stops the pipeline at "ended" and a retry resumes', async () => {
    let broken = true
    const { orchestrator, store } = build(fakeModel({ analystFails: () => broken }))
    await playThrough(orchestrator)
    const first = await orchestrator.endSimulation('sess-1', REP)
    expect(first).toMatchObject({ ok: false, error: 'analysis_failed', detail: 'invalid' })
    expect((await store.get('sess-1'))!.phase).toBe('ended')

    broken = false
    const second = await orchestrator.endSimulation('sess-1', REP)
    expect(second.ok && second.phase).toBe('reported')
  })

  it('a coach failure still returns the report, and a retry completes coaching', async () => {
    let coachDown = true
    const { orchestrator, store } = build(fakeModel({ coachFails: () => coachDown }))
    await playThrough(orchestrator)
    const first = await orchestrator.endSimulation('sess-1', REP)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.phase).toBe('scored')
    expect(first.report.coachingStatus).toBe('unavailable')
    expect(first.report.coaching).toEqual([])
    expect(first.report.warnings[0]).toMatch(/^coaching_unavailable:/)
    expect(first.report.scores.overall).not.toBeNull()

    coachDown = false
    const second = await orchestrator.endSimulation('sess-1', REP)
    expect(second.ok && second.phase).toBe('reported')
    expect(second.ok && second.report.coaching).toHaveLength(1)
    // Analysis and scoring were not repeated on retry.
    const steps = (await store.get('sess-1'))!.trace.map(t => t.step)
    expect(steps.filter(s => s === 'analyze')).toHaveLength(1)
    expect(steps.filter(s => s === 'score')).toHaveLength(1)
  })

  it('a store failure is reported, not thrown', async () => {
    const store = new InMemorySessionStore()
    store.save = vi.fn().mockRejectedValue(new Error('db down'))
    const model = fakeModel()
    const o = createOrchestrator({ store, personas: persona, doctor: createDoctorAgent(model), analyst: createBehaviorAnalystAgent(model), coach: createCoachAgent(model), newId: () => 's' })
    expect(await o.start({ repId: REP, doctorId: 'doc-1' })).toMatchObject({ ok: false, error: 'store_failed' })
  })
})

describe('personaFromDoctor', () => {
  it('maps a doctors row and profile onto the shared session sections', () => {
    const doctor = {
      id: 'd1', rep_id: REP, name: 'Dr. Noor', specialty: 'oncology', workplace: 'City Hospital', style: 'analytical',
      assertiveness: 'ask', responsiveness: 'controls', key_phrases: 'show me the data', objections: ['price'], objection_notes: 'n',
      notes: null, created_at: '', updated_at: '', hidden_concern: 'budget', product_context: 'a new therapy', available_time_min: 5,
    } as unknown as Doctor
    const p = personaFromDoctor(doctor, { id: REP, display_name: 'Rana', company_id: 'c1', sps_top_key: null, sps_profile: null }, { difficulty: 'resistant' })
    expect(p.specialty).toBe('oncology')
    expect(p.physician).toMatchObject({ doctorId: 'd1', name: 'Dr. Noor', hiddenConcern: 'budget', availableTimeMin: 5 })
    expect(p.socialStyle).toMatchObject({ primary: 'analytical', dominant: 'analytical', source: 'legacy' })
    expect(p.objections.onProfile).toEqual(['price'])
    expect(p.product.context).toBe('a new therapy')
    expect(p.physician.initialState!.trust).toBeLessThan(50) // resistant + not "tell" -> seeded lower than realistic
    expect(p.rep.displayName).toBe('Rana')
  })
})
