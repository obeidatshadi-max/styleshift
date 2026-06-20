# Cross-Team Leagues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank teams (companies) grouped into a curated league by weekly average XP per rep, shown to reps on game home and to managers on the dashboard.

**Architecture:** A `leagues` table + `companies.league_id` group teams. A pure `leagues-core` helper computes avg-XP-per-rep ranking from the existing `xp_events` ledger over the Baghdad-time weekly window; `getLeagueBoard` wraps it with DB reads; `/api/league` exposes it; a rep strip and a manager panel render it.

**Tech Stack:** Next.js 16, React 19, Supabase (admin client), Vitest. Reuses `xp_events` + `weeklySince()` from the champion-spotlight feature.

## Global Constraints

- Next.js 16.2.7 — read `node_modules/next/dist/docs/` before route/server code (`AGENTS.md`).
- Weekly window math reuses `weeklySince()` from `src/lib/champions-core.ts` — Asia/Baghdad UTC+3, no DST. Do NOT reimplement it.
- Team score = `Math.round(total weekly xp_events for the team's reps / rep count)`; reps = `profiles` with `role='rep'`. Managers excluded from the denominator.
- Cross-team data exposed = team name, avg score, rank only. Never expose individual rep names/photos across teams.
- A league with fewer than 2 member companies is hidden (API returns `null`).
- Cross-company reads use the service-role admin client (`createAdminClient`), like `src/lib/champions.ts`.
- Rep-facing UI is bilingual EN/AR via `useT()`; the manager dashboard uses hardcoded English (consistent with the existing dashboard).
- Leagues are managed by SQL/MCP — no admin UI, no self-serve join in v1.

---

### Task 1: Leagues schema migration

**Files:**
- Create: `supabase/migrations/007_leagues.sql`

**Interfaces:**
- Produces: table `public.leagues (id, name, created_at)` and column `public.companies.league_id` (nullable FK → leagues, `on delete set null`).

- [ ] **Step 1: Write the migration**

```sql
-- Curated leagues group teams (companies) for cross-team weekly competition.
-- Managed by the platform owner via SQL/MCP; no self-serve join in v1.
create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- One league per team for now (YAGNI: a join table only if a team must later
-- be in multiple leagues). Nullable: most companies are in no league.
alter table public.companies
  add column league_id uuid references public.leagues(id) on delete set null;

alter table public.leagues enable row level security;
-- Reads go through the service-role admin client (leagues.ts); no select policy
-- needed. Leagues are written by the platform owner via SQL.
```

- [ ] **Step 2: Apply the migration**

Apply to the `styleshift` Supabase project (`cnlloaihrrmattuidpeh`) via the Supabase MCP `apply_migration` (name `leagues`) or the dashboard SQL editor — same flow as migration 006.
Expected: `leagues` table exists; `companies` has a `league_id` column; `select league_id from companies limit 1;` runs without error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/007_leagues.sql
git commit -m "feat: leagues schema migration"
```

---

### Task 2: League ranking math (pure, tested)

**Files:**
- Create: `src/lib/leagues-core.ts`
- Test: `src/lib/leagues-core.test.ts`

**Interfaces:**
- Produces:
  - `interface LeagueXpRow { rep_id: string; amount: number; created_at: string }`
  - `interface TeamScore { companyId: string; avgXp: number; repCount: number; rank: number }`
  - `rankTeams(rows: LeagueXpRow[], repCounts: Map<string, number>, repByCompany: Map<string, string>, since: Date): TeamScore[]`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { rankTeams, type LeagueXpRow } from './leagues-core'

const since = new Date('2026-06-15T21:00:00.000Z') // Baghdad Monday 00:00

describe('rankTeams', () => {
  it('ranks by average XP per rep, so a small team can beat a big one', () => {
    const rows: LeagueXpRow[] = [
      // team A: 2 reps, 100 total -> avg 50
      { rep_id: 'a1', amount: 60, created_at: '2026-06-16T08:00:00Z' },
      { rep_id: 'a2', amount: 40, created_at: '2026-06-16T08:00:00Z' },
      // team B: 4 reps, 160 total -> avg 40
      { rep_id: 'b1', amount: 100, created_at: '2026-06-16T08:00:00Z' },
      { rep_id: 'b2', amount: 60, created_at: '2026-06-16T08:00:00Z' },
    ]
    const repCounts = new Map([['A', 2], ['B', 4]])
    const repByCompany = new Map([['a1', 'A'], ['a2', 'A'], ['b1', 'B'], ['b2', 'B']])
    const out = rankTeams(rows, repCounts, repByCompany, since)
    expect(out.map(t => [t.companyId, t.avgXp, t.rank])).toEqual([
      ['A', 50, 1],
      ['B', 40, 2],
    ])
  })

  it('excludes a team with zero reps (no divide-by-zero)', () => {
    const rows: LeagueXpRow[] = [{ rep_id: 'a1', amount: 30, created_at: '2026-06-16T08:00:00Z' }]
    const repCounts = new Map([['A', 1], ['Z', 0]])
    const repByCompany = new Map([['a1', 'A']])
    const out = rankTeams(rows, repCounts, repByCompany, since)
    expect(out.map(t => t.companyId)).toEqual(['A'])
  })

  it('ignores rows before the window start', () => {
    const rows: LeagueXpRow[] = [
      { rep_id: 'a1', amount: 30, created_at: '2026-06-16T08:00:00Z' },
      { rep_id: 'a1', amount: 999, created_at: '2026-06-10T08:00:00Z' }, // before since
    ]
    const repCounts = new Map([['A', 1]])
    const repByCompany = new Map([['a1', 'A']])
    const out = rankTeams(rows, repCounts, repByCompany, since)
    expect(out[0].avgXp).toBe(30)
  })

  it('a zero-XP team still appears with avg 0, ties broken by companyId', () => {
    const rows: LeagueXpRow[] = []
    const repCounts = new Map([['B', 3], ['A', 2]])
    const repByCompany = new Map<string, string>()
    const out = rankTeams(rows, repCounts, repByCompany, since)
    expect(out.map(t => [t.companyId, t.avgXp, t.rank])).toEqual([
      ['A', 0, 1],
      ['B', 0, 2],
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `leagues-core` module not found.

- [ ] **Step 3: Implement `leagues-core.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all `leagues-core` tests green (champion tests still pass too).

