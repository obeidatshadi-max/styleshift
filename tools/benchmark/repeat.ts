// Repeat-run reliability test (audit item 2, 2026-11-12).
//
// Question it answers: if the SAME transcript is scored again, how much does the
// score move? The improvement engine treats a 5-point move as real change, so a
// run-to-run spread near or above 5 means trend lines are noise.
//
// Two scorers, each called exactly the way production calls it:
//   analyst   = Behavior Analyst -> deterministic scoring engine (agent_sessions).
//               Also records whether the app-chosen coaching point 1 changes.
//   evaluator = session-evaluator (Deep Analysis, session_scorecards): 9 competency
//               + 7 adaptation scores. This is the AI side of the validation pilot.
// No production file is called with a different prompt or model.

import { createBehaviorAnalystAgent } from '@/agents/behaviorAnalyst'
import { selectCoachingCandidates } from '@/agents/coach/select'
import type { CompleteFn } from '@/agents/llm'
import { scoreSession } from '@/scoring/engine'
import { defaultScoringConfig } from '@/scoring/config'
import { SCORED_COMPETENCIES } from '@/schemas/scoring'
import {
  ADAPTATION_DIMENSIONS, COMPETENCY_DIMENSIONS, EVALUATOR_MAX_TOKENS, EVALUATOR_RETRY_NOTE, EVALUATOR_SYSTEM,
  buildEvaluatorPrompt, computeSessionSignals, groundEvaluatorResult, parseEvaluatorResponse, resolveDoctorStyleProfile,
} from '@/lib/session-evaluator'
import { computePressureShift } from '@/lib/pressure-shift'
import type { ConversationTurn } from '@/types/game'
import { toSession, type BenchFixture } from './fixtures'
import { mean, percentile } from './metrics'
import type { Backend } from './runner'

export type RepeatArm = 'analyst' | 'evaluator'

/** One scoring of one fixture. `scores` maps a dimension to its 0-100 score, or null
 * when the scorer said "not observable" (null is kept: a flip between null and a
 * number is itself instability). `status` other than ok means no scores. */
export interface RepeatRecord {
  arm: RepeatArm
  model: string
  fixtureId: string
  mix: BenchFixture['mix']
  repeat: number
  status: 'ok' | 'invalid' | 'upstream'
  scores: Record<string, number | null>
  /** analyst only: behavior of the coaching point the app would show first. */
  topPoint: string | null
  /** analyst only: the behaviors found, sorted. */
  behaviors: string[]
}

// ───────────────────────────── fixture -> evaluator input ─────────────────────────────

/** The voice-partner turn rows the evaluator reads, built from a fixture. */
export function fixtureTurns(f: BenchFixture): ConversationTurn[] {
  return toSession(f).transcript.map(t => ({
    id: `${f.id}-${t.turnIndex}`, session_id: `bench-${f.id}`, rep_id: 'bench-rep', doctor_id: 'bench-doctor',
    turn_index: t.turnIndex, role: t.role === 'doctor' ? 'doctor' : 'rep', text: t.text,
    objection_type: null, clear_steps_hit: [], trust: null, skepticism: null, engagement: null, time_pressure: null,
    started_at: null, ended_at: null, created_at: new Date(0).toISOString(),
  }))
}

// ───────────────────────────── one scoring ─────────────────────────────

export async function runRepeatAnalyst(backend: Backend, model: string, f: BenchFixture, repeat: number): Promise<RepeatRecord> {
  const base = { arm: 'analyst' as const, model, fixtureId: f.id, mix: f.mix, repeat }
  const complete = backend.make(model, () => {})
  const session = toSession(f)
  const out = await createBehaviorAnalystAgent(complete).analyze(session)
  if ('error' in out) return { ...base, status: out.error === 'invalid' ? 'invalid' : 'upstream', scores: {}, topPoint: null, behaviors: [] }
  session.observations = out.observations
  session.scores = scoreSession(out.observations, session.difficulty, defaultScoringConfig, new Date(0))
  const scores: Record<string, number | null> = { overall: session.scores.overall }
  for (const c of SCORED_COMPETENCIES) scores[c] = session.scores.competencies[c].score
  return {
    ...base, status: 'ok', scores,
    topPoint: selectCoachingCandidates(session)[0]?.behavior ?? null,
    behaviors: [...new Set(out.observations.map(o => o.behavior))].sort(),
  }
}

