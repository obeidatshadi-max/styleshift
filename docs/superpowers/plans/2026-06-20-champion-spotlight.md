# Champion Spotlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the daily + weekly XP champion of a rep's company on the game-home screen, with a weekly card the champion/manager can share to WhatsApp.

**Architecture:** Add an append-only `xp_events` ledger that every XP source writes to, so "XP earned in a period" is summable by timestamp. A `champions` lib computes daily/weekly winners in Baghdad time; an API route exposes them; a self-fetching `ChampionBanner` renders the spotlight on game home and reuses the existing `RecognitionCard` for the shareable PNG.

**Tech Stack:** Next.js 16, React 19, Supabase (Postgres + service-role admin client), `html-to-image`, Vitest (added in Task 1).

## Global Constraints

- Next.js 16.2.7 — read `node_modules/next/dist/docs/` before writing route/server code (per `AGENTS.md`); this is NOT the Next.js in training data.
- All XP-period window math in **Asia/Baghdad, UTC+3, no DST**.
- `profiles.xp` stays the canonical lifetime total; `xp_events` is the timestamped breakdown only — never read `xp_events` for total XP/rank.
- Cross-company reads go through the **service-role admin client** (`createAdminClient`), mirroring `src/lib/daily-leaderboard.ts`. Never widen RLS for this.
- UI copy bilingual EN/AR via `useT()` from `@/lib/i18n`; RTL-safe.
- Period XP source tags: `'session' | 'daily' | 'daily_streak'`.

---

### Task 1: Add Vitest test tooling

The repo has no test runner. The champion window math needs unit tests, so add Vitest first.

**Files:**
- Modify: `package.json` (devDependencies + `test` script)
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `npm test` runs Vitest against `src/**/*.test.ts`.

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest@^2`
Expected: vitest added to devDependencies, no error.

- [ ] **Step 2: Add the test script**

In `package.json` `scripts`, add:

```json
"test": "vitest run"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
})
```

- [ ] **Step 4: Sanity-check the runner**

Run: `npm test`
Expected: exits 0 with "No test files found" (no tests yet) — confirms Vitest runs.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest test runner"
```

---

### Task 2: Add the `xp_events` ledger migration

**Files:**
- Create: `supabase/migrations/006_xp_events.sql`

**Interfaces:**
- Produces: table `public.xp_events (id, rep_id, amount, source, created_at)` with index on `(rep_id, created_at)` and RLS allowing a rep to insert their own events and same-company reps to read each other's.

- [ ] **Step 1: Write the migration**

Match the RLS style of earlier migrations (same-company visibility, self-insert). Create `supabase/migrations/006_xp_events.sql`:

```sql
-- Timestamped XP ledger. profiles.xp remains the canonical lifetime total;
-- this table records each gain so period (daily/weekly) XP is summable.
create table public.xp_events (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  source text not null,                 -- 'session' | 'daily' | 'daily_streak'
  created_at timestamptz not null default now()
);

create index xp_events_rep_time on public.xp_events (rep_id, created_at);

alter table public.xp_events enable row level security;

-- A rep may insert only their own events.
create policy "xp_events insert own"
  on public.xp_events for insert
  with check (rep_id = auth.uid());

-- Same-company reps may read each other's events (mirrors sessions visibility).
create policy "xp_events read same company"
  on public.xp_events for select
  using (
    rep_id in (
      select p.id from public.profiles p
      where p.company_id = (
        select company_id from public.profiles where id = auth.uid()
      )
    )
  );
```

- [ ] **Step 2: Apply the migration**

