import { createBehaviorAnalystAgent } from '@/agents/behaviorAnalyst'
import { extractJson, groundObservations } from '@/agents/behaviorAnalyst/ground'
import { createCoachAgent } from '@/agents/coach'
import { extractJson as extractCoachJson, groundCoaching } from '@/agents/coach/ground'
import { selectCoachingCandidates } from '@/agents/coach/select'
import { createAnthropicComplete, type CompleteFn, type CompleteUsage } from '@/agents/llm'
import type { Observation } from '@/schemas/observation'
import type { StyleShiftSession } from '@/schemas/session'
import { behaviorIndex, defaultScoringConfig } from '@/scoring/config'
import { scoreSession } from '@/scoring/engine'
import { ADAPTATION_DIMENSIONS, COMPETENCY_DIMENSIONS } from '@/lib/session-evaluator'
import { FIXTURES, toSession, type BenchFixture } from './fixtures'
import {
  coachLanguageOk, coachTextFields, doctorOnlyEvidenceCount, mean, parseVariant, scoreAgainstKey, variantExtraBody,
  type AnalystRecord, type CallRecord, type CoachRecord, type FinalStatus,
} from './metrics'

/** Where a model call really goes. A live run uses the Anthropic API; a dry run
 * uses `fakeInner`, so the whole pipeline can be tested without spending money. */
export interface Backend {
  /** One complete() per job, so usage from parallel jobs never mixes. */
  make(model: string, onUsage: (u: CompleteUsage) => void): CompleteFn
}

export function liveBackend(apiKey: string): Backend {
  return {
    make(spec, onUsage) {
      const v = parseVariant(spec)
      return createAnthropicComplete(apiKey, {
        model: v.model, onUsage: u => onUsage({ ...u, model: spec }),
        extraBody: variantExtraBody(v),
        maxTokensMultiplier: v.maxTokensMultiplier ?? undefined,
      })
    },
  }
}

const meta = (f: BenchFixture) => ({
  fixtureId: f.id, mix: f.mix, style: f.style, difficulty: f.difficulty, performance: f.performance, length: f.length,
})

// ───────────────────────────── gold observations (Coach input) ─────────────────────────────

/** Observations built from the answer key, so both models coach on identical
 * input and Analyst differences cannot leak into the Coach comparison. */
export function goldObservations(f: BenchFixture, session: StyleShiftSession): Observation[] {
  const catalog = behaviorIndex(defaultScoringConfig)
  const out: Observation[] = []
  for (const m of f.must) {
    const entry = catalog.get(m.behavior)
    const turn = session.transcript[m.turn]
    if (!entry || !turn) continue
    out.push({
      competency: entry.competency, behavior: m.behavior,
      observation: entry.rule.description,
      evidence: [{ turnIndex: turn.turnIndex, role: turn.role, quote: turn.text }],
      timestamp: null, direction: entry.rule.points > 0 ? 'positive' : 'negative', confidence: 0.9,
    })
  }
  return out
}

/** The frozen Coach input: transcript, gold observations and their deterministic scores. */
export function coachSession(f: BenchFixture): StyleShiftSession {
  const s = toSession(f)
  s.observations = goldObservations(f, s)
  s.scores = scoreSession(s.observations, s.difficulty, defaultScoringConfig, new Date(0))
  return s
}

// ───────────────────────────── instrumented call ─────────────────────────────

type Classify = (raw: string) => Pick<CallRecord, 'jsonValid' | 'generated' | 'grounded' | 'dropped'>

function instrument(inner: CompleteFn, calls: CallRecord[], getUsage: () => CompleteUsage | null, classify: Classify): CompleteFn {
  return async args => {
    const raw = await inner(args)
    const u = getUsage()
    calls.push({
      ok: raw !== null, status: u?.status ?? null, inputTokens: u?.inputTokens ?? null, outputTokens: u?.outputTokens ?? null,
      latencyMs: u?.latencyMs ?? 0, stopReason: u?.stopReason ?? null, thinkingTokens: u?.thinkingTokens ?? null,
      ...(raw === null ? { jsonValid: false, generated: 0, grounded: 0, dropped: 0 } : classify(raw)),
    })
    return raw
  }
}

// ───────────────────────────── Analyst job ─────────────────────────────

export async function runAnalystJob(backend: Backend, model: string, f: BenchFixture): Promise<AnalystRecord> {
  const session = toSession(f)
  const calls: CallRecord[] = []
  let usage: CompleteUsage | null = null
  const inner = backend.make(model, u => { usage = u })
  const complete = instrument(inner, calls, () => usage, raw => {
    const g = groundObservations(extractJson(raw), session.transcript)
    return g
      ? { jsonValid: true, generated: g.observations.length + g.dropped, grounded: g.observations.length, dropped: g.dropped }
      : { jsonValid: false, generated: 0, grounded: 0, dropped: 0 }
  })
  const { analyze } = createBehaviorAnalystAgent(complete)

  let finalStatus: FinalStatus = 'ok'
  let errorDetail: string | null = null
  let observations: Observation[] = []
  let dropped = 0
  try {
    const out = await analyze(session)
    if ('error' in out) { finalStatus = out.error === 'invalid' ? 'invalid' : out.error === 'upstream' ? 'upstream' : 'error'; errorDetail = out.error }
    else { observations = out.observations; dropped = out.dropped }
  } catch (e) {
    finalStatus = 'error'; errorDetail = e instanceof Error ? e.message.slice(0, 160) : 'unknown'
  }

  const first = calls[0]
  return {
    arm: 'analyst', model, ...meta(f), calls, attempts: calls.length,
    firstAttemptValid: !!first && first.jsonValid && first.grounded > 0,
    retryRequired: calls.length > 1,
    finalStatus, errorDetail, observations,
    generated: observations.length + dropped, grounded: observations.length, dropped,
    ...scoreAgainstKey(f, observations),
    doctorOnlyEvidence: doctorOnlyEvidenceCount(observations),
  }
}

