import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { Competency, Observation } from '@/schemas/observation'
import type { CoachingRecommendation } from '@/schemas/coaching'
import type { SessionReport } from '@/schemas/report'
import { COMPETENCIES } from '@/schemas/observation'
import { scoreSession } from '@/scoring/engine'
import { behaviorIndex, defaultScoringConfig } from '@/scoring/config'
import { summarizeReport } from './simulation-report'

function obs(competency: Competency, behavior: string, turnIndex: number, quote: string, confidence = 1): Observation {
  return { competency, behavior, observation: `saw ${behavior}`, evidence: [{ turnIndex, role: 'rep', quote }], timestamp: null, direction: 'positive', confidence }
}

function coaching(behavior: string, priority: number): CoachingRecommendation {
  return {
    id: `c-${behavior}`, priority, kind: 'improve', competency: 'discovery', behavior, whatHappened: 'w', evidence: [],
    whyItMattered: 'y', whatToDoDifferently: 'd', betterResponseExample: 'b', practiceAction: 'p', objectiveId: null,
  }
}

function report(observations: Observation[], coachingItems: CoachingRecommendation[] = []): SessionReport {
  const byComp: SessionReport['observationsByCompetency'] = {}
  for (const o of observations) (byComp[o.competency] ??= []).push(o)
  return {
    sessionId: 's', generatedAt: '', lang: 'en',
    header: { repName: null, physicianName: 'Dr', specialty: null, difficulty: 'realistic', outcome: 'abandoned', repTurns: 1, startedAt: null, endedAt: null },
    transcript: [], observationsByCompetency: byComp, scores: scoreSession(observations, 'realistic'),
    coaching: coachingItems, coachingStatus: coachingItems.length ? 'ready' : 'nothing_to_coach', warnings: [],
  }
}

describe('summarizeReport', () => {
  const observations = [
    obs('questioning', 'open_question', 3, 'What worries you?'),         // +5
    obs('active_listening', 'paraphrasing', 5, 'So you are worried'),   // +8  strongest
    obs('discovery', 'premature_pitch', 1, 'Our product is great'),      // -5
    obs('objection_handling', 'ignored_objection', 1, 'Anyway...'),      // -8  worst
  ]

  it('picks the strongest and weakest behavior from engine points, with their observation', () => {
    const s = summarizeReport(report(observations))
    expect(s.strongest).toMatchObject({ behavior: 'paraphrasing', competency: 'active_listening' })
    expect(s.strongest?.observation?.evidence[0].quote).toBe('So you are worried')
    expect(s.biggestOpportunity).toMatchObject({ behavior: 'ignored_objection', competency: 'objection_handling' })
  })

  it('prefers the coaching point for the biggest opportunity, else the top priority one', () => {
    const items = [coaching('premature_pitch', 1), coaching('ignored_objection', 2)]
    expect(summarizeReport(report(observations, items)).primaryCoaching?.behavior).toBe('ignored_objection')
    expect(summarizeReport(report(observations, [coaching('premature_pitch', 2), coaching('style_mismatch', 1)])).primaryCoaching?.behavior).toBe('style_mismatch')
  })

  it('handles sessions with no positives, no negatives, or no scored evidence', () => {
    const onlyGood = summarizeReport(report([obs('questioning', 'open_question', 1, 'q')]))
    expect(onlyGood.strongest?.behavior).toBe('open_question')
    expect(onlyGood.biggestOpportunity).toBeNull()
    const none = summarizeReport(report([]))
    expect(none).toEqual({ strongest: null, biggestOpportunity: null, primaryCoaching: null })
  })

  it('is deterministic on ties (fixed competency order)', () => {
    const tie = [obs('questioning', 'open_question', 1, 'a'), obs('discovery', 'clarification', 2, 'b')].map(o => o)
    const a = summarizeReport(report(tie)), b = summarizeReport(report(tie))
    expect(a).toEqual(b)
  })
})

describe('simulation i18n coverage', () => {
  const root = path.resolve(__dirname, '..')
  const dict = fs.readFileSync(path.join(root, 'lib/i18n.tsx'), 'utf-8')
  const count = (key: string) => dict.split(`'${key}':`).length - 1

  it('every sim.* key the UI can request exists in both English and Arabic', () => {
    const keys = new Set<string>()
    for (const file of ['components/game/TextSimulation.tsx', 'components/game/TextSimulationReport.tsx']) {
      const src = fs.readFileSync(path.join(root, file), 'utf-8')
      for (const m of src.matchAll(/t\('(sim\.[\w.]+)'/g)) keys.add(m[1])
    }
    for (const c of COMPETENCIES) keys.add(`sim.comp.${c}`)
    for (const b of behaviorIndex(defaultScoringConfig).keys()) keys.add(`sim.beh.${b}`)
    for (const k of ['not_configured', 'rate_limited', 'unavailable', 'no_rep_turns', 'turn_limit', 'generic']) keys.add(`sim.error.${k}`)
    for (const d of ['positive', 'negative', 'neutral']) keys.add(`sim.report.dir.${d}`)
    expect(keys.size).toBeGreaterThan(50)

    const missing = [...keys].filter(k => count(k) !== 2)
    expect(missing).toEqual([])
  })
})
