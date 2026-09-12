import type { BehavioralGravityResult, GravityMetricKey, GravityPattern } from '@/lib/behavioral-gravity'
import type { UnusedResourceFinding } from '@/lib/unused-resource-detector'
import type { ClearStep, ObjectionType } from '@/lib/voice-partner-core'

// Phase 6 ("Adaptive Coaching" — docs/ai-doctor-phase-1-plan.md's Deferred
// list, docs/ai-doctor-gap-analysis.md's "Mastermind Coach" row: "no
// structured Observation->Evidence->Pattern->Impact->Alternative->Experiment
// output anywhere"). Same no-external-spec caveat as Phase 5's two modules —
// this file's reading of what each of the six parts concretely means,
// grounded in what Phase 2/3/5 already compute (not re-derived here):
//
//   Observation  - what happens, in plain language.
//   Evidence     - the real numbers backing it (copied straight from
//                  GravityPattern/UnusedResourceFinding, never re-invented).
//   Pattern      - how often/where it recurs (Phase 5's session counts).
//   Impact       - the measurable consequence (Phase 5's win-rate gap for a
//                  Gravity pattern; deliberately NOT fabricated for an Unused
//                  Resource finding, see below).
//   Alternative  - a concrete different behavior, named as one of the app's
//                  existing 5 CLEAR steps (Clarify/Listen/Empathy/Answer/
//                  Recheck) - never a generic tip.
//   Experiment   - a specific, re-practicable target: an ObjectionType +
//                  ClearStep pairing a rep could drill next.
//
// ARCHITECTURE DECISION (flagged): this module is a THIRD pure, cross-session
// synthesis step layered on top of Phase 5's already-computed
// BehavioralGravityResult/UnusedResourceFinding[] - it does not touch
// conversation_turns/session_scorecards itself and does not live inside
// session-evaluator.ts's per-session Deep Analysis call. Two reasons: (1)
// both inputs are themselves cross-session (a GravityPattern only exists
// once >=3 sessions share a trigger), so there is no single session whose
// evaluator call this could hang off; (2) Phase 5 already made the "compute
// live at read time, no cache table" call for the same reason (Team
// Pulse/Champions precedent) - Mastermind Coach reuses that same computed
// output rather than opening a second read path with its own DB queries.
//
// DECISION (flagged - no new LLM call): Observation/Pattern/Impact/
// Alternative text here is 100% deterministic (template strings + a fixed
// metric-direction -> ClearStep lookup for Gravity patterns), NOT
// LLM-generated. This differs from how Phase 2/4 write narrative text
// (Critical Moments' interpretation, Pressure Shift's one-sentence insight)
// - those exist BECAUSE the evidence itself only makes sense as free text
// (a critical moment's "what happened" has no fixed vocabulary). Here the
// input is already a small, fully-typed set of (metric, direction) and
// (step, context) combinations - a lookup table covers every case exactly,
// with zero hallucination risk and zero added LLM cost/latency, and is
// fully unit-testable before any real session data exists to validate an
// LLM-authored sentence's quality against. If real usage later shows these
// templates read as stiff/repetitive, upgrading Alternative specifically to
// an LLM-authored sentence (numbers still computed here, model only
// rephrases) would be a natural v2 - deliberately not built now.
//
// DECISION (flagged - Experiment is a SUGGESTION, not a live assignment):
// `assignments.ts`'s `createAssignment()` targets `target_type: 'category'`
// with a `target_key` drawn from company-scenario's SEPARATE 7-category
// `ObjectionCategory` taxonomy (the `L2_OBJECTION` set used by
// AssignPanel.tsx/DailyChallenge) - NOT voice-partner's 5-type
// `ObjectionType` this module and Phase 5 both key on. Auto-creating a real
// assignment from an `ObjectionType` value would silently write a
// `target_key` that does not correspond to any real category in the OTHER
// taxonomy, misrouting reps into a drill set that doesn't match what was
// actually detected. The 2026-09-11 decision to leave the two taxonomies
// unmerged until Phase 5 had real pattern data applies here just as much -
// this module still does not touch that taxonomy or `createAssignment`.
// `MastermindExperiment` is therefore a plain, structured recommendation
// (which objection type, which step, a human label) for a manager to act on
// by eye - not a one-click "assign" wired to the live assignments table.

