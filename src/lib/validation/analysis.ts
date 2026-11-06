import { METHODOLOGY_VERSION } from './pilot-admin-service'
import { AI_COMPARABLE_DOMAINS, RUBRIC_DOMAINS, RUBRIC_VERSION, type RubricDomain } from './rubric'
import {
  agreementStatus, aiScoreToRating, bootstrapCI, icc21, meanAbsoluteError, proportionStatus, spearman, weightedKappa, wilcoxonSignedRank, wilson,
  type BootstrapResult, type ErrorResult, type Pair, type Status, type WilcoxonResult,
} from './stats'

/**
 * The pilot analysis, exactly as pre-specified in docs/validation/measurement-methodology.md (mm-1.0.0). Pure: it takes
 * plain rows and returns numbers, statuses and a recommendation. Every statistic carries its sample size and how many
 * pairs were left out; nothing missing is turned into a number; nothing is rounded into a single "accuracy" figure.
 */
export { METHODOLOGY_VERSION }

export const TARGETS = {
  raterAgreementKappa: 0.7,
  aiHumanKappa: 0.65,
  unsupportedClaims: 0.02,
  evidenceValidity: 0.95,
  negationPreserved: 0.98,
  plannedSessionsCompleted: 0.85,
} as const

/** Methodology section 7: below these the status is NOT ENOUGH DATA and the recommendation INSUFFICIENT EVIDENCE. */
export const MINIMUMS = { repsWithBaselineAndFollowup: 12, doubleRatedSessions: 30, adjudicatedMajorClaims: 100, arabicUtterances: 150, negationUtterances: 40 } as const

export interface AnalysisRating {
  raterId: string
  /** The rater marked the whole case unrateable: it counts as rated but gives no domain score. */
  unscorable: boolean
  /** 1 to 5; null = "not observable" (NO); a domain missing from the object was not answered. */
  scores: Partial<Record<RubricDomain, number | null>>
}

export interface AnalysisCase {
  assignmentId: string
  repId: string
  scenarioType: 'A' | 'B' | 'C' | 'D'
  scenarioVersion: 'v1' | 'v2'
  phase: 'baseline' | 'practice' | 'followup'
  /** SUBMITTED ratings only. */
  ratings: AnalysisRating[]
  /** The AI's 0-100 score per rubric domain; null or absent when there is none. */
  ai: Partial<Record<RubricDomain, number | null>>
}

export type Verdict = 'supported' | 'partly_supported' | 'unsupported'
export type Certainty = 'stated' | 'inferred' | 'not_established'
export interface ClaimVerdict { assignmentId: string; claimRef: string; certainty: Certainty | null; verdict: Verdict; adjudicatorId: string | null }

export interface AnalysisInput {
  dataSource: 'synthetic' | 'staging' | 'pilot'
  cases: AnalysisCase[]
  claims: ClaimVerdict[]
  /** The security gate result, decided outside this module. */
  securityGate: 'PASS' | 'CONDITIONAL' | 'FAIL' | 'UNKNOWN'
  /** Critical privacy or security incidents during the pilot; null when nobody has counted. */
  criticalIncidents: number | null
  /** Human-reviewed Arabic results, when the Arabic benchmark has been run. */
  arabic?: { utterances: number; negationUtterances: number; negationPreserved: number } | null
}

// ───────────────────────────── helpers ─────────────────────────────

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null)
const byRater = (rs: AnalysisRating[]) => [...rs].sort((a, b) => a.raterId.localeCompare(b.raterId))
const score = (r: AnalysisRating, d: RubricDomain): number | null => (r.unscorable ? null : (r.scores[d] ?? null))
/** The mean of the domains this rater actually observed, or null when fewer than `min` were. */
function observedMean(r: AnalysisRating, min = 1): number | null {
  const v = RUBRIC_DOMAINS.map(d => score(r, d)).filter((x): x is number => x !== null)
  return v.length >= min ? mean(v) : null
}
/** Every unordered pair of raters of one case, in a fixed order (by rater id). */
function raterPairs(c: AnalysisCase): Array<[AnalysisRating, AnalysisRating]> {
  const rs = byRater(c.ratings)
  const out: Array<[AnalysisRating, AnalysisRating]> = []
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) out.push([rs[i], rs[j]])
  return out
}