Apply via the project's normal flow (Supabase dashboard SQL editor or `supabase db push`, matching how 001–005 were applied).
Expected: `xp_events` table exists; `select * from xp_events limit 1;` returns 0 rows, no error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/006_xp_events.sql
git commit -m "feat: xp_events ledger migration"
```

---

### Task 3: Write to the ledger on every XP gain

`profiles.xp` is bumped in two places in `src/hooks/useProfile.ts`: `saveSession` (game level) and `recordDaily` (daily challenge, via `addXp`). Both must also append `xp_events` rows.

**Files:**
- Modify: `src/hooks/useProfile.ts` (`saveSession` ~lines 91-100; `recordDaily` ~lines 106-125)

**Interfaces:**
- Consumes: `supabase` browser client already in the hook; `profile.id`.
- Produces: one `xp_events` row per XP gain — `source:'session'` for game levels, `source:'daily'` for per-question correct XP, `source:'daily_streak'` for the completion bonus.

- [ ] **Step 1: Log session XP**

In `saveSession`, after the existing `sessions` insert (and only when `xpEarned > 0`), append:

```ts
    if (xpEarned > 0) {
      await supabase.from('xp_events').insert({
        rep_id: profile.id, amount: xpEarned, source: 'session',
      })
    }
```

- [ ] **Step 2: Log daily XP, split base vs streak bonus**

In `recordDaily`, replace the single `await addXp(reward)` tail so the ledger distinguishes the per-question correct XP from the completion bonus. Change the reward block (currently lines ~116-124) to:

```ts
    const base = correct ? XP_VALUES.correct : 0
    const { count } = await supabase
      .from('daily_challenges')
      .select('id', { count: 'exact', head: true })
      .eq('rep_id', profile.id)
      .eq('challenge_date', today)
    const bonus = count === DAILY_TOTAL ? XP_VALUES.dailyStreak : 0

    if (base > 0) {
      await supabase.from('xp_events').insert({
        rep_id: profile.id, amount: base, source: 'daily',
      })
    }
    if (bonus > 0) {
      await supabase.from('xp_events').insert({
        rep_id: profile.id, amount: bonus, source: 'daily_streak',
      })
    }
    await addXp(base + bonus)
    return true
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verify**

