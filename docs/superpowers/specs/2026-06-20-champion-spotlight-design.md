# Champion Spotlight — Design Spec

**Date:** 2026-06-20
**Status:** Approved design, ready for implementation plan

## Goal

Reps see the **daily** and **weekly** XP champion of their company on the
game-home screen. The weekly champion (and the manager) can share a polished
PNG card to WhatsApp. This turns the existing manager-only, download-and-share
`RecognitionCard` into an in-app social spotlight that drives engagement
("I want that card next week") and produces shareable proof outside the app.

## Why

Recognition is the lever. Current state: `RecognitionCard` exists but is
manager-only at `/dashboard/recognition` and never seen by reps inside the app.
Reps have a daily-challenge leaderboard (streak-based) but no champion
showcase. Making the champion visible on every rep's home screen adds social
proof, status, and a low-effort daily/weekly hook for competitive pharma reps.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Cadence | Daily leader chip **and** weekly champion card |
| Win metric | **XP earned in the period** (resets each period, so anyone can win — not lifetime leaders) |
| Placement | Game home, top banner (`GameHome.tsx`) |
| Visibility | Public to all teammates; champion **and** manager can share the card out to WhatsApp |
| XP timestamping | **Ledger A** — new `xp_events` table written by all XP sources |

## Architecture

### 1. XP ledger (data foundation)

**Problem this solves:** Ranking by "XP earned in a period" requires every XP
gain to carry a timestamp. Today, regular level play writes a timestamped
`sessions` row (`xp_earned`, `completed_at`), but daily-challenge XP only
increments `profiles.xp` directly via `addXp` — no event row. Summing period XP
from existing tables would miss daily XP or require duplicating the reward math.

**Solution:** A single append-only ledger every XP source writes to.

New migration `006_xp_events.sql`:

```sql
create table public.xp_events (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  source text not null,            -- 'session' | 'daily' | 'daily_streak'
  created_at timestamptz not null default now()
);
create index xp_events_rep_time on public.xp_events (rep_id, created_at);
alter table public.xp_events enable row level security;
-- Read policy: same-company reps may read each other's events (mirror the
-- policy pattern used for sessions/profiles in earlier migrations).
-- Writes go through the service-role admin client / existing client inserts
-- consistent with how sessions are written today.
```

**Write sites** (in `src/hooks/useProfile.ts`):
- `saveSession` → after inserting the `sessions` row, insert one
  `xp_events` row `{ amount: xpEarned, source: 'session' }`.
- `recordDaily` → replace/accompany the `addXp(reward)` call so the per-question
  correct XP writes `{ source: 'daily' }` and the completion streak bonus writes
  `{ source: 'daily_streak' }`. `profiles.xp` is still incremented (running
  total stays the source of truth for total XP / rank).

`profiles.xp` remains the canonical lifetime total. `xp_events` is purely the
timestamped breakdown used for period queries. They are kept consistent by
writing both in the same code paths.

### 2. `src/lib/champions.ts`

```ts
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
export async function getChampions(userId: string): Promise<Champions>
```

- Uses the service-role admin client (same pattern as `daily-leaderboard.ts`)
  to read across the caller's company without per-row RLS gymnastics.
- Resolve caller's `company_id`; gather peer `rep_id`s + names + `avatar_url`.
- Compute period boundaries in **Asia/Baghdad (UTC+3, no DST)**:
  - `dailySince` = most recent local midnight, expressed as UTC instant.
  - `weeklySince` = most recent **Monday** local midnight, as UTC instant.
- Sum `xp_events.amount` per rep where `created_at >= since`, for each window.
- Champion per window = rep with highest period XP `> 0`. Tie-break:
  **earliest `created_at` of that rep's last contributing event** (deterministic;
  rewards whoever reached the total first).
- Returns `{ daily, weekly }`, each `null` when no XP earned in that window.

### 3. `GET /api/champions`

- Authenticate caller (`supabase.auth.getUser()`), redirect/401 if none.
- Call `getChampions(user.id)`, return JSON `{ daily, weekly }`.
- Mirrors the existing `daily-leaderboard` route conventions.

### 4. `src/components/game/ChampionBanner.tsx` (client)

- Top strip on the rep's game-home screen.
- **Weekly champion:** avatar (or gold monogram) + name + "Champion of the Week"
  + period XP. Tappable.
- **Daily leader:** small inline chip — "Today's leader: {name}".
- Tap weekly → modal showing the existing `RecognitionCard` (period label
  "This Week") with a **Share to WhatsApp** button.
- Empty state: if no weekly champion yet, show a subtle "No champion yet — be
  the first this week" prompt instead of hiding entirely (keeps the slot
  aspirational). Hide the daily chip when no daily leader.
- Bilingual EN/AR via the existing `i18n` system; RTL-safe.

### 5. WhatsApp share

- Primary: **Web Share API** — `navigator.share({ files: [pngFile] })` on mobile
  (where reps live), sharing the rendered PNG directly.
- Fallback: `https://wa.me/?text=...` with a short caption when file-share is
  unavailable (desktop). The existing PNG download remains as a final fallback.
- Reuse `RecognitionCard`'s `toPng` rendering; add an optional `onShare`
  handler + share button alongside the existing download button.

### 6. Edits to `RecognitionCard.tsx`

- Accept an optional share affordance (`onShare` / share button) in addition to
  the current download button.
- Already accepts a `period` label — pass "This Week" / Arabic equivalent.
- No change to the visual card design.

### 7. Edit to `GameHome.tsx`

- Fetch `/api/champions` (client) and mount `ChampionBanner` at the top.
- Graceful when offline / no company: render nothing.

## Data flow

```
GameHome (mount)
  → GET /api/champions
    → getChampions(userId)
      → resolve company peers
      → query xp_events per Baghdad-time window (daily, weekly)
      → pick top rep per window
  → ChampionBanner renders weekly card + daily chip
    → tap weekly → RecognitionCard modal
      → Share to WhatsApp (Web Share API / wa.me fallback)
```

## Edge cases

- **No XP this period:** weekly → aspirational empty state; daily chip hidden.
- **Champion has no photo:** gold monogram (already handled by `RecognitionCard`).
- **Tie on period XP:** earliest-to-reach wins (deterministic).
- **Solo rep / no company:** no banner.
- **Timezone:** all window math in Asia/Baghdad; a session at 23:00 Baghdad
  counts for that local day, not the UTC day.
- **Backfill:** `xp_events` starts empty at migration time; period stats are
  correct from launch forward. Historical XP (pre-ledger) is intentionally not
  reconstructed — acceptable because periods are short (day/week).

## Testing

`src/lib/champions.test.ts`:
- Window boundary math across Baghdad local midnight and Monday weekly reset.
- Both `session` and `daily`/`daily_streak` events counted toward period XP.
- Tie-break determinism.
- Empty-period returns `null` for the affected window.
- Caller with no company returns `{ daily: null, weekly: null }`.

## Out of scope (YAGNI)

- Multi-category awards (Most Improved, Best Streak, Comeback) — single XP
  champion per period only.
- Opt-in privacy / anonymised wins — visibility is public per decision.
- Historical XP backfill into the ledger.
- Push notifications for new champion.