export interface Interval { estimate: number | null; lower: number | null; upper: number | null; n: number; excluded: number }
function kappaWithInterval(cases: AnalysisCase[], pairsOf: (c: AnalysisCase) => Pair[], opts: { categories?: number[] } = {}): Interval {
  const all = cases.flatMap(pairsOf)
  const k = weightedKappa(all, opts)
  const ci: BootstrapResult = bootstrapCI(cases, sample => weightedKappa(sample.flatMap(pairsOf), opts).kappa)
  return { estimate: k.kappa, lower: ci.lower, upper: ci.upper, n: k.n, excluded: k.excluded }
}

// ───────────────────────────── the report ─────────────────────────────

export interface IndicatorResult { status: Status; detail: string }

export interface AnalysisReport {
  methodologyVersion: string
  rubricVersion: string
  dataSource: AnalysisInput['dataSource']
  /** Synthetic and staging data are never pilot evidence (methodology section 9). */
  label: string
  counts: { cases: number; casesWithTwoRatings: number; casesFullyRated: number; reps: number; ratings: number }
  raterAgreement: {
    perDomain: Record<RubricDomain, Interval>
    pooledKappa: Interval
    sessionAverageIcc: { icc: number | null; lower: number | null; upper: number | null; sessions: number; excluded: number }
  }
  aiHumanAgreement: {
    perDomain: Partial<Record<RubricDomain, { kappa: Interval; kappaShiftMinus5: number | null; kappaShiftPlus5: number | null; error: ErrorResult; spearman: { rho: number | null; n: number } }>>
    pooledKappa: Interval
    /** Pooled kappa between the AI and the first, and the second, rater of each case (rater slots, not named people). */
    byRaterSlot: Array<number | null>
  }
  claims: {
    adjudicated: number
    unsupported: number
    rate: ReturnType<typeof wilson>
    byCertainty: Record<Certainty | 'unlabelled', { n: number; unsupported: number; rate: ReturnType<typeof wilson> }>
    /** Claims where adjudicators did not all agree. The headline uses the majority; ties take the more adverse verdict. */
    adjudicatorDisagreements: number
  }
  coachingChange: {
    repsWithBaselineAndFollowup: number
    alternateScenario: { n: number; meanDifference: number | null; interval: BootstrapResult; wilcoxon: WilcoxonResult }
    sameScenario: { n: number; meanDifference: number | null }
    note: string
  }
  indicators: {
    raterAgreement: IndicatorResult
    aiHumanAgreement: IndicatorResult
    unsupportedClaims: IndicatorResult
    evidenceValidity: IndicatorResult
    negationPreserved: IndicatorResult
    plannedSessionsCompleted: IndicatorResult
    targetedBehaviorChange: IndicatorResult
    criticalIncidents: IndicatorResult
  }
  minimums: Record<keyof typeof MINIMUMS, { have: number | null; need: number; reached: boolean }>
  securityGate: AnalysisInput['securityGate']
  recommendation: 'GO' | 'CONDITIONAL_GO' | 'NO_GO' | 'INSUFFICIENT_EVIDENCE' | 'NOT_PILOT_DATA'
  conditions: string[]
}

const VERDICT_ORDER: Verdict[] = ['supported', 'partly_supported', 'unsupported'] // least to most adverse