Run `npm run dev`, play one game level and one daily-challenge question as a rep, then in Supabase check `select source, amount from xp_events order by created_at desc limit 5;`.
Expected: a `session` row after the level; `daily` (and `daily_streak` once the day's set completes) rows after the daily challenge.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useProfile.ts
git commit -m "feat: write xp_events on game and daily XP gains"
```

---

### Task 4: Champion window math (pure, tested)

Pure helpers with no DB dependency, so they're unit-testable. This is the correctness core: Baghdad-time period boundaries and deterministic winner selection.

**Files:**
- Create: `src/lib/champions-core.ts`
- Test: `src/lib/champions-core.test.ts`

**Interfaces:**
- Produces:
  - `dailySince(now?: Date): Date` — UTC instant of the most recent Baghdad local midnight.
  - `weeklySince(now?: Date): Date` — UTC instant of the most recent Baghdad-local Monday 00:00.
  - `interface XpRow { rep_id: string; amount: number; created_at: string }`
  - `pickChampion(rows: XpRow[], since: Date): { id: string; periodXp: number } | null` — top rep by summed `amount` at/after `since`; ties broken by earliest last-contributing-event time; `null` if no positive total.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { dailySince, weeklySince, pickChampion, type XpRow } from './champions-core'

describe('dailySince', () => {
  it('rolls to Baghdad local midnight (UTC+3)', () => {
    // 2026-06-20T23:30:00Z == 2026-06-21T02:30 Baghdad -> since = 2026-06-20T21:00Z
    const since = dailySince(new Date('2026-06-20T23:30:00Z'))
    expect(since.toISOString()).toBe('2026-06-20T21:00:00.000Z')
  })
  it('a pre-midnight-UTC instant still maps to the correct Baghdad day', () => {
    // 2026-06-20T00:30:00Z == 2026-06-20T03:30 Baghdad -> since = 2026-06-19T21:00Z
    const since = dailySince(new Date('2026-06-20T00:30:00Z'))
    expect(since.toISOString()).toBe('2026-06-19T21:00:00.000Z')
  })
})

describe('weeklySince', () => {
  it('rolls back to Baghdad-local Monday 00:00', () => {
    // 2026-06-20 is a Saturday. Monday of that week = 2026-06-15.
    // Baghdad Monday 00:00 = 2026-06-14T21:00Z.
    const since = weeklySince(new Date('2026-06-20T10:00:00Z'))
    expect(since.toISOString()).toBe('2026-06-14T21:00:00.000Z')
  })
})

describe('pickChampion', () => {
  const since = new Date('2026-06-20T21:00:00.000Z')
  it('returns null when no rows in window', () => {
    const rows: XpRow[] = [{ rep_id: 'a', amount: 50, created_at: '2026-06-20T10:00:00Z' }]
    expect(pickChampion(rows, since)).toBeNull()
  })
  it('sums only in-window amounts and picks the highest', () => {
    const rows: XpRow[] = [
      { rep_id: 'a', amount: 30, created_at: '2026-06-20T22:00:00Z' },
      { rep_id: 'a', amount: 20, created_at: '2026-06-20T23:00:00Z' },
      { rep_id: 'b', amount: 40, created_at: '2026-06-20T22:30:00Z' },
      { rep_id: 'b', amount: 10, created_at: '2026-06-20T10:00:00Z' }, // before since, ignored
    ]
    expect(pickChampion(rows, since)).toEqual({ id: 'a', periodXp: 50 })
  })
  it('breaks ties by earliest last-contributing event', () => {
    const rows: XpRow[] = [
      { rep_id: 'a', amount: 50, created_at: '2026-06-20T23:00:00Z' },
      { rep_id: 'b', amount: 50, created_at: '2026-06-20T22:00:00Z' }, // reached 50 earlier
    ]
    expect(pickChampion(rows, since)).toEqual({ id: 'b', periodXp: 50 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `champions-core` module not found / exports undefined.

- [ ] **Step 3: Implement `champions-core.ts`**

```ts
// Asia/Baghdad is UTC+3 with no daylight saving — a fixed offset is correct.
const BAGHDAD_OFFSET_MS = 3 * 60 * 60 * 1000

/** UTC instant of the most recent Baghdad-local midnight. */
export function dailySince(now: Date = new Date()): Date {
  const local = new Date(now.getTime() + BAGHDAD_OFFSET_MS)
  local.setUTCHours(0, 0, 0, 0)
  return new Date(local.getTime() - BAGHDAD_OFFSET_MS)
}

/** UTC instant of the most recent Baghdad-local Monday 00:00. */
export function weeklySince(now: Date = new Date()): Date {
  const local = new Date(now.getTime() + BAGHDAD_OFFSET_MS)
  const daysSinceMonday = (local.getUTCDay() + 6) % 7 // Sun=0 -> 6, Mon=1 -> 0
  local.setUTCHours(0, 0, 0, 0)
  local.setUTCDate(local.getUTCDate() - daysSinceMonday)
  return new Date(local.getTime() - BAGHDAD_OFFSET_MS)
}

export interface XpRow {
  rep_id: string
  amount: number
  created_at: string
}

/**
 * Top rep by summed XP at/after `since`. Ties broken by the earliest
 * last-contributing-event time (whoever reached the total first). Returns null
 * when no rep has a positive in-window total.
 */
export function pickChampion(rows: XpRow[], since: Date): { id: string; periodXp: number } | null {
  const sinceMs = since.getTime()
  const totals = new Map<string, { xp: number; last: number }>()
  for (const r of rows) {
    const t = new Date(r.created_at).getTime()
    if (t < sinceMs) continue
    const cur = totals.get(r.rep_id) ?? { xp: 0, last: 0 }
    cur.xp += r.amount
    cur.last = Math.max(cur.last, t)
    totals.set(r.rep_id, cur)
  }
  let best: { id: string; periodXp: number; last: number } | null = null
  for (const [id, v] of totals) {
    if (v.xp <= 0) continue
    if (!best || v.xp > best.periodXp || (v.xp === best.periodXp && v.last < best.last)) {
      best = { id, periodXp: v.xp, last: v.last }
    }
  }
  return best ? { id: best.id, periodXp: best.periodXp } : null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/champions-core.ts src/lib/champions-core.test.ts
git commit -m "feat: champion window math + tie-break (tested)"
```

---

### Task 5: `getChampions` data function + API route

Reads the ledger across the caller's company, applies the pure helpers, hydrates names/avatars.

**Files:**
- Create: `src/lib/champions.ts`
- Create: `src/app/api/champions/route.ts`

**Interfaces:**
- Consumes: `dailySince`, `weeklySince`, `pickChampion`, `XpRow` from `champions-core.ts`; `createAdminClient` from `@/lib/supabase-admin`; `createClient` from `@/lib/supabase-server`.
- Produces:
  - `interface Champion { id: string; name: string; avatarUrl: string | null; periodXp: number }`
  - `interface Champions { daily: Champion | null; weekly: Champion | null }`
  - `getChampions(userId: string): Promise<Champions>`
  - `GET /api/champions` → `Champions` JSON (401 if unauthenticated).

- [ ] **Step 1: Implement `src/lib/champions.ts`**

```ts
import { createAdminClient } from '@/lib/supabase-admin'
import { dailySince, weeklySince, pickChampion, type XpRow } from '@/lib/champions-core'

export interface Champion {
  id: string
  name: string
  avatarUrl: string | null
  periodXp: number
}
export interface Champions {
  daily: Champion | null
  weekly: Champion | null
}

/**
 * Daily + weekly XP champions for the caller's company. Reads the xp_events
 * ledger with the service-role admin client (same pattern as
 * daily-leaderboard.ts) so no cross-company RLS policy is exercised here.
 */
export async function getChampions(userId: string): Promise<Champions> {
  const admin = createAdminClient()

  const { data: me } = await admin
    .from('profiles')
    .select('company_id')
    .eq('id', userId)
    .single()

  // Peers = same company; otherwise just the caller (solo rep -> no banner).
  let peers: { id: string; display_name: string | null; avatar_url: string | null }[] = []
  if (me?.company_id) {
    const { data } = await admin
      .from('profiles')
      .select('id, display_name, avatar_url')
      .eq('company_id', me.company_id)
    peers = data ?? []
  }
  if (!peers.length) return { daily: null, weekly: null }

  const repIds = peers.map(p => p.id)
  const meta = new Map(peers.map(p => [p.id, p]))

  // One ledger read covering the widest window (weekly), then slice per period.
  const weekSince = weeklySince()
  const daySince = dailySince()
  const { data: rows } = await admin
    .from('xp_events')
    .select('rep_id, amount, created_at')
    .in('rep_id', repIds)
    .gte('created_at', weekSince.toISOString())

  const xpRows: XpRow[] = (rows ?? []) as XpRow[]

  const hydrate = (picked: { id: string; periodXp: number } | null): Champion | null => {
    if (!picked) return null
    const p = meta.get(picked.id)
    return {
      id: picked.id,
      name: p?.display_name ?? 'Rep',
      avatarUrl: p?.avatar_url ?? null,
      periodXp: picked.periodXp,
    }
  }

  return {
    daily: hydrate(pickChampion(xpRows, daySince)),
    weekly: hydrate(pickChampion(xpRows, weekSince)),
  }
}
```

- [ ] **Step 2: Implement the route `src/app/api/champions/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getChampions } from '@/lib/champions'

export type { Champion, Champions } from '@/lib/champions'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await getChampions(user.id)
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verify**

With `npm run dev` and a logged-in rep who has earned XP this week, fetch the route in the browser console:

```js
fetch('/api/champions').then(r => r.json()).then(console.log)
```

Expected: `{ daily: {...}|null, weekly: {...}|null }` with the top rep's name and `periodXp`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/champions.ts src/app/api/champions/route.ts
git commit -m "feat: getChampions + /api/champions route"
```

---

### Task 6: RecognitionCard share affordance + i18n strings

Add an optional WhatsApp-share button to the existing card and the bilingual copy the banner/card need. The card's visual design is unchanged.

**Files:**
- Modify: `src/components/dashboard/RecognitionCard.tsx`
- Modify: `src/lib/i18n.tsx` (EN + AR dictionaries)

**Interfaces:**
- Produces:
  - `RecognitionCard` gains optional prop `onShare?: () => void`; when provided, a "Share to WhatsApp" button renders next to the existing download button.
  - i18n keys: `champion.weekly` ("Champion of the Week"), `champion.today` ("Today's leader: {name}"), `champion.empty` ("No champion yet — be the first this week"), `champion.share` ("Share to WhatsApp"), `champion.thisWeek` ("This Week").

- [ ] **Step 1: Add the share button to RecognitionCard**

Extend `Props` and render a second button. Change the `Props` interface to add:

```ts
  onShare?: () => void
  shareLabel?: string
```

Then after the existing download `<button>` (around line 85), add:

```tsx
      {onShare && (
        <button onClick={onShare} className="no-print"
          style={{ cursor: 'pointer', background: 'transparent', color: gold, border: `1px solid ${gold}`, borderRadius: 10, padding: '12px 22px', fontSize: 14, fontWeight: 700, letterSpacing: '.04em' }}>
          {shareLabel ?? 'Share to WhatsApp'}
        </button>
      )}
```

Wrap the two buttons in a flex row so they sit side by side:

```tsx
      <div className="no-print" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* existing download button */}
        {/* new share button */}
      </div>