export async function runRepeatEvaluator(backend: Backend, model: string, f: BenchFixture, repeat: number): Promise<RepeatRecord> {
  const base = { arm: 'evaluator' as const, model, fixtureId: f.id, mix: f.mix, repeat, topPoint: null, behaviors: [] }
  const turns = fixtureTurns(f)
  const profile = resolveDoctorStyleProfile({ style: f.style, style_driver: null, style_expressive: null, style_amiable: null, style_analytical: null })
  const prompt = buildEvaluatorPrompt(turns, computeSessionSignals(turns, false), profile, f.mix === 'en' ? 'en' : 'ar', computePressureShift(turns))
  const complete: CompleteFn = backend.make(model, () => {})
  // Same flow as the route: one call, one retry with the retry note, then give up.
  let text = await complete({ system: EVALUATOR_SYSTEM, prompt, maxTokens: EVALUATOR_MAX_TOKENS })
  let raw = text ? parseEvaluatorResponse(text) : null
  if (!raw) {
    text = await complete({ system: EVALUATOR_SYSTEM, prompt: prompt + EVALUATOR_RETRY_NOTE, maxTokens: EVALUATOR_MAX_TOKENS })
    raw = text ? parseEvaluatorResponse(text) : null
  }
  if (!raw) return { ...base, status: text === null ? 'upstream' : 'invalid', scores: {} }
  const g = groundEvaluatorResult(raw, turns)
  const scores: Record<string, number | null> = { adaptation_mean: g.adaptationScore }
  for (const d of COMPETENCY_DIMENSIONS) scores[d] = g.competencies[d].score
  for (const d of ADAPTATION_DIMENSIONS) scores[`adapt.${d}`] = g.adaptation[d].score
  return { ...base, status: 'ok', scores }
}

// ───────────────────────────── statistics ─────────────────────────────

/** Sample standard deviation; null below two values. */
export function sd(xs: number[]): number | null {
  if (xs.length < 2) return null
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

/** The improvement engine's noise floor for score metrics (improvement/metrics.ts). */
export const ENGINE_MIN_DELTA = 5
/** The audit's "concern disproved" bar: spread under this on every dimension. */
export const DISPROVE_SD = 2

export interface DimensionSpread {
  dimension: string
  /** fixtures with at least two numeric scores across repeats */
  fixtures: number
  meanSd: number | null
  p90Sd: number | null
  maxSd: number | null
  /** share of fixtures whose max - min across repeats exceeds ENGINE_MIN_DELTA */
  rangeOverFloor: number | null
  /** share of fixtures where some repeats said null and others gave a number */
  nullFlip: number | null
}

export interface ArmSpread {
  arm: RepeatArm
  model: string
  fixtures: number
  repeats: number
  failedRuns: number
  dimensions: DimensionSpread[]
  /** analyst only: share of fixtures whose first coaching point is not the same in every repeat */
  topPointChanged: number | null
  /** analyst only: mean pairwise Jaccard similarity of the behavior sets across repeats */
  behaviorJaccard: number | null
  verdict: 'stable' | 'unstable' | 'insufficient'
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a), B = new Set(b)
  const union = new Set([...A, ...B]).size
  if (union === 0) return 1
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / union
}

const round = (x: number | null, d = 2) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d)

