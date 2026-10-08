import { describe, expect, it, vi } from 'vitest'
import { validateSimScenario, type SimScenario } from '@/schemas/scenario'
import { doctorFromScenario, previewScenario, scenarioRun } from '@/lib/scenario-persona'
import { runnableProblems, rowToRecord } from '@/lib/sim-scenarios'
import { createOrchestrator } from '@/agents/orchestrator'
import { InMemorySessionStore } from '@/agents/orchestrator/memory-store'
import { createDoctorAgent } from '@/agents/doctor'
import { createBehaviorAnalystAgent } from '@/agents/behaviorAnalyst'
import { createCoachAgent } from '@/agents/coach'
import type { CompleteFn } from '@/agents/llm'
import { seedPhysicianState } from '@/lib/voice-partner-core'

const raw = {
  name: 'Skeptical cardiologist', therapeuticArea: 'Cardiovascular',
  physician: { specialty: 'cardiology', seniority: 'consultant', style: 'analytical', relationshipStage: 'early', adoptionAttitude: 'cautious' },
  mainConcerns: ['Long-term safety data'], hiddenConcern: 'Had a patient with a bad reaction last year',
  visitPurpose: 'First product introduction', desiredNextStep: 'Agree to review the safety summary',
  learningObjectives: ['Ask before pitching'], expectedCompetencies: ['discovery'],
  difficulty: 'skeptical', language: 'en', availableTimeMin: 5,
  requiredObjections: [{ type: 'true_objection', text: 'Not convinced it is safer than what I use' }],
  optionalObjections: [{ type: 'indifference' }],
}
const scenario = (over: Record<string, unknown> = {}): SimScenario => {
  const res = validateSimScenario({ ...raw, ...over })
  if (!res.ok) throw new Error(res.errors.join())
  return res.value
}
const profile = { id: 'rep-1', display_name: 'Rana', company_id: 'co-1', sps_top_key: null, sps_profile: null }

describe('scenario -> persona', () => {
  it('builds an in-memory doctor with style axes, hidden concern and time', () => {
    const d = doctorFromScenario(scenario(), 'rep-1')
    expect(d).toMatchObject({ specialty: 'cardiology', style: 'analytical', assertiveness: 'ask', responsiveness: 'controls', hidden_concern: 'Had a patient with a bad reaction last year', available_time_min: 5 })
    expect(d.objections).toContain('Long-term safety data')
    expect(d.objections).toContain('Not convinced it is safer than what I use')
  })

  it('never links the session to a real doctors row', () => {
    expect(scenarioRun(scenario(), profile).persona.physician.doctorId).toBeNull()
  })

  it('uses the first required objection, else the first optional, else the engine pick', () => {
    expect(scenarioRun(scenario(), profile).objectionType).toBe('true_objection')
    expect(scenarioRun(scenario({ requiredObjections: [] }), profile).objectionType).toBe('indifference')
    expect(scenarioRun(scenario({ requiredObjections: [], optionalObjections: [] }), profile, () => 'doubt').objectionType).toBe('doubt')
  })

  it('starts "skeptical" doctors with higher skepticism than "normal" ones, and cautious attitude adds more', () => {
    const base = scenarioRun(scenario({ difficulty: 'normal', physician: { ...raw.physician, adoptionAttitude: 'neutral' } }), profile).persona.physician.initialState!
    const skeptical = scenarioRun(scenario({ physician: { ...raw.physician, adoptionAttitude: 'neutral' } }), profile).persona.physician.initialState!
    const cautious = scenarioRun(scenario(), profile).persona.physician.initialState!
    expect(skeptical.skepticism).toBe(base.skepticism + 15)
    expect(cautious.skepticism).toBe(skeptical.skepticism + 5)
    expect(cautious.trust).toBeLessThan(skeptical.trust)
  })

  it('keeps every starting-state value inside 0-100', () => {
    const s = scenarioRun(scenario({ difficulty: 'pressure_test', physician: { ...raw.physician, adoptionAttitude: 'opposed' } }), profile).persona.physician.initialState!
    for (const v of [s.trust, s.skepticism, s.engagement]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100) }
  })

  it('turns learning objectives into manager-sourced objectives', () => {
    expect(scenarioRun(scenario(), profile).learningObjectives).toEqual([
      { id: 'scenario-1', label: 'Ask before pitching', focusStep: null, targetObjection: null, source: 'manager' },
    ])
  })

  it('matches what the saved-doctor path would seed for the same difficulty', () => {
    const run = scenarioRun(scenario({ difficulty: 'normal', physician: { ...raw.physician, adoptionAttitude: 'neutral' } }), profile)
    expect(run.persona.physician.initialState).toEqual(seedPhysicianState(doctorFromScenario(scenario(), 'rep-1'), 'realistic'))
  })
})