```

- [ ] **Step 2: Add the i18n keys**

In `src/lib/i18n.tsx`, add to the **English** dictionary:

```ts
    'champion.weekly': 'Champion of the Week',
    'champion.today': "Today's leader: {name}",
    'champion.empty': 'No champion yet — be the first this week',
    'champion.share': 'Share to WhatsApp',
    'champion.thisWeek': 'This Week',
```

And the **Arabic** dictionary (RTL):

```ts
    'champion.weekly': 'بطل الأسبوع',
    'champion.today': 'متصدّر اليوم: {name}',
    'champion.empty': 'لا يوجد بطل بعد — كن أول أبطال هذا الأسبوع',
    'champion.share': 'شارك عبر واتساب',
    'champion.thisWeek': 'هذا الأسبوع',
```

Match the exact key/quoting style already used in the file (interpolation uses `{name}` per the existing `t('assign.due', { date })` pattern).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/RecognitionCard.tsx src/lib/i18n.tsx
git commit -m "feat: shareable RecognitionCard + champion i18n strings"
```

---

### Task 7: ChampionBanner on game home

Self-fetching client component (mirrors how other client panels load their own data) mounted at the top of `GameHome`. Shows the weekly champion + a daily-leader chip; tapping the weekly champion opens the shareable card in a modal.