/** One verdict per claim: the majority of its adjudicators; on a tie, the more adverse of the tied verdicts. */
function resolveClaims(claims: ClaimVerdict[]) {
  const groups = new Map<string, ClaimVerdict[]>()
  for (const c of claims) groups.set(`${c.assignmentId}\u0000${c.claimRef}`, [...(groups.get(`${c.assignmentId}\u0000${c.claimRef}`) ?? []), c])
  let disagreements = 0
  const resolved = [...groups.values()].map(g => {
    const counts = new Map<Verdict, number>()
    for (const c of g) counts.set(c.verdict, (counts.get(c.verdict) ?? 0) + 1)
    if (counts.size > 1) disagreements++
    const top = Math.max(...counts.values())
    const verdict = VERDICT_ORDER.filter(v => counts.get(v) === top).pop()!
    return { verdict, certainty: g[0].certainty }
  })
  return { resolved, disagreements }
}

export function analyse(input: AnalysisInput): AnalysisReport {
  const cases = input.cases
  const usable = (c: AnalysisCase) => c.ratings.filter(r => !r.unscorable)
  const doubleRated = cases.filter(c => usable(c).length >= 2)
  const label = input.dataSource === 'pilot' ? 'Pilot data' : `${input.dataSource[0].toUpperCase()}${input.dataSource.slice(1)} data: not pilot evidence`

  // 1. Rater agreement, per domain and pooled (cluster bootstrap by session: the case is the cluster).
  const domainPairs = (d: RubricDomain) => (c: AnalysisCase): Pair[] => raterPairs(c).map(([a, b]) => [score(a, d), score(b, d)] as Pair)
  const perDomain = Object.fromEntries(RUBRIC_DOMAINS.map(d => [d, kappaWithInterval(doubleRated, domainPairs(d))])) as Record<RubricDomain, Interval>
  const pooledPairs = (c: AnalysisCase): Pair[] => RUBRIC_DOMAINS.flatMap(d => domainPairs(d)(c))
  const pooledKappa = kappaWithInterval(doubleRated, pooledPairs)

  // Session-average ICC(2,1): each of the first two raters' mean of observed domains (at least 2 observed).
  const iccRow = (c: AnalysisCase) => { const rs = byRater(usable(c)).slice(0, 2); return rs.map(r => observedMean(r, 2)) }
  const iccRows = doubleRated.map(iccRow)
  const iccAll = icc21(iccRows)
  const iccCi = bootstrapCI(doubleRated, sample => icc21(sample.map(iccRow)).icc)
  const sessionAverageIcc = { icc: iccAll.icc, lower: iccCi.lower, upper: iccCi.upper, sessions: iccAll.n, excluded: iccAll.excluded }

  // 2. AI vs human, on the domains the AI has a counterpart for.
  const aiPairs = (d: RubricDomain, shift = 0) => (c: AnalysisCase): Pair[] =>
    usable(c).map(r => [aiScoreToRating(c.ai[d], shift), score(r, d)] as Pair)
  const aiPerDomain: AnalysisReport['aiHumanAgreement']['perDomain'] = {}
  for (const d of AI_COMPARABLE_DOMAINS) {
    const humanMean = (c: AnalysisCase) => mean(usable(c).map(r => score(r, d)).filter((x): x is number => x !== null))
    aiPerDomain[d] = {
      kappa: kappaWithInterval(cases, aiPairs(d)),
      kappaShiftMinus5: weightedKappa(cases.flatMap(aiPairs(d, -5))).kappa,
      kappaShiftPlus5: weightedKappa(cases.flatMap(aiPairs(d, 5))).kappa,
      error: meanAbsoluteError(cases.flatMap(aiPairs(d))),
      spearman: (() => { const s = spearman(cases.map(c => [c.ai[d] ?? null, humanMean(c)] as Pair)); return { rho: s.rho, n: s.n } })(),
    }
  }
  const aiPooledPairs = (c: AnalysisCase): Pair[] => AI_COMPARABLE_DOMAINS.flatMap(d => aiPairs(d)(c))
  const aiPooled = kappaWithInterval(cases, aiPooledPairs)
  const slotKappa = (slot: number) => weightedKappa(cases.flatMap(c => {
    const r = byRater(c.ratings)[slot]
    return r && !r.unscorable ? AI_COMPARABLE_DOMAINS.map(d => [aiScoreToRating(c.ai[d]), score(r, d)] as Pair) : []
  })).kappa

  // 3. Claims.
  const { resolved, disagreements } = resolveClaims(input.claims)
  const unsupported = resolved.filter(c => c.verdict === 'unsupported').length
  const byCertainty = Object.fromEntries((['stated', 'inferred', 'not_established', 'unlabelled'] as const).map(k => {
    const g = resolved.filter(c => (c.certainty ?? 'unlabelled') === k)
    const u = g.filter(c => c.verdict === 'unsupported').length
    return [k, { n: g.length, unsupported: u, rate: wilson(u, g.length) }]
  })) as AnalysisReport['claims']['byCertainty']
  const claimRate = wilson(unsupported, resolved.length)

  // 4. Coaching change: per rep, the mean human rating at baseline and at follow-up (alternate scenario version = transfer).
  const repScore = (cs: AnalysisCase[]) => mean(cs.flatMap(c => usable(c).map(r => observedMean(r))).filter((x): x is number => x !== null))
  const reps = [...new Set(cases.map(c => c.repId))]
  const alt: number[] = [], same: number[] = []
  for (const rep of reps) {
    const base = cases.filter(c => c.repId === rep && c.phase === 'baseline')
    const follow = cases.filter(c => c.repId === rep && c.phase === 'followup')
    const b = repScore(base)
    if (b === null) continue
    const baseVersions = new Set(base.map(c => c.scenarioVersion))
    const alternate = follow.filter(c => !baseVersions.has(c.scenarioVersion))
    const repeat = follow.filter(c => baseVersions.has(c.scenarioVersion))
    const fa = repScore(alternate), fs = repScore(repeat)
    if (fa !== null) alt.push(fa - b)
    if (fs !== null) same.push(fs - b)
  }
  const repsWithBoth = new Set(cases.filter(c => c.phase === 'followup' && usable(c).length > 0).map(c => c.repId))
  const repsBoth = reps.filter(r => repsWithBoth.has(r) && cases.some(c => c.repId === r && c.phase === 'baseline' && usable(c).length > 0)).length

  // 5. Minimums, indicators, recommendation.
  const casesFullyRated = cases.filter(c => c.ratings.length >= 2).length
  const minimums: AnalysisReport['minimums'] = {
    repsWithBaselineAndFollowup: { have: repsBoth, need: MINIMUMS.repsWithBaselineAndFollowup, reached: repsBoth >= MINIMUMS.repsWithBaselineAndFollowup },
    doubleRatedSessions: { have: doubleRated.length, need: MINIMUMS.doubleRatedSessions, reached: doubleRated.length >= MINIMUMS.doubleRatedSessions },
    adjudicatedMajorClaims: { have: resolved.length, need: MINIMUMS.adjudicatedMajorClaims, reached: resolved.length >= MINIMUMS.adjudicatedMajorClaims },
    arabicUtterances: { have: input.arabic?.utterances ?? null, need: MINIMUMS.arabicUtterances, reached: (input.arabic?.utterances ?? 0) >= MINIMUMS.arabicUtterances },
    negationUtterances: { have: input.arabic?.negationUtterances ?? null, need: MINIMUMS.negationUtterances, reached: (input.arabic?.negationUtterances ?? 0) >= MINIMUMS.negationUtterances },
  }
  const noData = (detail: string): IndicatorResult => ({ status: 'NOT_ENOUGH_DATA', detail })
  const negation = input.arabic ? wilson(input.arabic.negationPreserved, input.arabic.negationUtterances) : null
  const indicators: AnalysisReport['indicators'] = {
    raterAgreement: { status: agreementStatus({ estimate: pooledKappa.estimate, lower: pooledKappa.lower, n: doubleRated.length }, TARGETS.raterAgreementKappa, MINIMUMS.doubleRatedSessions), detail: 'Pooled weighted kappa across domains (ICC is reported beside it, not instead of it).' },
    aiHumanAgreement: { status: agreementStatus({ estimate: aiPooled.estimate, lower: aiPooled.lower, n: doubleRated.length }, TARGETS.aiHumanKappa, MINIMUMS.doubleRatedSessions), detail: 'Pooled weighted kappa between the AI conversion and each human rating, on the domains the AI covers.' },
    unsupportedClaims: { status: proportionStatus('max', claimRate, TARGETS.unsupportedClaims, MINIMUMS.adjudicatedMajorClaims), detail: 'Share of adjudicated major AI claims that are unsupported.' },
    evidenceValidity: noData('Not measured: no human judgement of whether each cited line supports its claim is stored yet.'),
    negationPreserved: negation && input.arabic ? { status: proportionStatus('min', negation, TARGETS.negationPreserved, MINIMUMS.negationUtterances), detail: 'Critical negation meaning preserved in reviewed Arabic cases.' } : noData('Not measured: the Arabic benchmark has not been run.'),
    plannedSessionsCompleted: noData(`Not measured: the planned number of sessions is not stored. ${casesFullyRated} of ${cases.length} cases have two or more submitted ratings.`),
    targetedBehaviorChange: noData('Not assessable: the domain the AI chose to target for each representative is not stored, so only overall change is reported (exploratory).'),
    criticalIncidents: input.criticalIncidents === null ? noData('Nobody has entered the incident count.') : { status: input.criticalIncidents === 0 ? 'MET' : 'NOT_MET', detail: `${input.criticalIncidents} critical privacy or security incidents.` },
  }

  const minimumsReached = Object.values(minimums).every(m => m.reached)
  const statuses = Object.values(indicators).map(i => i.status)
  const conditions: string[] = []
  let recommendation: AnalysisReport['recommendation']
  if (input.dataSource !== 'pilot') recommendation = 'NOT_PILOT_DATA'
  // Section 8, in this order: a critical incident or a failed gate, or an indicator that is NOT MET (which can only
  // happen once its sample is big enough), is NO-GO. Then anything still unmeasured or under its minimum is INSUFFICIENT EVIDENCE.
  else if (statuses.includes('NOT_MET') || (input.criticalIncidents ?? 0) > 0 || input.securityGate === 'FAIL') recommendation = 'NO_GO'
  else if (!minimumsReached || statuses.includes('NOT_ENOUGH_DATA')) recommendation = 'INSUFFICIENT_EVIDENCE'
  else if (statuses.every(s => s === 'MET') && input.securityGate === 'PASS') recommendation = 'GO'
  else {
    recommendation = 'CONDITIONAL_GO'
    for (const [k, v] of Object.entries(indicators)) if (v.status !== 'MET') conditions.push(`${k}: ${v.status}`)
    if (input.securityGate !== 'PASS') conditions.push(`securityGate: ${input.securityGate}`)
  }

  return {
    methodologyVersion: METHODOLOGY_VERSION,
    rubricVersion: RUBRIC_VERSION,
    dataSource: input.dataSource,
    label,
    counts: { cases: cases.length, casesWithTwoRatings: doubleRated.length, casesFullyRated, reps: reps.length, ratings: cases.reduce((s, c) => s + c.ratings.length, 0) },
    raterAgreement: { perDomain, pooledKappa, sessionAverageIcc },
    aiHumanAgreement: { perDomain: aiPerDomain, pooledKappa: aiPooled, byRaterSlot: [slotKappa(0), slotKappa(1)] },
    claims: { adjudicated: resolved.length, unsupported, rate: claimRate, byCertainty, adjudicatorDisagreements: disagreements },
    coachingChange: {
      repsWithBaselineAndFollowup: repsBoth,
      alternateScenario: { n: alt.length, meanDifference: mean(alt), interval: bootstrapCI(alt, s => mean(s)), wilcoxon: wilcoxonSignedRank(alt) },
      sameScenario: { n: same.length, meanDifference: mean(same) },
      note: 'A before-and-after comparison supports "changed", not "caused". Exploratory: no comparison group is recorded.',
    },
    indicators,
    minimums,
    securityGate: input.securityGate,
    recommendation,
    conditions,
  }
}