describe('preview and runnable checks', () => {
  it('warns about missing hidden concern / required objection and explains the pack link', () => {
    const p = previewScenario(scenario({ hiddenConcern: null, requiredObjections: [], knowledgePackId: 'pack-1' }))
    expect(p.warnings.join(' ')).toMatch(/No hidden concern/)
    expect(p.warnings.join(' ')).toMatch(/No required objection/)
    expect(p.warnings.join(' ')).toMatch(/Knowledge pack linked/)
    expect(p.warnings.join(' ')).not.toMatch(/not yet used/)
    expect(previewScenario(scenario({ knowledgePackId: null })).warnings.join(' ')).not.toMatch(/Knowledge pack/)
    expect(previewScenario(scenario()).headline).toMatch(/analytical · skeptical · 5 min/)
  })

  it('refuses to run an MSA doctor (the engine only speaks Iraqi)', () => {
    expect(runnableProblems(scenario({ language: 'ar', arabicVariant: 'msa' }))).toHaveLength(1)
    expect(runnableProblems(scenario({ language: 'ar' }))).toEqual([])
    expect(runnableProblems(scenario())).toEqual([])
  })

  it('maps a database row to a record', () => {
    const rec = rowToRecord({ id: 'i', company_id: 'c', created_by: 'u', config: scenario(), status: 'draft', created_at: 't' })
    expect(rec).toMatchObject({ id: 'i', companyId: 'c', status: 'draft', name: 'Skeptical cardiologist' })
  })
})

describe('orchestrator start from a scenario persona', () => {
  it('uses the supplied persona, records scenarioId and gives the doctor the hidden concern', async () => {
    const seen: string[] = []
    const model: CompleteFn = vi.fn(async ({ system, prompt }) => { seen.push(`${system}\n${prompt}`); return 'Go ahead.' })
    const store = new InMemorySessionStore()
    const o = createOrchestrator({
      store, personas: { load: async () => { throw new Error('must not look up a saved doctor') } },
      doctor: createDoctorAgent(model), analyst: createBehaviorAnalystAgent(model), coach: createCoachAgent(model),
      newId: () => 's1', now: () => new Date('2026-10-08T00:00:00Z'),
    })
    const run = scenarioRun(scenario(), profile)
    const started = await o.start({ repId: 'rep-1', persona: run.persona, scenarioId: 'scn-1', lang: 'en', difficulty: run.setup.difficulty, objectionType: run.objectionType, learningObjectives: run.learningObjectives })
    expect(started).toMatchObject({ ok: true, doctorText: 'Go ahead.' })
    const saved = await store.get('s1')
    expect(saved?.session.scenarioId).toBe('scn-1')
    expect(saved?.session.physician.doctorId).toBeNull()
    expect(saved?.session.objections.activeType).toBe('true_objection')
    expect(seen.join('\n')).toContain('Had a patient with a bad reaction last year')
  })

  it('still fails cleanly with neither a doctor id nor a persona', async () => {
    const model: CompleteFn = vi.fn(async () => 'x')
    const o = createOrchestrator({
      store: new InMemorySessionStore(), personas: { load: async () => null },
      doctor: createDoctorAgent(model), analyst: createBehaviorAnalystAgent(model), coach: createCoachAgent(model),
    })
    expect(await o.start({ repId: 'r' })).toMatchObject({ ok: false, error: 'persona_not_found' })
  })
})