**Files:**
- Create: `src/components/game/ChampionBanner.tsx`
- Modify: `src/components/game/GameHome.tsx` (import + mount near the top of the returned JSX, after the eyebrow/tagline header block)

**Interfaces:**
- Consumes: `GET /api/champions` → `Champions`; `RecognitionCard` with `onShare`; `useT` from `@/lib/i18n`.
- Produces: `<ChampionBanner companyName={string} period={string} />` default export; renders nothing while loading or when there is no weekly champion data and no company.

- [ ] **Step 1: Implement `ChampionBanner.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n'
import RecognitionCard from '@/components/dashboard/RecognitionCard'
import type { Champions } from '@/lib/champions'

interface Props {
  companyName: string
  period: string // e.g. "June 2026", passed through to the card footer
}

export default function ChampionBanner({ companyName, period }: Props) {
  const t = useT()
  const [data, setData] = useState<Champions | null>(null)
  const [open, setOpen] = useState(false)
  const gold = '#e8c060'

  useEffect(() => {
    let alive = true
    fetch('/api/champions')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive) setData(d) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const weekly = data?.weekly ?? null
  const daily = data?.daily ?? null
  const initial = (weekly?.name?.trim()?.[0] || '★').toUpperCase()

  // Share the rendered card PNG via Web Share API; fall back to a wa.me text link.
  async function share() {
    const node = document.getElementById('champion-card-capture')
    const caption = `${weekly?.name} — ${t('champion.weekly')} · ${companyName}`
    try {
      if (node) {
        const { toPng } = await import('html-to-image')
        const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true })
        const blob = await (await fetch(dataUrl)).blob()
        const file = new File([blob], 'styleshift-champion.png', { type: 'image/png' })
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], text: caption })
          return
        }
      }
    } catch { /* fall through to text share */ }
    window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, '_blank')
  }

  if (!weekly) {
    // Aspirational empty slot only once data has loaded (avoid flash on load).
    if (!data) return null
    return (
      <div style={{ border: `1px solid ${gold}44`, borderRadius: 14, padding: '14px 18px', textAlign: 'center', color: 'var(--ink-dim)', fontSize: 13, marginBottom: 16 }}>
        🏆 {t('champion.empty')}
      </div>
    )
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'start', cursor: 'pointer',
          background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: `1px solid ${gold}66`, borderRadius: 16, padding: '14px 18px', marginBottom: 16, color: 'var(--ink)' }}>
        <span style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', border: `2px solid ${gold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a1430', flex: '0 0 auto' }}>
          {weekly.avatarUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={weekly.avatarUrl} alt={weekly.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ color: gold, fontWeight: 800, fontSize: 22 }}>{initial}</span>}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: gold, fontWeight: 700 }}>🏆 {t('champion.weekly')}</span>
          <span style={{ display: 'block', fontSize: 17, fontWeight: 800 }}>{weekly.name}</span>
          {daily && <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-dim)', marginTop: 2 }}>{t('champion.today', { name: daily.name })}</span>}
        </span>
        <span style={{ fontSize: 18, fontWeight: 800, color: gold }}>{weekly.periodXp.toLocaleString()}</span>
      </button>

      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,18,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} id="champion-card-capture">
            <RecognitionCard
              name={weekly.name}
              avatarUrl={weekly.avatarUrl}
              xp={weekly.periodXp}
              rankTitle={t('champion.weekly')}
              companyName={companyName}
              period={`${t('champion.thisWeek')} · ${period}`}
              onShare={share}
              shareLabel={t('champion.share')}
            />
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Mount it in GameHome**