const OBJECTION_LABEL: Record<ObjectionType, string> = {
  wrong_info: 'Wrong Info', doubt: 'Doubt', true_objection: 'True Objection',
  indifference: 'Indifference', false_objection: 'False Objection',
}
const CLEAR_STEP_LABEL: Record<ClearStep, string> = {
  clarify: 'Clarify', listen: 'Listen', empathy: 'Empathy', answer: 'Answer', recheck: 'Recheck',
}
const METRIC_LABEL: Record<GravityMetricKey, string> = {
  avgRepTurnLength: 'reply length', openQuestionRatio: 'open-question rate', clearStepsPerTurn: 'CLEAR steps/turn',
}

/** For each Gravity metric, which CLEAR step to recommend when the rep's
 * behavior swings ABOVE their own baseline under a trigger vs. BELOW it.
 * Grounded in what each step actually is (voice-partner-core.ts's CLEAR_STEPS),
 * not an arbitrary pairing - see the per-case comment in gravityAlternative. */
const GRAVITY_ALTERNATIVE_STEP: Record<GravityMetricKey, { above: ClearStep; below: ClearStep }> = {
  avgRepTurnLength: { above: 'listen', below: 'clarify' },
  openQuestionRatio: { above: 'answer', below: 'clarify' },
  clearStepsPerTurn: { above: 'listen', below: 'recheck' },
}

function gravityAlternative(p: GravityPattern): { step: ClearStep; text: string } {
  const label = OBJECTION_LABEL[p.trigger]
  const above = p.deviationPct >= 0
  const step = GRAVITY_ALTERNATIVE_STEP[p.metric][above ? 'above' : 'below']
  const stepLabel = CLEAR_STEP_LABEL[step]

  let text: string
  switch (p.metric) {
    case 'avgRepTurnLength':
      text = above
        ? `You tend to over-explain once ${label} comes up. Slow down and lean on ${stepLabel} — let the doctor finish, then reflect back what you heard before responding.`
        : `You go quieter once ${label} comes up instead of engaging. Lean on ${stepLabel} — ask an open question to draw out what's really behind it rather than retreating.`
      break
    case 'openQuestionRatio':
      text = above
        ? `You lean harder on open questions here without closing the loop. Follow up with ${stepLabel} — once you've drawn out the concern, give a direct, evidence-grounded answer instead of just probing further.`
        : `You default to closed, directive replies here instead of open questions. Lean on ${stepLabel} — ask what's actually behind the objection before you try to resolve it.`
      break
    case 'clearStepsPerTurn':
      text = above
        ? `You run through the CLEAR steps more than usual here, but it isn't landing. Slow down on ${stepLabel} specifically — make sure you're actually absorbing the objection, not just moving through the checklist.`
        : `You skip steps of the CLEAR framework more than usual here. Make a point of closing with ${stepLabel} — confirm out loud that you've actually resolved the concern before moving on.`
      break
  }
  return { step, text }
}

export interface MastermindEvidence {
  trigger: ObjectionType
  sessionCount: number
  metric?: GravityMetricKey
  triggerAvg?: number
  baselineAvg?: number
  deviationPct?: number
  winRate?: number
  baselineWinRate?: number
  winRateGapPts?: number
  step?: ClearStep
  provenContext?: ObjectionType
  provenRate?: number
  provenSessionCount?: number
  underusedContext?: ObjectionType
  underusedRate?: number
  underusedSessionCount?: number
}

export interface MastermindExperiment {
  objectionType: ObjectionType
  focusStep: ClearStep
  /** Human-readable label for a manager to read and act on manually - not a
   * target_key for assignments.ts (see the Experiment decision note above). */
  label: string
}

export interface MastermindInsight {
  source: 'gravity' | 'unused_resource'
  observation: string
  evidence: MastermindEvidence
  pattern: string
  impact: string
  alternative: string
  experiment: MastermindExperiment
}