- [ ] **Step 5: Commit**

```bash
git add src/lib/leagues-core.ts src/lib/leagues-core.test.ts
git commit -m "feat: league avg-per-rep ranking (tested)"
```

---

### Task 3: `getLeagueBoard` + `/api/league`

**Files:**
- Create: `src/lib/leagues.ts`
- Create: `src/app/api/league/route.ts`

**Interfaces:**
- Consumes: `rankTeams`, `LeagueXpRow` from `leagues-core.ts`; `weeklySince` from `champions-core.ts`; `createAdminClient`; `createClient` from `@/lib/supabase-server`.
- Produces:
  - `interface LeagueTeam { companyId: string; name: string; avgXp: number; repCount: number; rank: number; isSelf: boolean }`
  - `interface LeagueBoard { leagueName: string; teams: LeagueTeam[]; selfRank: number | null; selfTeamId: string | null }`
  - `getLeagueBoard(userId: string): Promise<LeagueBoard | null>`
  - `GET /api/league` → `LeagueBoard | null` JSON (401 if unauthenticated).

- [ ] **Step 1: Implement `src/lib/leagues.ts`**

```ts
import { createAdminClient } from '@/lib/supabase-admin'
import { weeklySince } from '@/lib/champions-core'
import { rankTeams, type LeagueXpRow } from '@/lib/leagues-core'

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

/**
 * Weekly cross-team league board for the caller's company. Null when the team
 * is in no league, or its league has fewer than 2 member companies. Reads with
 * the service-role admin client (same pattern as champions.ts).
 */
export async function getLeagueBoard(userId: string): Promise<LeagueBoard | null> {
  const admin = createAdminClient()

  const { data: me } = await admin
    .from('profiles')
    .select('company_id')
    .eq('id', userId)
    .single()
  if (!me?.company_id) return null

  const { data: myCompany } = await admin
    .from('companies')
    .select('league_id')
    .eq('id', me.company_id)
    .single()
  if (!myCompany?.league_id) return null

  const { data: league } = await admin
    .from('leagues')
    .select('name')
    .eq('id', myCompany.league_id)
    .single()

  const { data: members } = await admin
    .from('companies')
    .select('id, name')
    .eq('league_id', myCompany.league_id)
  if (!members || members.length < 2) return null

  const memberIds = members.map(m => m.id)
  const nameByCompany = new Map(members.map(m => [m.id, m.name as string]))

  // role='rep' members of every team -> repByCompany + repCounts.
  const { data: reps } = await admin
    .from('profiles')
    .select('id, company_id')
    .in('company_id', memberIds)
    .eq('role', 'rep')

  const repByCompany = new Map<string, string>()
  const repCounts = new Map<string, number>()
  for (const id of memberIds) repCounts.set(id, 0)
  for (const r of reps ?? []) {
    repByCompany.set(r.id, r.company_id as string)
    repCounts.set(r.company_id as string, (repCounts.get(r.company_id as string) ?? 0) + 1)
  }

  const repIds = [...repByCompany.keys()]
  const since = weeklySince()
  let rows: LeagueXpRow[] = []
  if (repIds.length) {
    const { data } = await admin
      .from('xp_events')
      .select('rep_id, amount, created_at')
      .in('rep_id', repIds)
      .gte('created_at', since.toISOString())
    rows = (data ?? []) as LeagueXpRow[]
  }

  const ranked = rankTeams(rows, repCounts, repByCompany, since)
  const teams: LeagueTeam[] = ranked.map(t => ({
    companyId: t.companyId,
    name: nameByCompany.get(t.companyId) ?? 'Team',
    avgXp: t.avgXp,
    repCount: t.repCount,
    rank: t.rank,
    isSelf: t.companyId === me.company_id,
  }))

  const self = teams.find(t => t.isSelf) ?? null
  return {
    leagueName: league?.name ?? 'League',
    teams,
    selfRank: self?.rank ?? null,
    selfTeamId: me.company_id,
  }
}
```

