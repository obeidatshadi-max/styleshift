import { describe, it, expect, vi } from 'vitest'
import { createEmptySession } from '@/schemas/session/factory'
import type { StyleShiftSession, TranscriptTurn } from '@/schemas/session'
import { COMPETENCIES } from '@/schemas/observation'
import { groundObservations, looksLikeCoaching } from './ground'
import { ANALYST_SYSTEM, buildAnalystPrompt } from './prompt'
import { createBehaviorAnalystAgent } from './index'

function turn(turnIndex: number, role: 'doctor' | 'rep', text: string): TranscriptTurn {
  return {
    turnIndex, role, text, objectionType: null, clearStepsHit: [], state: null,
    vocalFeedback: null, createdAt: `2026-09-19T01:00:0${turnIndex}.000Z`,
  }
}

function finished(): StyleShiftSession {
  const s = createEmptySession('s1', 'r1')
  s.status = 'won'
  s.transcript = [
    turn(0, 'doctor', 'I am not sure your product fits my patients.'),
    turn(1, 'rep', 'What kind of patients worry you most?'),
    turn(2, 'doctor', 'Mostly older patients on many medications.'),
    turn(3, 'rep', 'Our product is great and works for everyone, it is the best on the market.'),
  ]
  return s
}

const good = {
  observations: [
    {
      competency: 'questioning', behavior: 'open_question',
      observation: 'The rep asked which patients concern the doctor and the doctor answered with detail.',
      evidence: [{ turnIndex: 1, quote: 'What kind of patients worry you most?' }],
      direction: 'positive', confidence: 0.9,
    },
  ],
}

describe('groundObservations', () => {
  const turns = finished().transcript

  it('keeps grounded observations and copies timestamp + role from the transcript', () => {
    const r = groundObservations(good, turns)!
    expect(r.observations).toHaveLength(1)
    expect(r.observations[0].timestamp).toBe('2026-09-19T01:00:01.000Z')
    expect(r.observations[0].evidence[0]).toEqual({ turnIndex: 1, role: 'rep', quote: 'What kind of patients worry you most?' })
  })

  it('drops observations whose quote is not in the transcript', () => {
    const bad = { observations: [{ ...good.observations[0], evidence: [{ turnIndex: 1, quote: 'made up words that never happened' }] }] }
    const r = groundObservations(bad, turns)!
    expect(r.observations).toHaveLength(0)
    expect(r.dropped).toBe(1)
  })

  it('re-points a quote with the wrong turn number to the one turn that has it', () => {
    const wrong = { observations: [{ ...good.observations[0], evidence: [{ turnIndex: 3, quote: 'what kind of patients worry you most' }] }] }
    expect(groundObservations(wrong, turns)!.observations[0].evidence[0].turnIndex).toBe(1)
  })

  it('drops observations with no evidence, unknown competency, or bad direction', () => {
    const cases = [
      { ...good.observations[0], evidence: [] },
      { ...good.observations[0], behavior: 'charm_offensive' },
      { competency: 'communication_clarity', behavior: 'clear', observation: 'o', evidence: good.observations[0].evidence, direction: 'great', confidence: 1 },
    ]
    const r = groundObservations({ observations: cases }, turns)!
    expect(r.observations).toHaveLength(0)
    expect(r.dropped).toBe(3)
  })

  it('takes competency and direction from the scoring catalog, not the model', () => {
    const mislabeled = { observations: [{ ...good.observations[0], competency: 'closing', direction: 'negative' }] }
    const o = groundObservations(mislabeled, turns)!.observations[0]
    expect(o.competency).toBe('questioning')
    expect(o.direction).toBe('positive')
  })

  it('keeps communication_clarity as a free-label, unscored observation', () => {
    const clarity = { observations: [{ competency: 'communication_clarity', behavior: 'long turn', observation: 'The rep spoke at length.', evidence: [{ turnIndex: 3, quote: 'Our product is great' }], direction: 'negative', confidence: 0.8 }] }
    expect(groundObservations(clarity, turns)!.observations).toHaveLength(1)
  })

  it('drops coaching language', () => {
    const coach = { observations: [{ ...good.observations[0], observation: 'The rep should ask more questions next time.' }] }
    expect(groundObservations(coach, turns)!.observations).toHaveLength(0)
    expect(looksLikeCoaching('The rep asked an open question.')).toBe(false)
  })

  it('clamps confidence and returns null for a malformed payload', () => {
    const hi = { observations: [{ ...good.observations[0], confidence: 4 }] }
    expect(groundObservations(hi, turns)!.observations[0].confidence).toBe(1)
    expect(groundObservations({ nope: 1 }, turns)).toBeNull()
  })
})

describe('prompt', () => {
  it('lists every competency and forbids coaching and scoring', () => {
    const p = buildAnalystPrompt(finished())
    for (const c of COMPETENCIES) expect(p).toContain(c)
    expect(ANALYST_SYSTEM).toMatch(/NEVER coach/)
    expect(ANALYST_SYSTEM).toMatch(/NEVER give a score/)
    expect(p).toContain('[turn 1 | rep] What kind of patients worry you most?')
    for (const k of ['open_question', 'paraphrasing', 'interruption', 'clarification', 'ignored_objection', 'premature_pitch']) expect(p).toContain(k)
  })
})

describe('behavior analyst agent', () => {
  it('refuses an in-progress session and one with no rep turns', async () => {
    const { analyze } = createBehaviorAnalystAgent(vi.fn())
    const live = finished(); live.status = 'in_progress'
    expect(await analyze(live)).toEqual({ error: 'session_not_complete' })
    const empty = finished(); empty.transcript = [turn(0, 'doctor', 'Hello')]
    expect(await analyze(empty)).toEqual({ error: 'no_rep_turns' })
  })

  it('returns grounded observations and patches the session', async () => {
    const { agent } = createBehaviorAnalystAgent(vi.fn().mockResolvedValue(JSON.stringify(good)))
    const patch = await agent.run(finished(), undefined)
    expect(patch.observations).toHaveLength(1)
    expect(patch.observations![0].competency).toBe('questioning')
  })

  it('retries once on unusable output, then succeeds', async () => {
    const complete = vi.fn().mockResolvedValueOnce('not json').mockResolvedValueOnce(JSON.stringify(good))
    const { analyze } = createBehaviorAnalystAgent(complete)
    const r = await analyze(finished())
    expect('observations' in r && r.observations.length).toBe(1)
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('reports upstream vs invalid failures distinctly', async () => {
    expect(await createBehaviorAnalystAgent(vi.fn().mockResolvedValue(null)).analyze(finished())).toEqual({ error: 'upstream' })
    expect(await createBehaviorAnalystAgent(vi.fn().mockResolvedValue('garbage')).analyze(finished())).toEqual({ error: 'invalid' })
  })
})
