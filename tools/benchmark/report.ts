import type { BenchFixture } from './fixtures'
import {
  baseModel, mean, pairedBootstrap, percentile, recordCost,
  type AnalystRecord, type BenchRecord, type CoachRecord, type PricingFile,
} from './metrics'

/** Decision thresholds. Kept in one place so they can be argued with. */
export const THRESHOLDS = {
  /** Absolute points of grounding rate the candidate may lose and still pass. */
  groundingDropMax: 0.03,
  /** Absolute increase in the share of planted traps the candidate may fall for. */
  trapIncreaseMax: 0.02,
  /** Absolute drop in recall of expected behaviors on the Arabic subset. */
  arabicRecallDropMax: 0.05,
  /** Cost per session must fall by at least this share to count as an economic win. */
  costSavingMin: 0.15,
  /** Or median latency must fall by at least this share with equal quality. */
  latencySavingMin: 0.2,
  /** Minimum scored review items before human results count. */
  reviewMinItems: 20,
  /** Review scores: candidate may trail the baseline by at most this on a 1-5 scale. */
  reviewMeanDropMax: 0.1,
} as const

const rate = (n: number, d: number) => (d === 0 ? null : n / d)

export interface ArmStats {
  model: string
  n: number
  okRate: number | null
  upstreamFailures: number
  firstAttemptValidRate: number | null
  retryRate: number | null
  invalidJsonRate: number | null
  truncated: number
  avgInputTokens: number | null
  avgOutputTokens: number | null
  avgThinkingTokens: number | null
  avgLatencyMsPerRequest: number | null
  p50LatencyMs: number | null
  p95LatencyMs: number | null
  /** Wall-clock total for one session (all its requests). */
  avgSessionLatencyMs: number | null
  costPerSession: number | null
  costPer1000: number | null
  requestsLe100k: number
  requestsGt100k: number
}

function common(model: string, rs: BenchRecord[], pricing: PricingFile): ArmStats {
  const calls = rs.flatMap(r => r.calls)
  const okCalls = calls.filter(c => c.ok)
  const costs = rs.map(r => recordCost(pricing.models[baseModel(model)], r))
  const allCosted = costs.length > 0 && costs.every(c => c !== null)
  const perSession = allCosted ? mean(costs as number[]) : null
  return {
    model, n: rs.length,
    okRate: rate(rs.filter(r => r.finalStatus === 'ok').length, rs.length),
    upstreamFailures: rs.filter(r => r.finalStatus === 'upstream').length,
    firstAttemptValidRate: rate(rs.filter(r => r.firstAttemptValid).length, rs.length),
    retryRate: rate(rs.filter(r => r.retryRequired).length, rs.length),
    invalidJsonRate: rate(rs.filter(r => r.calls[0] && r.calls[0].ok && !r.calls[0].jsonValid).length, rs.length),
    truncated: calls.filter(c => c.stopReason === 'max_tokens').length,
    avgInputTokens: mean(okCalls.map(c => c.inputTokens ?? 0)),
    avgOutputTokens: mean(okCalls.map(c => c.outputTokens ?? 0)),
    avgThinkingTokens: mean(okCalls.map(c => c.thinkingTokens ?? 0)),
    avgLatencyMsPerRequest: mean(okCalls.map(c => c.latencyMs)),
    p50LatencyMs: percentile(okCalls.map(c => c.latencyMs), 0.5),
    p95LatencyMs: percentile(okCalls.map(c => c.latencyMs), 0.95),
    avgSessionLatencyMs: mean(rs.map(r => r.calls.reduce((a, c) => a + c.latencyMs, 0))),
    costPerSession: perSession,
    costPer1000: perSession === null ? null : perSession * 1000,
    requestsLe100k: okCalls.filter(c => (c.inputTokens ?? 0) <= 100_000).length,
    requestsGt100k: okCalls.filter(c => (c.inputTokens ?? 0) > 100_000).length,
  }
}