- [ ] **Step 2: Implement the route `src/app/api/league/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getLeagueBoard } from '@/lib/leagues'

export type { LeagueTeam, LeagueBoard } from '@/lib/leagues'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await getLeagueBoard(user.id)
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/leagues.ts src/app/api/league/route.ts
git commit -m "feat: getLeagueBoard + /api/league route"
```

---

### Task 4: Rep LeagueStrip on game home

**Files:**
- Create: `src/components/game/LeagueStrip.tsx`
- Modify: `src/lib/i18n.tsx` (EN + AR dictionaries)
- Modify: `src/components/game/GameHome.tsx` (import + mount under the ChampionBanner)

**Interfaces:**
- Consumes: `GET /api/league` → `LeagueBoard | null`; `useT()`.
- Produces: `<LeagueStrip />` default export; renders nothing while loading or when the board is `null`.

- [ ] **Step 1: Add i18n keys**

In `src/lib/i18n.tsx`, add to the **English** dictionary (next to the `champion.*` block):

```ts
    'league.title': 'Team League',
    'league.yourRank': 'your team #{n} of {total}',
    'league.avgPerRep': 'Avg XP / rep',
    'league.team': 'Team',
    'league.rank': 'Rank',
```

And the **Arabic** dictionary:

```ts
    'league.title': 'دوري الفرق',
    'league.yourRank': 'فريقك #{n} من {total}',
    'league.avgPerRep': 'متوسط النقاط / مندوب',
    'league.team': 'الفريق',
    'league.rank': 'الترتيب',
```

- [ ] **Step 2: Implement `LeagueStrip.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n'
import type { LeagueBoard } from '@/lib/leagues'

export default function LeagueStrip() {
  const t = useT()
  const [board, setBoard] = useState<LeagueBoard | null>(null)
  const [open, setOpen] = useState(false)
  const gold = '#e8c060'

  useEffect(() => {
    let alive = true
    fetch('/api/league')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive) setBoard(d) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  if (!board) return null

  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', textAlign: 'start', cursor: 'pointer',
          background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 18px', color: 'var(--ink)' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>🏅 {board.leagueName}</span>
        <span style={{ fontSize: 13, color: gold, fontWeight: 800 }}>
          {board.selfRank ? t('league.yourRank', { n: board.selfRank, total: board.teams.length }) : ''}
        </span>
      </button>

      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,18,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 'min(440px,92vw)', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 16, padding: 18 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.3em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 14 }}>
              🏅 {board.leagueName}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {board.teams.map(team => (
                <div key={team.companyId}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10,
                    background: team.isSelf ? 'rgba(232,192,96,.12)' : 'transparent',
                    border: team.isSelf ? '1px solid #e8c06066' : '1px solid var(--line)' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, width: 26, color: team.rank === 1 ? '#e8c060' : 'var(--ink-dim)' }}>#{team.rank}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: team.isSelf ? 800 : 600 }}>{team.name}</span>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>{team.avgXp.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--ink-dim)', textAlign: 'center' }}>{t('league.avgPerRep')}</div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 3: Mount in GameHome**

In `src/components/game/GameHome.tsx`, add the import near the other component imports:

```ts
import LeagueStrip from './LeagueStrip'
```

Mount it directly after the existing `<ChampionBanner .../>` block (inside the same `display:flex; flex-direction:column` column):

```tsx
        <LeagueStrip />