function gravityInsight(p: GravityPattern): MastermindInsight {
  const label = OBJECTION_LABEL[p.trigger]
  const metricLabel = METRIC_LABEL[p.metric]
  const alt = gravityAlternative(p)

  return {
    source: 'gravity',
    observation: `Under ${label} objections, your ${metricLabel} shifts noticeably from how you normally practice.`,
    evidence: {
      trigger: p.trigger, sessionCount: p.sessionCount, metric: p.metric,
      triggerAvg: p.triggerAvg, baselineAvg: p.baselineAvg, deviationPct: p.deviationPct,
      winRate: p.winRate, baselineWinRate: p.baselineWinRate, winRateGapPts: p.winRateGapPts,
    },
    pattern: `Seen across ${p.sessionCount} of your practice sessions with this objection type — a recurring reaction, not a one-off.`,
    impact: `Your win rate on ${label} sessions is ${p.winRate}%, ${p.winRateGapPts} points below your ${p.baselineWinRate}% overall average.`,
    alternative: alt.text,
    experiment: {
      objectionType: p.trigger, focusStep: alt.step,
      label: `Practice ${label} objections, focusing on the ${CLEAR_STEP_LABEL[alt.step]} step`,
    },
  }
}

function unusedResourceInsight(f: UnusedResourceFinding): MastermindInsight {
  const stepLabel = CLEAR_STEP_LABEL[f.step]
  const provenLabel = OBJECTION_LABEL[f.provenContext]
  const underusedLabel = OBJECTION_LABEL[f.underusedContext]

  return {
    source: 'unused_resource',
    observation: `You reliably use ${stepLabel} when ${provenLabel} comes up, but rarely reach for it when ${underusedLabel} comes up.`,
    evidence: {
      trigger: f.underusedContext, sessionCount: f.provenSessionCount + f.underusedSessionCount, step: f.step,
      provenContext: f.provenContext, provenRate: f.provenRate, provenSessionCount: f.provenSessionCount,
      underusedContext: f.underusedContext, underusedRate: f.underusedRate, underusedSessionCount: f.underusedSessionCount,
    },
    pattern: `Demonstrated in ${f.provenSessionCount} ${provenLabel} session(s) (${f.provenRate}%); almost absent in ${f.underusedSessionCount} ${underusedLabel} session(s) (${f.underusedRate}%).`,
    // Deliberately NOT a win-rate/quantified figure, unlike gravityInsight's
    // impact — detectUnusedResources never computes an outcome correlation
    // (CapabilityUsageRow carries no `outcome` field at all), so stating one
    // here would be fabricated. This is an honest, qualitative framing
    // instead: a proven capability sitting idle is inherently lower-risk to
    // apply than a claim from Gravity's outcome-correlated numbers.
    impact: 'Not scored against outcome — this is a demonstrated capability sitting idle, not a skill gap, so applying it is a low-risk nudge rather than new training.',
    alternative: `Use ${stepLabel} explicitly the next few times ${underusedLabel} comes up — you already do this well elsewhere.`,
    experiment: {
      objectionType: f.underusedContext, focusStep: f.step,
      label: `Practice ${underusedLabel} objections, deliberately using the ${stepLabel} step`,
    },
  }
}

/**
 * Turns Phase 5's already-computed Behavioral Gravity result + Unused
 * Resource findings into structured Mastermind Coach insights. Pure - no DB
 * access, no LLM call (see the file header's two flagged decisions). Gravity
 * patterns are listed first (they carry a quantified outcome consequence),
 * followed by Unused Resource findings (a lower-stakes capability nudge);
 * within each group, the input's own ordering is preserved (both
 * computeBehavioralGravity and detectUnusedResources already sort
 * worst/largest-gap first).
 */
export function buildMastermindInsights(
  gravity: BehavioralGravityResult | null,
  unusedResources: UnusedResourceFinding[],
): MastermindInsight[] {
  const insights: MastermindInsight[] = []
  if (gravity) for (const p of gravity.patterns) insights.push(gravityInsight(p))
  for (const f of unusedResources) insights.push(unusedResourceInsight(f))
  return insights
}
