// One recurring pattern from a rep's recent practice simulations, for a single line on Home.
// Pure and deterministic: it only counts what the scoring engine already recorded.

export interface PatternContribution { behavior: string; points: number }
export interface PatternCompetency { score: number | null; contributions?: PatternContribution[] }
export interface PatternSession { competencies: Record<string, PatternCompetency> | null }

export type PracticePattern =
  | { kind: 'repeated_behavior'; behavior: string; count: number; of: number }
  | { kind: 'weak_area'; competency: string; average: number; of: number }

const WINDOW = 5
/** Fewer scored sessions than this is noise, not a pattern. */
const MIN_SESSIONS = 3
const WEAK_BELOW = 45

/** `sessions` newest first. Prefers a specific behavior that hurt in most recent sessions; otherwise the weakest area. */
export function findPracticePattern(sessions: PatternSession[]): PracticePattern | null {
  const recent = sessions.filter(s => s.competencies).slice(0, WINDOW)
  if (recent.length < MIN_SESSIONS) return null

  const hurt = new Map<string, { sessions: number; points: number }>()
  for (const s of recent) {
    const seen = new Map<string, number>()
    for (const comp of Object.values(s.competencies!)) {
      for (const c of comp.contributions ?? []) if (c.points < 0) seen.set(c.behavior, (seen.get(c.behavior) ?? 0) + c.points)
    }
    for (const [behavior, points] of seen) {
      const cur = hurt.get(behavior) ?? { sessions: 0, points: 0 }
      hurt.set(behavior, { sessions: cur.sessions + 1, points: cur.points + points })
    }
  }
  const worst = [...hurt].sort((a, b) => b[1].sessions - a[1].sessions || a[1].points - b[1].points)[0]
  if (worst && worst[1].sessions >= MIN_SESSIONS) return { kind: 'repeated_behavior', behavior: worst[0], count: worst[1].sessions, of: recent.length }

  const scores = new Map<string, number[]>()
  for (const s of recent) for (const [name, comp] of Object.entries(s.competencies!)) if (typeof comp.score === 'number') scores.set(name, [...(scores.get(name) ?? []), comp.score])
  const lowest = [...scores].filter(([, v]) => v.length >= MIN_SESSIONS)
    .map(([competency, v]) => ({ competency, average: Math.round(v.reduce((a, b) => a + b, 0) / v.length) }))
    .sort((a, b) => a.average - b.average)[0]
  return lowest && lowest.average < WEAK_BELOW ? { kind: 'weak_area', ...lowest, of: recent.length } : null
}