export function summarizeArm(records: RepeatRecord[], arm: RepeatArm, model: string): ArmSpread {
  const mine = records.filter(r => r.arm === arm && r.model === model)
  const ok = mine.filter(r => r.status === 'ok')
  const byFixture = new Map<string, RepeatRecord[]>()
  for (const r of ok) byFixture.set(r.fixtureId, [...(byFixture.get(r.fixtureId) ?? []), r])
  const groups = [...byFixture.values()].filter(g => g.length >= 2)
  const dims = [...new Set(ok.flatMap(r => Object.keys(r.scores)))]

  const dimensions: DimensionSpread[] = dims.map(dimension => {
    const sds: number[] = []
    let overFloor = 0, flips = 0, judged = 0
    for (const g of groups) {
      const vals = g.map(r => r.scores[dimension]).filter(v => v !== undefined)
      const nums = vals.filter((v): v is number => typeof v === 'number')
      if (vals.length >= 2) { judged++; if (nums.length > 0 && nums.length < vals.length) flips++ }
      const s = sd(nums)
      if (s === null) continue
      sds.push(s)
      if (Math.max(...nums) - Math.min(...nums) > ENGINE_MIN_DELTA) overFloor++
    }
    return {
      dimension, fixtures: sds.length,
      meanSd: round(mean(sds)), p90Sd: round(percentile(sds, 0.9)), maxSd: round(sds.length ? Math.max(...sds) : null),
      rangeOverFloor: sds.length ? round(overFloor / sds.length, 3) : null,
      nullFlip: judged ? round(flips / judged, 3) : null,
    }
  })

  let topPointChanged: number | null = null, behaviorJaccard: number | null = null
  if (arm === 'analyst' && groups.length) {
    topPointChanged = round(groups.filter(g => new Set(g.map(r => r.topPoint)).size > 1).length / groups.length, 3)
    const js: number[] = []
    for (const g of groups) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) js.push(jaccard(g[i].behaviors, g[j].behaviors))
    behaviorJaccard = round(mean(js), 3)
  }

  const repeats = Math.max(0, ...mine.map(r => r.repeat + 1))
  const measured = dimensions.filter(d => d.meanSd !== null)
  // Stable = the audit's disproof bar: mean spread under 2 points on EVERY dimension
  // and the 90th-percentile fixture still inside the engine's 5-point noise floor.
  const verdict: ArmSpread['verdict'] = groups.length < 5 || measured.length === 0 ? 'insufficient'
    : measured.every(d => (d.meanSd as number) < DISPROVE_SD && (d.p90Sd as number) < ENGINE_MIN_DELTA) ? 'stable' : 'unstable'

  return {
    arm, model, fixtures: byFixture.size, repeats, failedRuns: mine.length - ok.length,
    dimensions: dimensions.sort((a, b) => (b.meanSd ?? -1) - (a.meanSd ?? -1)),
    topPointChanged, behaviorJaccard, verdict,
  }
}

const pct = (x: number | null) => (x === null ? 'n/a' : `${Math.round(x * 100)}%`)
const num = (x: number | null) => (x === null ? 'n/a' : x.toFixed(1))

export function renderRepeatReport(spreads: ArmSpread[], runId: string): string {
  const lines = [
    `# Repeat-run reliability: ${runId}`,
    '',
    'Each fixture was scored several times with identical input. Spread is the sample standard deviation of one',
    `fixture's scores across repeats, in score points (0-100). The improvement engine counts a move of ${ENGINE_MIN_DELTA} points as`,
    `real change. The concern is disproved when mean spread is under ${DISPROVE_SD} points on every dimension and the`,
    `90th-percentile fixture stays under ${ENGINE_MIN_DELTA}.`,
    '',
    'Fixtures are synthetic. This measures repeatability only, not whether any score is right.',
  ]
  for (const s of spreads) {
    lines.push('', `## ${s.arm === 'analyst' ? 'Behavior Analyst + scoring engine' : 'Session evaluator (Deep Analysis)'}: ${s.model}`, '',
      `Verdict: **${s.verdict.toUpperCase()}**. ${s.fixtures} fixtures x ${s.repeats} repeats, ${s.failedRuns} failed runs (excluded).`)
    if (s.arm === 'analyst') {
      lines.push('', `- First coaching point differs between repeats: ${pct(s.topPointChanged)} of fixtures.`,
        `- Behavior sets found, mean pairwise overlap (Jaccard): ${pct(s.behaviorJaccard)}.`)
    }
    lines.push('', '| Dimension | Fixtures | Mean spread | P90 spread | Max spread | Range > 5 pts | Null vs number flips |', '|---|---|---|---|---|---|---|')
    for (const d of s.dimensions) lines.push(`| ${d.dimension} | ${d.fixtures} | ${num(d.meanSd)} | ${num(d.p90Sd)} | ${num(d.maxSd)} | ${pct(d.rangeOverFloor)} | ${pct(d.nullFlip)} |`)
  }
  lines.push('', '## What to decide from this', '',
    '- If UNSTABLE at the provider default, rerun with the same model plus `@t=0` and compare. Setting temperature 0 in production is a one-line change per route.',
    '- If the analyst stays unstable at `@t=0`, the cause is which behaviors are found, not the arithmetic. Then stop multiplying points by the model\'s own confidence (`scoring/engine.ts`) and raise `minObservations`.',
    '- If the evaluator is unstable, fix it (audit item 5) before the pilot freezes its prompt version.')
  return lines.join('\n') + '\n'
}