// ───────────────────────────── Coach job ─────────────────────────────

export async function runCoachJob(backend: Backend, model: string, f: BenchFixture): Promise<CoachRecord | null> {
  const session = coachSession(f)
  const candidates = selectCoachingCandidates(session)
  if (candidates.length === 0) return null // nothing to coach: not a model outcome, so not recorded

  const calls: CallRecord[] = []
  let usage: CompleteUsage | null = null
  const inner = backend.make(model, u => { usage = u })
  const complete = instrument(inner, calls, () => usage, raw => {
    const parsed = extractCoachJson(raw)
    const g = groundCoaching(parsed, candidates, session.learningObjectives)
    const asked = parsed && typeof parsed === 'object' && Array.isArray((parsed as { points?: unknown }).points)
      ? (parsed as { points: unknown[] }).points.length : 0
    return g
      ? { jsonValid: true, generated: asked, grounded: g.coaching.length, dropped: g.dropped }
      : { jsonValid: false, generated: 0, grounded: 0, dropped: 0 }
  })
  const { coach } = createCoachAgent(complete)

  let finalStatus: FinalStatus = 'ok'
  let errorDetail: string | null = null
  let coaching: CoachRecord['coaching'] = []
  let dropped = 0
  try {
    const out = await coach(session)
    if ('error' in out) { finalStatus = out.error === 'invalid' ? 'invalid' : out.error === 'upstream' ? 'upstream' : 'error'; errorDetail = out.error }
    else { coaching = out.coaching; dropped = out.dropped }
  } catch (e) {
    finalStatus = 'error'; errorDetail = e instanceof Error ? e.message.slice(0, 160) : 'unknown'
  }

  const first = calls[0]
  const fieldLens = coaching.flatMap(c => coachTextFields(c).map(t => t.length))
  return {
    arm: 'coach', model, ...meta(f), calls, attempts: calls.length,
    firstAttemptValid: !!first && first.jsonValid && first.grounded > 0,
    retryRequired: calls.length > 1,
    finalStatus, errorDetail, candidates: candidates.length, kept: coaching.length, dropped, coaching,
    languageOk: coachLanguageOk(session.lang, coaching),
    avgFieldChars: Math.round(mean(fieldLens) ?? 0),
  }
}

// ───────────────────────────── dry-run backend ─────────────────────────────

/** Offline stand-in: answers the Analyst from the answer key and the Coach with
 * canned text. It proves the pipeline end to end and costs nothing. Its numbers
 * say nothing about either model. */
export function fakeBackend(): Backend {
  return {
    make(model, onUsage) {
      return async ({ prompt, system }) => {
        onUsage({ model, ok: true, inputTokens: Math.round(prompt.length / 4), outputTokens: 400, latencyMs: 5, stopReason: 'end_turn', status: 200, thinkingTokens: null })
        if (system.includes('sales-coaching evaluator')) {
          // Fixed scores, so a dry repeat run shows zero spread: it tests the plumbing only.
          const dim = (score: number | null) => ({ score, turnRefs: [1], rationale: 'dry run' })
          return JSON.stringify({
            competencies: Object.fromEntries(COMPETENCY_DIMENSIONS.map((d, i) => [d, dim(i === 0 ? null : 50 + i)])),
            adaptation: Object.fromEntries(ADAPTATION_DIMENSIONS.map((d, i) => [d, dim(60 + i)])),
            adaptationRecommendation: 'dry run', criticalMoments: [{ turnIndex: 1, observedBehavior: 'dry run', missedOpportunity: null, alternative: null }],
            pressureShiftInsight: '',
          })
        }
        if (system.includes('sales coach')) {
          const refs = [...new Set([...prompt.matchAll(/\[(c\d+)\]/g)].map(m => m[1]))]
          return JSON.stringify({ points: refs.map(ref => ({
            ref, whatHappened: 'dry run', whyItMattered: 'dry run', whatToDoDifferently: 'dry run',
            betterResponseExample: 'dry run', practiceAction: 'dry run',
          })) })
        }
        const f = FIXTURES.find(x => prompt.includes(x.turns[0].slice(2).trim()) && prompt.includes(x.turns[x.turns.length - 1].slice(2).trim()))
        const catalog = behaviorIndex(defaultScoringConfig)
        const session = f ? toSession(f) : null
        return JSON.stringify({ observations: (f?.must ?? []).map(m => {
          const e = catalog.get(m.behavior)!
          return {
            competency: e.competency, behavior: m.behavior, observation: e.rule.description,
            evidence: [{ turnIndex: m.turn, quote: session!.transcript[m.turn].text }],
            direction: e.rule.points > 0 ? 'positive' : 'negative', confidence: 0.9,
          }
        }) })
      }
    },
  }
}
