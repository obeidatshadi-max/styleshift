// Readiness certification: a manager sets plain requirements, the app checks each rep against
// evidence it already holds, and an issued certificate keeps a frozen copy of the criteria and the
// evidence it was judged on. Everything here is pure so it can be tested without a database.

export const CERTIFICATION_WINDOW_DAYS = 90

export interface Criteria {
  /** Game sessions played, all time. 0 = not required. */
  minGameSessions: number
  /** Average game accuracy, percent. */
  minAccuracy: number
  /** AI Doctor voice sessions finished in the last 90 days. */
  minVoiceSessions: number
  /** Share of those voice sessions the rep won, percent. */
  minWinRate: number
  /** Average adaptation score across analysed voice sessions. */
  minAdaptation: number
}

export const DEFAULT_CRITERIA: Criteria = { minGameSessions: 10, minAccuracy: 70, minVoiceSessions: 5, minWinRate: 60, minAdaptation: 0 }

export interface Evidence {
  gameSessions: number
  avgAccuracy: number
  voiceSessions: number
  /** null until the rep has at least one finished voice session. */
  winRate: number | null
  /** null until at least one voice session has been analysed. */
  adaptationAvg: number | null
  adaptationSessions: number
  windowDays: number
  measuredAt: string
}

export type CheckKey = keyof Criteria
export interface Check { key: CheckKey; required: number; actual: number | null; passed: boolean }
export interface Eligibility { met: boolean; checks: Check[] }

const LIMITS: Record<CheckKey, { max: number; integer: boolean }> = {
  minGameSessions: { max: 1000, integer: true },
  minAccuracy: { max: 100, integer: false },
  minVoiceSessions: { max: 1000, integer: true },
  minWinRate: { max: 100, integer: false },
  minAdaptation: { max: 100, integer: false },
}
export const CRITERIA_KEYS = Object.keys(LIMITS) as CheckKey[]

/** Accepts only a complete, in-range criteria object with at least one requirement switched on. */
export function parseCriteria(input: unknown): { ok: true; criteria: Criteria } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Criteria are missing' }
  const out = {} as Criteria
  for (const key of CRITERIA_KEYS) {
    const v = (input as Record<string, unknown>)[key]
    const { max, integer } = LIMITS[key]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max || (integer && !Number.isInteger(v)))
      return { ok: false, error: `Invalid value for ${key}` }
    out[key] = v
  }
  if (CRITERIA_KEYS.every(k => out[k] === 0)) return { ok: false, error: 'Set at least one requirement' }
  return { ok: true, criteria: out }
}

const ACTUAL: Record<CheckKey, (e: Evidence) => number | null> = {
  minGameSessions: e => e.gameSessions,
  minAccuracy: e => (e.gameSessions > 0 ? e.avgAccuracy : null),
  minVoiceSessions: e => e.voiceSessions,
  minWinRate: e => e.winRate,
  minAdaptation: e => e.adaptationAvg,
}

/** Every switched-on requirement must be met. Missing evidence (no voice session yet) counts as not met. */
export function evaluate(evidence: Evidence, criteria: Criteria): Eligibility {
  const checks: Check[] = []
  for (const key of CRITERIA_KEYS) {
    const required = criteria[key]
    if (required <= 0) continue
    const actual = ACTUAL[key](evidence)
    checks.push({ key, required, actual, passed: actual !== null && actual >= required })
  }
  return { met: checks.length > 0 && checks.every(c => c.passed), checks }
}

export interface VoiceRow { rep_id: string; outcome: string; created_at: string }
export interface ScorecardRow { rep_id: string; adaptation_score: number | null }
export interface GameStat { id: string; total_sessions: number; avg_accuracy: number }

/** Builds one rep's evidence from rows the app already stores. Window start is applied here, not in SQL. */
export function buildEvidence(
  game: GameStat | undefined, voice: VoiceRow[], scorecards: ScorecardRow[], now: Date,
): Evidence {
  const since = now.getTime() - CERTIFICATION_WINDOW_DAYS * 86_400_000
  const finished = voice.filter(v => (v.outcome === 'won' || v.outcome === 'escalated') && Date.parse(v.created_at) >= since)
  const won = finished.filter(v => v.outcome === 'won').length
  const scores = scorecards.map(s => s.adaptation_score).filter((s): s is number => typeof s === 'number')
  return {
    gameSessions: game?.total_sessions ?? 0,
    avgAccuracy: game?.avg_accuracy ?? 0,
    voiceSessions: finished.length,
    winRate: finished.length ? Math.round((won / finished.length) * 100) : null,
    adaptationAvg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    adaptationSessions: scores.length,
    windowDays: CERTIFICATION_WINDOW_DAYS,
    measuredAt: now.toISOString(),
  }
}

// No 0, O, 1, I or L: a code read aloud or copied from a printout must not be ambiguous.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function makeVerifyCode(random: (n: number) => Uint8Array): string {
  const bytes = random(12)
  return Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}
export const isVerifyCode = (s: unknown): s is string => typeof s === 'string' && /^[A-HJKMNP-Z2-9]{12}$/.test(s)

export const certificationEnabled = () => process.env.CERTIFICATION_ENABLED === 'true'

export const CHECK_LABEL: Record<CheckKey, string> = {
  minGameSessions: 'Game sessions',
  minAccuracy: 'Game accuracy (%)',
  minVoiceSessions: `Voice sessions (last ${CERTIFICATION_WINDOW_DAYS} days)`,
  minWinRate: 'Voice win rate (%)',
  minAdaptation: 'Adaptation score',
}