export interface AnalystStats extends ArmStats {
  /** Observations that survived grounding / observations the model produced. */
  groundingRate: number | null
  /** Grounded observations per session. */
  observationYield: number | null
  droppedPerSession: number | null
  recallStrict: number | null
  recallBehavior: number | null
  /** Planted traps the model fell for / traps planted. */
  trapRate: number | null
  /** Trap hits as a share of grounded observations. */
  unsupportedFindingRate: number | null
  doctorOnlyEvidenceRate: number | null
}

export function analystStats(model: string, all: AnalystRecord[], pricing: PricingFile): AnalystStats {
  const rs = all.filter(r => r.model === model)
  const done = rs.filter(r => r.finalStatus === 'ok')
  const sum =(f: (r: AnalystRecord) => number) => done.reduce((a, r) => a + f(r), 0)
  return {
    ...common(model, rs, pricing),
    groundingRate: rate(sum(r => r.grounded), sum(r => r.generated)),
    observationYield: mean(done.map(r => r.grounded)),
    droppedPerSession: mean(done.map(r => r.dropped)),
    recallStrict: rate(sum(r => r.mustFoundStrict), sum(r => r.mustTotal)),
    recallBehavior: rate(sum(r => r.mustFoundBehavior), sum(r => r.mustTotal)),
    trapRate: rate(sum(r => r.trapHits), sum(r => r.trapTotal)),
    unsupportedFindingRate: rate(sum(r => r.trapHits), sum(r => r.grounded)),
    doctorOnlyEvidenceRate: rate(sum(r => r.doctorOnlyEvidence), sum(r => r.grounded)),
  }
}

export interface CoachStats extends ArmStats {
  /** Coaching points kept / points the app asked for. */
  keptRate: number | null
  languageOkRate: number | null
  avgFieldChars: number | null
}

export function coachStats(model: string, all: CoachRecord[], pricing: PricingFile): CoachStats {
  const rs = all.filter(r => r.model === model)
  const done = rs.filter(r => r.finalStatus === 'ok')
  return {
    ...common(model, rs, pricing),
    keptRate: rate(done.reduce((a, r) => a + r.kept, 0), done.reduce((a, r) => a + r.candidates, 0)),
    languageOkRate: rate(done.filter(r => r.languageOk).length, done.length),
    avgFieldChars: mean(done.map(r => r.avgFieldChars)),
  }
}

// ───────────────────────────── blind review results ─────────────────────────────

export interface ReviewKey { itemId: string; arm: 'analyst' | 'coach'; fixtureId: string; isArabic: boolean; aModel: string; bModel: string }
export interface ReviewSummary {
  items: number
  /** Mean 1-5 score per model per criterion. */
  means: Record<string, Record<string, number | null>>
  /** Wins per model and ties, overall preference. */
  preference: Record<string, number> & { tie: number }
  arabicMeans: Record<string, Record<string, number | null>>
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  const t = text.replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.length > 1 || r[0] !== '')
}

/** Joins the reviewer's CSV with the secret key. Unblinding happens here only. */
export function summarizeReview(csv: string, key: ReviewKey[], models: string[]): ReviewSummary {
  const byItem = new Map(key.map(k => [k.itemId, k]))
  const acc = new Map<string, number[]>() // `${model}|${criterion}|${arabic?}`
  const pref: Record<string, number> = { tie: 0 }
  models.forEach(m => { pref[m] = 0 })
  const prefItems = new Set<string>()
  for (const [item, side, criterion, value] of parseCsv(csv).slice(1)) {
    const k = byItem.get(item)
    if (!k) continue
    if (criterion === 'preference') {
      prefItems.add(item)
      if (value === 'Tie') pref.tie++
      else if (value === 'A') pref[k.aModel] = (pref[k.aModel] ?? 0) + 1
      else if (value === 'B') pref[k.bModel] = (pref[k.bModel] ?? 0) + 1
    } else if (side === 'A' || side === 'B') {
      const n = Number(value)
      if (!Number.isFinite(n) || n < 1 || n > 5) continue
      const model = side === 'A' ? k.aModel : k.bModel
      for (const tag of k.isArabic ? ['all', 'ar'] : ['all']) {
        const id = `${model}|${criterion}|${tag}`
        acc.set(id, [...(acc.get(id) ?? []), n])
      }
    }
  }
  const crit = ['accuracy', 'grounding', 'insight', 'usefulness', 'specificity', 'iraqi']
  const table = (tag: string) => Object.fromEntries(models.map(m => [m, Object.fromEntries(crit.map(c => [c, mean(acc.get(`${m}|${c}|${tag}`) ?? [])]))]))
  return { items: prefItems.size, means: table('all'), arabicMeans: table('ar'), preference: pref as ReviewSummary['preference'] }
}