In `src/components/game/GameHome.tsx`, add the import at the top with the other component imports:

```ts
import ChampionBanner from './ChampionBanner'
```

`GameHome` already has `displayName` and `xp` props; pass a company label and period. Use the existing `t('eyebrow')` header region — mount the banner right after that header block in the returned JSX:

```tsx
        <ChampionBanner
          companyName={t('appName')}
          period={new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
        />
```

If no `appName` key exists, reuse the existing brand/eyebrow string already rendered in the header rather than adding a new key.

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: compiles with no errors.

- [ ] **Step 4: Manual verify**

`npm run dev`, log in as a rep with company peers who have earned XP this week:
- Banner shows weekly champion (name + period XP) and "Today's leader" chip.
- Tapping opens the card modal; "Share to WhatsApp" triggers the share sheet (mobile) or opens a `wa.me` link (desktop).
- A brand-new company with no XP this week shows the "No champion yet" empty state.
- Toggle language → strings switch EN/AR and layout stays RTL-safe.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/ChampionBanner.tsx src/components/game/GameHome.tsx
git commit -m "feat: champion spotlight banner on game home"
```

---

## Self-Review Notes

- **Spec coverage:** xp_events ledger (T2), all-source writes (T3), Baghdad windows + tie-break (T4), getChampions + route (T5), shareable card + i18n (T6), banner + game-home mount + WhatsApp share + empty state (T7). Testing requirement met by T4 unit tests. Vitest tooling gap closed by T1.
- **Out of scope (per spec):** no multi-category awards, no opt-in privacy, no historical backfill, no push notifications — none added.
- **Type consistency:** `XpRow`, `Champion`, `Champions`, `pickChampion`, `dailySince`, `weeklySince`, `getChampions` names match across T4/T5/T7. `onShare`/`shareLabel` props match between T6 (definition) and T7 (use).
