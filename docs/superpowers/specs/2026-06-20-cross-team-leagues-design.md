# Cross-Team Leagues — Design Spec

**Date:** 2026-06-20
**Status:** Approved design, ready for implementation plan
**Builds on:** [Champion Spotlight](2026-06-20-champion-spotlight-design.md) — reuses the `xp_events` ledger and Baghdad-time `weeklySince()`.

## Goal

Teams (companies) grouped into a curated **league** compete on a weekly board
ranked by **average XP per rep**. Reps see their team's league rank on the game
home; managers see the full ranked board on the dashboard. Extends recognition
from within-team (champion spotlight) to between-team competition.

## Why

The champion spotlight drives competition inside a team. Shadi's reps span
multiple teams/cohorts; a cross-team league adds a second, higher-stakes layer
("our team vs theirs") that motivates a whole team to play, not just its top
rep. Curated opt-in leagues keep it safe across rival pharma firms.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Format | Team leaderboard (ranking, always-on) |
| Pool | Opt-in leagues the platform owner curates — only teams added to a league see each other |
| Team score | **Average XP per rep** = team weekly XP ÷ rep count |
| Window | **Weekly, Monday reset**, Baghdad time — reuses `weeklySince()` + `xp_events` |
| Cross-team visibility | **Team name + score + rank only** — no individual reps exposed across teams |
| Placement | Rep game home (compact strip) + manager dashboard (full board) |
| League management | **Option A — admin via DB/MCP**: leagues + team assignment done by SQL (no admin UI in v1) |

## Architecture

### 1. Schema — migration `007_leagues.sql`

```sql
create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- One league per team (YAGNI: a join table only if a team must later be in
-- multiple leagues). Nullable: most companies are in no league.
alter table public.companies
  add column league_id uuid references public.leagues(id) on delete set null;

alter table public.leagues enable row level security;

-- Reads go through the service-role admin client (see leagues.ts), so no broad
-- select policy is needed. Leagues are managed by the platform owner via SQL.
```

**Rep count for the average:** `profiles` rows with `role = 'rep'` and the
company's `company_id`. Managers are excluded from the denominator.

**Management (Option A):** the platform owner creates a league and assigns
teams by SQL, e.g.
`insert into leagues (name) values ('Iraq Pharma Cup') returning id;`
then `update companies set league_id = '<league-id>' where id in (...);`
This can be run through the Supabase MCP. No self-serve join, no admin UI in v1.

### 2. `src/lib/leagues-core.ts` (pure, tested)

Pure ranking with no DB dependency, so it is unit-testable.

```ts
export interface LeagueXpRow { rep_id: string; amount: number; created_at: string }

export interface TeamScore {
  companyId: string
  avgXp: number   // rounded to integer
  repCount: number
  rank: number    // 1-based, dense within the league
}

/**
 * Average weekly XP per rep for each team, ranked highest-first. `repCounts`
 * maps companyId -> number of role='rep' members. `repByCompany` maps each
 * rep_id -> its companyId. Rows at/after `since` are summed per company and
 * divided by that company's rep count. Teams with zero reps are excluded
 * (avoids divide-by-zero). Ties broken by companyId for determinism.
 */
export function rankTeams(
  rows: LeagueXpRow[],
  repCounts: Map<string, number>,
  repByCompany: Map<string, string>,
  since: Date,
): TeamScore[]
```

Behaviour:
- Sum `amount` per company for rows with `created_at >= since`.
- A team appears even with zero XP this week (avg 0), as long as it has ≥1 rep.
- `avgXp = Math.round(totalXp / repCount)`.
- Sort by `avgXp` desc, then `companyId` asc; assign 1-based `rank`.

### 3. `src/lib/leagues.ts`

```ts
export interface LeagueTeam {
  companyId: string
  name: string
  avgXp: number
  repCount: number
  rank: number
  isSelf: boolean
}
export interface LeagueBoard {
  leagueName: string
  teams: LeagueTeam[]
  selfRank: number | null
  selfTeamId: string | null
}
export async function getLeagueBoard(userId: string): Promise<LeagueBoard | null>
```

- Admin client (same pattern as `champions.ts`).
- Resolve caller's `company_id` → its `league_id`. If either is null → return
  `null` (no league).
- List member companies: `companies where league_id = <league_id>` (id + name).
- If fewer than 2 member companies → return `null` (a league of one is hidden).
- Load all `role='rep'` profiles for those companies → build `repByCompany`
  (rep_id → companyId) and `repCounts` (companyId → count).
- One `xp_events` read for those rep ids since `weeklySince()`.
- `rankTeams(...)` → hydrate names + `isSelf` (caller's company) → `LeagueBoard`.

### 4. `GET /api/league`

- Authenticate caller; 401 if none.
- Return `getLeagueBoard(user.id)` as JSON (may be `null`).
- Mirrors `/api/champions` route conventions.

### 5. `src/components/game/LeagueStrip.tsx` (rep, self-fetching)

- Compact strip on game home: `🏆 {leagueName} — {t('league.yourRank', { n, total })}`
  e.g. "Iraq Pharma Cup — your team #2 of 6".
- Tap → modal with the ranked team list: rank, team name, avg score; caller's
  team highlighted. Team name + score only (no rep names).
- Renders nothing while loading or when `/api/league` returns `null`.
- Bilingual EN/AR, RTL-safe.

### 6. Manager dashboard panel

- Full ranked board on `/dashboard` (server-rendered like other dashboard
  panels, or a small client island calling `/api/league`). Same data, shown as
  a table: rank, team, avg XP/rep, rep count, self highlighted.

### 7. i18n (EN + AR)

- `league.title` ('Team League'), `league.yourRank` ('your team #{n} of {total}'),
  `league.avgPerRep` ('Avg XP / rep'), `league.team` ('Team'), `league.rank` ('Rank'),
  `league.empty` (shown only if a board is forced with <2 teams; normally hidden).

## Data flow

```
Rep game home → GET /api/league → getLeagueBoard(userId)
  → resolve company.league_id (null -> null)
  → member companies (>=2 else null)
  → rep profiles -> repByCompany + repCounts
  → xp_events since weeklySince()
  → rankTeams() -> hydrate -> LeagueBoard
→ LeagueStrip shows "your team #n of N"; tap -> ranked modal
Manager dashboard → same board as a full table
```

## Edge cases

- Team in no league, or `league_id` set but league has <2 teams → hidden (API null).
- Team with zero reps → excluded from ranking (no ÷0).
- Empty week (no XP) → all teams avg 0, ranked by name.
- Manager-only company (no reps) → excluded.
- Caller's company not actually a member row (data drift) → `isSelf` simply
  never matches; board still renders, `selfRank` null.

## Testing

`src/lib/leagues-core.test.ts`:
- Avg-per-rep computed correctly; small team can outrank a large one.
- Divide-by-zero guard: zero-rep team excluded.
- Window: pre-`since` rows ignored.
- Tie-break determinism (equal avg → companyId order).
- Zero-XP week → all avg 0, stable order.

## Out of scope (YAGNI)

- Admin UI for leagues (managed by SQL/MCP in v1).
- Self-serve league join codes for managers.
- A team belonging to multiple leagues (single `league_id` for now).
- Head-to-head matchups, divisions, promotion/relegation, seasons.
- Cross-team exposure of individual reps or champions.
