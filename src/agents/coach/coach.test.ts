import { describe, it, expect, vi } from 'vitest'
import { createEmptySession } from '@/schemas/session/factory'
import type { StyleShiftSession, TranscriptTurn } from '@/schemas/session'
import type { Competency, Observation } from '@/schemas/observation'
import { scoreSession } from '@/scoring/engine'
import { selectCoachingCandidates } from './select'
import { buildCoachPrompt, COACH_SYSTEM } from './prompt'
import { groundCoaching, mentionsScore } from './ground'
import { createCoachAgent } from './index'

function turn(turnIndex: number, role: 'doctor' | 'rep', text: string): TranscriptTurn {
  return { turnIndex, role, text, objectionType: null, clearStepsHit: [], state: null, vocalFeedback: null, createdAt: null }
}

function obs(competency: Competency, behavior: string, turnIndex: number, quote: string, confidence = 0.9): Observation {
  return {
    competency, behavior, observation: `The rep showed ${behavior}.`,
    evidence: [{ turnIndex, role: 'rep', quote }], timestamp: null,
    direction: 'positive', confidence,
  }
}

function session(observations: Observation[]): StyleShiftSession {
  const s = createEmptySession('s1', 'r1')
  s.status = 'escalated'
  s.physician.name = 'Dr. Salim'
  s.transcript = [
    turn(0, 'doctor', 'I am not sure your product fits my patients.'),
    turn(1, 'rep', 'Our product is great and works for everyone.'),
    turn(2, 'doctor', 'Hmm. I have heard that before.'),
    turn(3, 'rep', 'What worries you most about it?'),
    turn(4, 'doctor', 'Older patients on many medications.'),
  ]
  s.learningObjectives = [{ id: 'obj1', label: 'Handle doubt with evidence', focusStep: null, targetObjection: 'doubt', source: 'coach' }]
  s.observations = observations
  s.scores = scoreSession(observations, s.difficulty)
  return s
}

const mixed = () => session([
  obs('discovery', 'premature_pitch', 1, 'Our product is great and works for everyone.'),
  obs('objection_handling', 'ignored_objection', 1, 'Our product is great'),
  obs('questioning', 'open_question', 3, 'What worries you most about it?'),
])

const goodText = (ref: string) => ({
  ref, whatHappened: 'You pitched straight away.', whyItMattered: 'The doctor answered flatly and shut down.',
  whatToDoDifferently: 'Ask about their patients first.', betterResponseExample: 'Before I share anything, which patients are you most concerned about?',
  practiceAction: 'In your next session, ask two open questions before you mention the product.', objectiveId: null,
})

describe('selectCoachingCandidates', () => {
  it('prefers behaviors that hurt, ranked by importance, and skips positives', () => {
    const c = selectCoachingCandidates(mixed())
    expect(c.map(x => x.behavior)).toEqual(['ignored_objection', 'premature_pitch']) // 8*1.5*.9*1.5 > 5*1.2*.9*1.5
    expect(c.every(x => x.kind === 'improve')).toBe(true)
    expect(c[0].doctorReaction).toMatch(/heard that before/)
  })

  it('never exposes numbers: standing is qualitative', () => {
    for (const c of selectCoachingCandidates(mixed())) expect(['weaker', 'middle', 'stronger', 'unranked']).toContain(c.standing)
  })

  it('builds on the weakest scored competency when nothing hurt', () => {
    const s = session([obs('questioning', 'open_question', 3, 'What worries you most about it?'), obs('discovery', 'clarification', 3, 'What worries you most about it?', 0.5)])
    const c = selectCoachingCandidates(s)
    expect(c.length).toBeGreaterThan(0)
    expect(c.every(x => x.kind === 'build_on')).toBe(true)
  })

  it('returns nothing without scores or scored observations', () => {
    const s = mixed(); s.scores = null
    expect(selectCoachingCandidates(s)).toEqual([])
  })

  it('caps points and dedupes by behavior', () => {
    const many = ['ignored_objection', 'argued_with_doctor'].map(b => obs('objection_handling', b, 1, 'Our product is great'))
    const s = session([...many, obs('discovery', 'premature_pitch', 1, 'Our product is great'), obs('active_listening', 'interruption', 1, 'Our product is great'), obs('active_listening', 'interruption', 1, 'Our product is great')])
    const c = selectCoachingCandidates(s)
    expect(c.length).toBeLessThanOrEqual(3)
    expect(new Set(c.map(x => x.behavior)).size).toBe(c.length)
  })
})

