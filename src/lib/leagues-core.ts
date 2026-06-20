export interface LeagueXpRow {
  rep_id: string
  amount: number
  created_at: string
}

export interface TeamScore {
  companyId: string
  avgXp: number
  repCount: number
  rank: number
}

/**
 * Average weekly XP per rep for each team, ranked highest-first. `repCounts`
 * maps companyId -> number of role='rep' members; `repByCompany` maps rep_id ->
 * companyId. Rows at/after `since` are summed per company and divided by that
 * company's rep count. Teams with zero reps are excluded (no divide-by-zero).
 * Every team with >=1 rep appears, even with zero XP. Ties broken by companyId.
 */
export function rankTeams(
  rows: LeagueXpRow[],
  repCounts: Map<string, number>,
  repByCompany: Map<string, string>,
  since: Date,
): TeamScore[] {
  const sinceMs = since.getTime()
  const totals = new Map<string, number>()
  for (const r of rows) {
    if (new Date(r.created_at).getTime() < sinceMs) continue
    const company = repByCompany.get(r.rep_id)
    if (!company) continue
    totals.set(company, (totals.get(company) ?? 0) + r.amount)
  }

  const scored: TeamScore[] = []
  for (const [companyId, repCount] of repCounts) {
    if (repCount <= 0) continue // exclude zero-rep teams
    scored.push({
      companyId,
      repCount,
      avgXp: Math.round((totals.get(companyId) ?? 0) / repCount),
      rank: 0,
    })
  }

  scored.sort((a, b) => b.avgXp - a.avgXp || a.companyId.localeCompare(b.companyId))
  scored.forEach((t, i) => { t.rank = i + 1 })
  return scored
}