```

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: compiles, no errors; `/api/league` appears in the route list.

- [ ] **Step 5: Manual verify (deferred until a league exists)**

After Task 1's table is populated with a league of ≥2 teams that have reps with XP this week, load the rep game home: the strip shows "🏅 {league} — your team #n of N"; tapping opens the ranked team list with the caller's team highlighted. With no league, the strip is absent. Toggle EN/AR → strings switch, RTL stays correct.

- [ ] **Step 6: Commit**

```bash
git add src/components/game/LeagueStrip.tsx src/components/game/GameHome.tsx src/lib/i18n.tsx
git commit -m "feat: rep league strip on game home"
```

---

### Task 5: Manager dashboard league panel

**Files:**
- Create: `src/components/dashboard/LeagueBoardPanel.tsx`
- Modify: `src/app/dashboard/page.tsx` (import, fetch board, render panel)

**Interfaces:**
- Consumes: `getLeagueBoard` from `@/lib/leagues`; `LeagueBoard` type.
- Produces: `<LeagueBoardPanel board={LeagueBoard} />` — a presentational table. Dashboard text is hardcoded English (consistent with the existing dashboard).

- [ ] **Step 1: Implement `LeagueBoardPanel.tsx`**

```tsx
import type { LeagueBoard } from '@/lib/leagues'

// Presentational full league table for managers. English copy to match the
// rest of the dashboard. Team name + avg score only — no cross-team rep detail.
export default function LeagueBoardPanel({ board }: { board: LeagueBoard }) {
  const gold = '#e8c060'
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--ink-dim)', marginBottom: 12 }}>{board.leagueName}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: 'var(--ink-dim)', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px' }}>Rank</th>
            <th style={{ padding: '6px 8px' }}>Team</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Avg XP / rep</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Reps</th>
          </tr>
        </thead>
        <tbody>
          {board.teams.map(team => (
            <tr key={team.companyId}
              style={{ background: team.isSelf ? 'rgba(232,192,96,.1)' : 'transparent', borderTop: '1px solid var(--line)' }}>
              <td style={{ padding: '8px', fontWeight: 800, color: team.rank === 1 ? gold : 'var(--ink)' }}>#{team.rank}</td>
              <td style={{ padding: '8px', fontWeight: team.isSelf ? 800 : 600 }}>{team.name}{team.isSelf ? ' (you)' : ''}</td>
              <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800 }}>{team.avgXp.toLocaleString()}</td>
              <td style={{ padding: '8px', textAlign: 'right', color: 'var(--ink-dim)' }}>{team.repCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Fetch + render in the dashboard**

In `src/app/dashboard/page.tsx`:

Add the imports near the other dashboard imports:

```ts
import { getLeagueBoard } from '@/lib/leagues'
import LeagueBoardPanel from '@/components/dashboard/LeagueBoardPanel'
```

After the existing `const pulse = await getTeamPulse(...)` line, add:

```ts
  const leagueBoard = await getLeagueBoard(user.id)
```

In the JSX, render a panel right after the Team Pulse panel (search for where `TeamPulsePanel` is rendered). The `Panel` wrapper already exists in this file:

```tsx
        {leagueBoard && (
          <Panel title="Team League">
            <LeagueBoardPanel board={leagueBoard} />
          </Panel>
        )}
```

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: compiles, no errors.

- [ ] **Step 4: Manual verify (deferred until a league exists)**

With a league of ≥2 teams configured, open `/dashboard` as a manager: a "Team League" panel lists every team by rank, avg XP/rep, rep count, the manager's own team highlighted with "(you)". With no league, the panel is absent.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/LeagueBoardPanel.tsx src/app/dashboard/page.tsx
git commit -m "feat: manager dashboard league panel"
```

---

## Self-Review Notes

- **Spec coverage:** schema (T1), avg-per-rep ranking + ÷0 guard + window + ties (T2 with tests), `getLeagueBoard` + `<2-team`/no-league null + route (T3), rep strip + i18n + game-home mount (T4), manager panel (T5). Weekly window reuses `weeklySince` (not reimplemented). Cross-team exposure limited to name + score + rank in both UIs.
- **No placeholders:** every step has full code/commands.
- **Type consistency:** `LeagueXpRow`, `TeamScore`, `rankTeams` (T2) match their use in T3; `LeagueTeam`/`LeagueBoard` (T3) match T4/T5; `getLeagueBoard` returns `LeagueBoard | null` everywhere.
- **Out of scope (per spec):** no admin UI, no join codes, no multi-league teams, no matchups/divisions/seasons — none added.
- **Management note:** Task 1 only creates the schema; populating a league (create row + set `companies.league_id`) is done by SQL/MCP at execution time, not by app code.