// ───────────────────────────── gates and recommendation ─────────────────────────────

export type Recommendation = 'MIGRATE TO HAIKU 5.5' | 'RUN HYBRID ROUTING' | 'KEEP HAIKU 4.5' | 'INSUFFICIENT EVIDENCE'
export interface Gate { name: string; pass: boolean | null; detail: string }

const pct = (x: number | null) => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`)
const num = (x: number | null, d = 2) => (x === null ? 'n/a' : x.toFixed(d))
const usd = (x: number | null) => (x === null ? 'n/a (price not set)' : `$${x.toFixed(4)}`)

export interface Decision {
  recommendation: Recommendation
  reasons: string[]
  gates: Gate[]
}

export function decide(
  base: { a: AnalystStats; c: CoachStats; arabicA: AnalystStats; hardA: AnalystStats },
  cand: { a: AnalystStats; c: CoachStats; arabicA: AnalystStats; hardA: AnalystStats },
  review: ReviewSummary | null, models: [string, string],
): Decision {
  const T = THRESHOLDS
  const d = (x: number | null, y: number | null) => (x === null || y === null ? null : x - y)
  const gates: Gate[] = []
  const g = d(cand.a.groundingRate, base.a.groundingRate)
  gates.push({ name: 'Grounding rate not materially lower', pass: g === null ? null : g >= -T.groundingDropMax, detail: `${pct(base.a.groundingRate)} → ${pct(cand.a.groundingRate)}` })
  const tr = d(cand.a.trapRate, base.a.trapRate)
  gates.push({ name: 'Unsupported findings (planted traps) not higher', pass: tr === null ? null : tr <= T.trapIncreaseMax, detail: `${pct(base.a.trapRate)} → ${pct(cand.a.trapRate)}` })
  const ar = d(cand.arabicA.recallStrict, base.arabicA.recallStrict)
  gates.push({ name: 'Iraqi/code-switched recall not materially lower', pass: ar === null ? null : ar >= -T.arabicRecallDropMax, detail: `${pct(base.arabicA.recallStrict)} → ${pct(cand.arabicA.recallStrict)}` })
  const reviewReady = !!review && review.items >= T.reviewMinItems
  let humanPass: boolean | null = null
  let humanDetail = `blind review not scored yet (needs at least ${T.reviewMinItems} items)`
  if (reviewReady) {
    const crit = ['accuracy', 'grounding', 'insight', 'usefulness', 'specificity']
    const diffs = crit.map(c => d(review!.means[models[1]]?.[c] ?? null, review!.means[models[0]]?.[c] ?? null)).filter((x): x is number => x !== null)
    const iraqi = d(review!.arabicMeans[models[1]]?.iraqi ?? null, review!.arabicMeans[models[0]]?.iraqi ?? null)
    humanPass = diffs.length > 0 && diffs.every(x => x >= -T.reviewMeanDropMax) && (iraqi === null || iraqi >= -T.reviewMeanDropMax)
    humanDetail = `score differences (candidate minus baseline): ${crit.map((c, i) => `${c} ${diffs[i] === undefined ? 'n/a' : diffs[i].toFixed(2)}`).join(', ')}; Iraqi ${iraqi === null ? 'n/a' : iraqi.toFixed(2)}`
  }
  gates.push({ name: 'Human review: coach usefulness and Iraqi understanding equal or higher', pass: humanPass, detail: humanDetail })
  const rr = d(cand.a.retryRate, base.a.retryRate), ij = d(cand.a.invalidJsonRate, base.a.invalidJsonRate)
  const crr = d(cand.c.retryRate, base.c.retryRate), cij = d(cand.c.invalidJsonRate, base.c.invalidJsonRate)
  gates.push({ name: 'Retry rate not higher (analyst, coach)', pass: rr === null || crr === null ? null : rr <= 0 && crr <= 0, detail: `analyst ${pct(base.a.retryRate)} → ${pct(cand.a.retryRate)}; coach ${pct(base.c.retryRate)} → ${pct(cand.c.retryRate)}` })
  gates.push({ name: 'Invalid-JSON rate not higher (analyst, coach)', pass: ij === null || cij === null ? null : ij <= 0 && cij <= 0, detail: `analyst ${pct(base.a.invalidJsonRate)} → ${pct(cand.a.invalidJsonRate)}; coach ${pct(base.c.invalidJsonRate)} → ${pct(cand.c.invalidJsonRate)}` })
  const bc = (base.a.costPerSession ?? NaN) + (base.c.costPerSession ?? NaN), cc = (cand.a.costPerSession ?? NaN) + (cand.c.costPerSession ?? NaN)
  const saving = Number.isFinite(bc) && Number.isFinite(cc) && bc > 0 ? 1 - cc / bc : null
  const bl = (base.a.p50LatencyMs ?? NaN), cl = (cand.a.p50LatencyMs ?? NaN)
  const latSaving = Number.isFinite(bl) && Number.isFinite(cl) && bl > 0 ? 1 - cl / bl : null
  gates.push({ name: 'Economics: cost per session materially lower, or latency materially lower', pass: (saving ?? -1) >= T.costSavingMin || (latSaving ?? -1) >= T.latencySavingMin ? true : saving === null ? null : false, detail: `cost saving ${saving === null ? 'n/a (price not set)' : pct(saving)}; median analyst latency saving ${latSaving === null ? 'n/a' : pct(latSaving)}` })

  const q = gates.slice(0, 4), rel = gates.slice(4, 6), eco = gates[6]
  const unknown = gates.filter(x => x.pass === null)
  const reasons: string[] = []
  if (cand.a.upstreamFailures > cand.a.n * 0.2) reasons.push(`The candidate model was rejected or unavailable on ${cand.a.upstreamFailures} of ${cand.a.n} analyst calls. Fix access before judging quality.`)
  if (unknown.length) reasons.push(`Not measurable yet: ${unknown.map(x => x.name).join('; ')}.`)

  // The hard subset (resistant / pressure_test or Arabic) decides whether routing makes sense.
  const hardRecall = d(cand.hardA.recallStrict, base.hardA.recallStrict)
  const easyOk = (cand.a.groundingRate ?? 0) >= (base.a.groundingRate ?? 0) - T.groundingDropMax
  if (reasons.length) return { recommendation: 'INSUFFICIENT EVIDENCE', reasons, gates }
  if (q.every(x => x.pass) && rel.every(x => x.pass) && eco.pass) return { recommendation: 'MIGRATE TO HAIKU 5.5', reasons: ['Every quality, reliability and economic gate passed.'], gates }
  if (q.some(x => x.pass === false) && easyOk && eco.pass && hardRecall !== null && hardRecall < -T.arabicRecallDropMax && rel.every(x => x.pass))
    return { recommendation: 'RUN HYBRID ROUTING', reasons: ['The candidate is cheaper or faster and holds up on ordinary sessions, but trails the baseline on the hard or Arabic subset.'], gates }
  const failed = gates.filter(x => x.pass === false).map(x => x.name)
  return { recommendation: 'KEEP HAIKU 4.5', reasons: failed.length ? [`Failed: ${failed.join('; ')}.`] : ['No gate passed clearly.'], gates }
}

// ───────────────────────────── report text ─────────────────────────────

export interface SummaryInput {
  records: BenchRecord[]
  fixtures: BenchFixture[]
  models: [string, string]
  pricing: PricingFile
  review: ReviewSummary | null
  runId: string
}

export function buildReport(inp: SummaryInput): { markdown: string; decision: Decision; stats: Record<string, unknown> } {
  const { records, fixtures, models, pricing, review } = inp
  const A = records.filter((r): r is AnalystRecord => r.arm === 'analyst')
  const C = records.filter((r): r is CoachRecord => r.arm === 'coach')
  const isArabic = (id: string) => fixtures.find(f => f.id === id)!.mix !== 'en'
  const isHard = (id: string) => { const f = fixtures.find(x => x.id === id)!; return f.mix !== 'en' || f.difficulty === 'resistant' || f.difficulty === 'pressure_test' }
  const per = (m: string) => ({
    a: analystStats(m, A, pricing), c: coachStats(m, C, pricing),
    arabicA: analystStats(m, A.filter(r => isArabic(r.fixtureId)), pricing),
    iraqiA: analystStats(m, A.filter(r => r.mix === 'iraqi'), pricing),
    csA: analystStats(m, A.filter(r => r.mix === 'codeswitch'), pricing),
    enA: analystStats(m, A.filter(r => r.mix === 'en'), pricing),
    hardA: analystStats(m, A.filter(r => isHard(r.fixtureId)), pricing),
  })
  const b = per(models[0]), c = per(models[1])
  const decision = decide(b, c, review, models)

  // Paired differences per fixture: candidate minus baseline recall.
  const diffs: number[] = []
  const worse: { id: string; model: string; note: string }[] = []
  for (const f of fixtures) {
    const x = A.find(r => r.fixtureId === f.id && r.model === models[0]), y = A.find(r => r.fixtureId === f.id && r.model === models[1])
    if (!x || !y || x.finalStatus !== 'ok' || y.finalStatus !== 'ok' || x.mustTotal === 0) continue
    const dx = y.mustFoundStrict / y.mustTotal - x.mustFoundStrict / x.mustTotal
    diffs.push(dx)
    if (dx < 0) worse.push({ id: f.id, model: models[1], note: `found ${y.mustFoundStrict}/${y.mustTotal} expected vs ${x.mustFoundStrict}/${x.mustTotal}${y.trapHits > x.trapHits ? `; fell for ${y.trapHits} trap(s)` : ''}` })
    else if (dx > 0) worse.push({ id: f.id, model: models[0], note: `found ${x.mustFoundStrict}/${x.mustTotal} expected vs ${y.mustFoundStrict}/${y.mustTotal}${x.trapHits > y.trapHits ? `; fell for ${x.trapHits} trap(s)` : ''}` })
    else if (x.trapHits !== y.trapHits) worse.push({ id: f.id, model: x.trapHits > y.trapHits ? models[0] : models[1], note: `fell for ${Math.max(x.trapHits, y.trapHits)} trap(s) vs ${Math.min(x.trapHits, y.trapHits)}` })
  }
  const boot = pairedBootstrap(diffs)
  const row = (label: string, f: (s: AnalystStats) => string) => `| ${label} | ${f(b.a)} | ${f(c.a)} |`
  const crow = (label: string, f: (s: CoachStats) => string) => `| ${label} | ${f(b.c)} | ${f(c.c)} |`
  const ms = (x: number | null) => (x === null ? 'n/a' : `${Math.round(x)} ms`)

  const lines: string[] = []
  lines.push(`# Haiku 4.5 vs Haiku 5.5 — StyleShift benchmark`, '', `Run ${inp.runId}. Baseline: \`${models[0]}\`. Candidate: \`${models[1]}\` (a model id followed by @setting means the same model with that request setting). Fixtures: ${fixtures.length} synthetic sessions (20 English, 20 Iraqi Arabic, 20 code-switched). Deterministic scoring unchanged; only the model varies.`, '')
  lines.push('## Executive Result', '', `**Recommendation: ${decision.recommendation}**`, '', ...decision.reasons.map(r => `- ${r}`), '', '| Gate | Result | Detail |', '|---|---|---|', ...decision.gates.map(g2 => `| ${g2.name} | ${g2.pass === null ? 'not measurable' : g2.pass ? 'pass' : 'FAIL'} | ${g2.detail} |`), '')
  lines.push('## Behavior Analyst', '', `| Metric | ${models[0]} | ${models[1]} |`, '|---|---|---|',
    row('Sessions run', s => String(s.n)), row('Completed OK', s => pct(s.okRate)), row('Upstream failures', s => String(s.upstreamFailures)),
    row('Grounding rate (kept / produced)', s => pct(s.groundingRate)), row('Observation yield (per session)', s => num(s.observationYield)),
    row('Dropped per session', s => num(s.droppedPerSession)), row('Recall of expected behaviors (exact turn)', s => pct(s.recallStrict)),
    row('Recall of expected behaviors (anywhere)', s => pct(s.recallBehavior)), row('Planted-trap hit rate', s => pct(s.trapRate)),
    row('Unsupported finding rate (trap hits / observations)', s => pct(s.unsupportedFindingRate)), row('Evidence from doctor lines only', s => pct(s.doctorOnlyEvidenceRate)),
    row('First attempt valid', s => pct(s.firstAttemptValidRate)), row('Retry rate', s => pct(s.retryRate)), row('Invalid JSON rate (first reply)', s => pct(s.invalidJsonRate)),
    row('Truncated at max_tokens', s => String(s.truncated)), row('Avg input / output tokens', s => `${num(s.avgInputTokens, 0)} / ${num(s.avgOutputTokens, 0)}`), row('Avg thinking tokens (inside output)', s => num(s.avgThinkingTokens, 0)),
    row('Latency p50 / p95 per request', s => `${ms(s.p50LatencyMs)} / ${ms(s.p95LatencyMs)}`), row('Cost per session', s => usd(s.costPerSession)), row('Cost per 1,000 sessions', s => usd(s.costPer1000)),
    row('Requests ≤100K / >100K input tokens', s => `${s.requestsLe100k} / ${s.requestsGt100k}`), '')
  lines.push(`Paired difference in recall per fixture (candidate minus baseline): ${boot ? `${(boot.mean * 100).toFixed(1)} points, 95% interval ${(boot.lo * 100).toFixed(1)} to ${(boot.hi * 100).toFixed(1)}` : 'n/a'} over ${diffs.length} fixtures. An interval that includes zero means the two models are not shown to differ.`, '')
  lines.push('## Coach', '', `| Metric | ${models[0]} | ${models[1]} |`, '|---|---|---|',
    crow('Sessions run', s => String(s.n)), crow('Completed OK', s => pct(s.okRate)), crow('Points kept / points asked', s => pct(s.keptRate)),
    crow('Output language correct', s => pct(s.languageOkRate)), crow('Avg characters per field', s => num(s.avgFieldChars, 0)),
    crow('First attempt valid', s => pct(s.firstAttemptValidRate)), crow('Retry rate', s => pct(s.retryRate)), crow('Invalid JSON rate (first reply)', s => pct(s.invalidJsonRate)),
    crow('Latency p50 / p95 per request', s => `${ms(s.p50LatencyMs)} / ${ms(s.p95LatencyMs)}`), crow('Cost per session', s => usd(s.costPerSession)), '')
  lines.push(`Coach input is frozen: gold observations from the answer key and the deterministic scores computed from them, identical for both models. Grounding for the coach is structural (each point is tied to an app-chosen candidate; scores, percentages and over-long text are dropped), so a "kept" rate below 100% means the model wrote something the rules reject. Usefulness, specificity and accuracy of coaching come only from the blind review.`, '')
  if (review) {
    lines.push('### Blind review (human)', '', `Scored items: ${review.items}. Preference: ${models.map(m => `${m} ${review.preference[m] ?? 0}`).join(', ')}, tie ${review.preference.tie}.`, '', `| Criterion | ${models[0]} | ${models[1]} | Arabic only: ${models[0]} | Arabic only: ${models[1]} |`, '|---|---|---|---|---|',
      ...['accuracy', 'grounding', 'insight', 'usefulness', 'specificity', 'iraqi'].map(k => `| ${k} | ${num(review.means[models[0]]?.[k] ?? null)} | ${num(review.means[models[1]]?.[k] ?? null)} | ${num(review.arabicMeans[models[0]]?.[k] ?? null)} | ${num(review.arabicMeans[models[1]]?.[k] ?? null)} |`), '')
  } else lines.push('### Blind review (human)', '', 'Not scored yet. Quality of coaching and Iraqi understanding cannot be judged from the automatic metrics alone.', '')
  lines.push('## Failure Analysis', '', worse.length ? worse.map(w => `- **${w.id}**: ${w.model} was worse (${w.note}).`).join('\n') : 'No fixture showed a difference in expected-behavior recall or trap hits.', '')
  lines.push('## Iraqi Arabic Findings', '', `| Subset (analyst) | Recall ${models[0]} | Recall ${models[1]} | Grounding ${models[0]} | Grounding ${models[1]} | Trap rate ${models[0]} | Trap rate ${models[1]} |`, '|---|---|---|---|---|---|---|',
    ...([['English (reference)', 'enA'], ['Iraqi Arabic', 'iraqiA'], ['Code-switched', 'csA']] as const).map(([label, k]) => `| ${label} | ${pct(b[k].recallStrict)} | ${pct(c[k].recallStrict)} | ${pct(b[k].groundingRate)} | ${pct(c[k].groundingRate)} | ${pct(b[k].trapRate)} | ${pct(c[k].trapRate)} |`), '',
    'Iraqi fixtures 1-20 are Iraqi counterparts of English fixtures 1-20, so the English-to-Iraqi gap is measured on the same scenario. The fixtures were written by an AI assistant and are pending native-speaker review; a model "miss" on an Arabic fixture is only a finding once the answer key is confirmed. Grounding compares quotes after lower-casing and stripping quote marks only; Arabic spelling variants (alef/hamza forms, diacritics) are not normalised, which can penalise a model that silently corrects spelling.', '')
  lines.push('## Economics', '', `| | ${models[0]} | ${models[1]} |`, '|---|---|---|', `| Analyst cost per session | ${usd(b.a.costPerSession)} | ${usd(c.a.costPerSession)} |`, `| Coach cost per session | ${usd(b.c.costPerSession)} | ${usd(c.c.costPerSession)} |`, `| Cost per 1,000 full sessions | ${usd(b.a.costPer1000 !== null && b.c.costPer1000 !== null ? b.a.costPer1000 + b.c.costPer1000 : null)} | ${usd(c.a.costPer1000 !== null && c.c.costPer1000 !== null ? c.a.costPer1000 + c.c.costPer1000 : null)} |`, '',
    `Prices come from \`pricing.json\` (version ${pricing.version}); a price left unset shows as "n/a" and is never estimated. Prompt size selects the price tier per request (100K input tokens or less, or more). Every fixture is far below 100K, so the larger tier is not exercised by this run; real long sessions would need their own measurement.`, '')
  lines.push('## Recommendation', '', `**${decision.recommendation}**`, '', ...decision.reasons.map(r => `- ${r}`), '')
  return { markdown: lines.join('\n'), decision, stats: { models, baseline: b, candidate: c, pairedRecallDiff: boot } }
}