describe('prompt', () => {
  it('forbids scoring, includes persona, objectives, evidence and the doctor reaction — and no numbers from scores', () => {
    const s = mixed()
    const p = buildCoachPrompt(s, selectCoachingCandidates(s))
    expect(COACH_SYSTEM).toMatch(/do NOT score/)
    expect(p).toContain('Dr. Salim')
    expect(p).toContain('obj1: Handle doubt with evidence')
    expect(p).toContain('turn 1 (rep): "Our product is great and works for everyone."')
    expect(p).toContain('Hmm. I have heard that before.')
    expect(p).not.toMatch(/\b(score|scored)\b.*\d/i)
  })
})

describe('groundCoaching', () => {
  const s = mixed()
  const cands = selectCoachingCandidates(s)

  it('copies evidence, competency, behavior and priority from the app, not the model', () => {
    const r = groundCoaching({ points: [{ ...goodText('c2'), competency: 'closing' }, goodText('c1')] }, cands, s.learningObjectives)!
    expect(r.coaching.map(c => c.priority)).toEqual([1, 2])
    expect(r.coaching[0].behavior).toBe('ignored_objection')
    expect(r.coaching[0].evidence[0].quote).toBe('Our product is great')
    expect(r.coaching[0].competency).toBe('objection_handling')
  })

  it('drops points that mention scores, percentages, or miss a field', () => {
    const bad = [
      { ...goodText('c1'), whyItMattered: 'You scored low here.' },
      { ...goodText('c2'), betterResponseExample: 'Nine in ten doctors see a 40% benefit.' },
    ]
    const r = groundCoaching({ points: bad }, cands, s.learningObjectives)!
    expect(r.coaching).toHaveLength(0)
    expect(r.dropped).toBe(2)
    expect(groundCoaching({ points: [{ ...goodText('c1'), practiceAction: '' }] }, cands, [])!.coaching).toHaveLength(0)
  })

  it('ignores unknown refs and duplicates; validates objectiveId', () => {
    const r = groundCoaching({ points: [goodText('zzz'), { ...goodText('c1'), objectiveId: 'obj1' }, goodText('c1')] }, cands, s.learningObjectives)!
    expect(r.coaching).toHaveLength(1)
    expect(r.coaching[0].objectiveId).toBe('obj1')
    expect(groundCoaching({ points: [{ ...goodText('c1'), objectiveId: 'made-up' }] }, cands, s.learningObjectives)!.coaching[0].objectiveId).toBeNull()
  })

  it('mentionsScore is precise', () => {
    expect(mentionsScore('7/10 overall')).toBe(true)
    expect(mentionsScore('Ask what matters to them first.')).toBe(false)
  })
})

describe('coach agent', () => {
  it('refuses incomplete sessions and missing inputs', async () => {
    const { coach } = createCoachAgent(vi.fn())
    const live = mixed(); live.status = 'in_progress'
    expect(await coach(live)).toEqual({ error: 'session_not_complete' })
    const none = mixed(); none.observations = []
    expect(await coach(none)).toEqual({ error: 'missing_observations' })
    const noScores = mixed(); noScores.scores = null
    expect(await coach(noScores)).toEqual({ error: 'missing_scores' })
  })

  it('returns six-part coaching, patches the session, and leaves scores untouched', async () => {
    const s = mixed()
    const before = JSON.stringify(s.scores)
    const { agent } = createCoachAgent(vi.fn().mockResolvedValue(JSON.stringify({ points: [goodText('c1'), goodText('c2')] })))
    const patch = await agent.run(s, undefined)
    expect(patch.coaching).toHaveLength(2)
    expect(patch).not.toHaveProperty('scores')
    expect(JSON.stringify(s.scores)).toBe(before)
    const c = patch.coaching![0]
    for (const k of ['whatHappened', 'evidence', 'whyItMattered', 'whatToDoDifferently', 'betterResponseExample', 'practiceAction'] as const) {
      expect(c[k]).toBeTruthy()
    }
  })

  it('retries once on unusable output, then reports upstream/invalid distinctly', async () => {
    const twice = vi.fn().mockResolvedValueOnce('nope').mockResolvedValueOnce(JSON.stringify({ points: [goodText('c1')] }))
    const ok = await createCoachAgent(twice).coach(mixed())
    expect('coaching' in ok && ok.coaching.length).toBe(1)
    expect(twice).toHaveBeenCalledTimes(2)
    expect(await createCoachAgent(vi.fn().mockResolvedValue(null)).coach(mixed())).toEqual({ error: 'upstream' })
    expect(await createCoachAgent(vi.fn().mockResolvedValue('garbage')).coach(mixed())).toEqual({ error: 'invalid' })
  })
})
