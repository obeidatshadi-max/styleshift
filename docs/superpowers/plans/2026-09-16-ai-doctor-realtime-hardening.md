# AI Doctor Live Voice — Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the real gaps between the existing turn-based "AI Doctor" system (already ported to realtime voice on `feat/ai-voice-partner-realtime`) and the mega-spec's requirements — behavioral event capture, evidence-grounded conversational-balance reporting, and a Replay-This-Moment retry loop — without rebuilding anything that already works.

**Architecture:** The realtime voice pipeline (Pipecat Cloud + Daily transport + Deepgram STT + ElevenLabs TTS, `pipecat-bot/bot.py`) already POSTs every rep/doctor exchange to the existing `/api/voice-partner/turn` route, which persists to `conversation_turns` and drives the same deterministic evaluator (`session-evaluator.ts`, `pressure-shift.ts`) as the text-based path. This plan adds: (1) real per-turn speech timing captured from Pipecat's VAD/transport frames, persisted as two nullable columns, feeding the SAME `roleplay-core.ts` talk-ratio/interruption functions already proven on the human-colleague path; (2) a `RealtimeSignals` block folded into the evaluator's existing evidence-grounded report; (3) a Replay-This-Moment flow that reuses the existing `pipecat-session` start route, seeded from a detected `PressureMoment`; (4) the required docs and `.env.example`.

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Supabase (Postgres + RLS) / Vitest / Python 3.11 / pipecat-ai==1.10.0 (Daily, Deepgram, ElevenLabs extras).

**Spec:** User's full mega-prompt (live AI Doctor role-play spec, pasted 2026-09-16) — scope narrowed per two in-session decisions: (a) keep Pipecat Cloud + Daily + Deepgram + ElevenLabs, do NOT rewrite to LiveKit/OpenAI Realtime; (b) this session's focus is event capture + docs + replay, not a from-scratch rebuild (most of persona engine / social styles / evaluator / critical-moment engine already ships in migrations 026-029).

## Global Constraints

- Never touch `pipecat-ai` version pin (`==1.10.0` in `pipecat-bot/pyproject.toml`) — all frame class names below are verified against that exact tagged source.
- `conversation_turns` timing columns are nullable and additive only — every existing text-based-path row and every existing query keeps working unchanged.
- No new external vendor/dependency. `SileroVADAnalyzer` ships in the `silero` extra which is empty (`silero = []` in pipecat-ai's own `pyproject.toml`) — no new pip install beyond what's already pinned.
- Read `node_modules/next/dist/docs/` before touching any Next.js route/component (per this repo's `AGENTS.md` — Next 16 has breaking API changes vs. training data).
- Follow existing "server computes numbers, model only interprets" split (`session-evaluator.ts`'s header comment) — never let an LLM invent a timing/count number that a deterministic function already produces.
- Run all commands from `.worktrees/ai-voice-partner-realtime` (this worktree) unless a task says otherwise; the git stash stack is shared across worktrees — never use bare `git stash`.

---

## Task 1: Persist real per-turn speech timing

**Files:**
- Create: `supabase/migrations/030_ai_doctor_realtime_timing.sql`
- Modify: `src/types/game.ts` (`ConversationTurn` interface, ~line 131-146)
- Modify: `src/app/api/voice-partner/turn/route.ts` (insert block, ~line 155-166)
- Create: `src/app/api/voice-partner/turn-timing/route.ts`
- Create: `src/lib/voice-partner-timing.ts`
- Test: `src/lib/voice-partner-timing.test.ts`

**Interfaces:**
- Consumes: `Turn`, `computeTalkRatio`, `computeRapidTurnSwitches` from `src/lib/roleplay-core.ts` (already exist, unchanged); `ConversationTurn` from `src/types/game.ts`; `authenticateVoicePartnerRequest` from `src/lib/voice-partner-auth.ts` (existing, same pattern as `turn/route.ts:54`).
- Produces: `RealtimeSignals` type and `computeRealtimeSignals(turns: ConversationTurn[]): RealtimeSignals | null`, consumed by Task 2 (session-evaluator) and exported from `src/lib/voice-partner-timing.ts`.

- [ ] **Step 1: Migration — add nullable timing columns**

```sql
-- AI Doctor realtime hardening: real per-turn speech timing, captured only
-- by the realtime voice path (bot.py). The text-based path never populates
-- these — every existing row and query keeps working with them null.
-- See docs/superpowers/plans/2026-09-16-ai-doctor-realtime-hardening.md.
alter table public.conversation_turns
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz;
```

- [ ] **Step 2: Apply the migration locally and verify**

Run: `supabase migration up` (or the project's existing migration-apply command — check `package.json`/`README.md` for the exact one used elsewhere in this repo before assuming `supabase db push`).
Expected: migration applies with no error; `select started_at, ended_at from conversation_turns limit 1;` returns the new columns as null for existing rows.

- [ ] **Step 3: Extend `ConversationTurn` type**

Edit `src/types/game.ts`, inside the `ConversationTurn` interface (currently ends `time_pressure: number | null` then `created_at: string`):

```typescript
export interface ConversationTurn {
  id: string
  session_id: string
  rep_id: string
  doctor_id: string | null
  turn_index: number
  role: 'doctor' | 'rep'
  text: string
  objection_type: string | null
  clear_steps_hit: string[]
  trust: number | null
  skepticism: number | null
  engagement: number | null
  time_pressure: number | null
  // Realtime-path only (migration 030) — null for every text-based-path
  // turn. ISO timestamps from the actual speech start/stop, not turn_index.
  started_at: string | null
  ended_at: string | null
  created_at: string
}
```

- [ ] **Step 4: Write the failing test for `computeRealtimeSignals`**

Create `src/lib/voice-partner-timing.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeRealtimeSignals, hasTimingData } from './voice-partner-timing'
import type { ConversationTurn } from '@/types/game'

function turn(overrides: Partial<ConversationTurn>): ConversationTurn {
  return {
    id: 't1', session_id: 's1', rep_id: 'r1', doctor_id: 'd1', turn_index: 0,
    role: 'doctor', text: 'It costs too much.', objection_type: null, clear_steps_hit: [],
    trust: 50, skepticism: 50, engagement: 50, time_pressure: 30,
    started_at: null, ended_at: null, created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('hasTimingData', () => {
  it('is false when no turn carries both timestamps', () => {
    expect(hasTimingData([turn({})])).toBe(false)
  })

  it('is true when at least one turn carries both timestamps', () => {
    expect(hasTimingData([
      turn({}),
      turn({ turn_index: 1, role: 'rep', started_at: '2026-01-01T00:00:00.000Z', ended_at: '2026-01-01T00:00:02.000Z' }),
    ])).toBe(true)
  })
})

describe('computeRealtimeSignals', () => {
  it('returns null when no turn has timing data', () => {
    expect(computeRealtimeSignals([turn({})])).toBeNull()
  })

  it('computes talk ratio, rapid turn switches, and avg response latency from real timestamps', () => {
    const turns = [
      turn({
        turn_index: 0, role: 'doctor', text: 'Doctor opens.',
        started_at: '2026-01-01T00:00:00.000Z', ended_at: '2026-01-01T00:00:02.000Z',
      }),
      turn({
        turn_index: 1, role: 'rep', text: 'Rep replies for four seconds.',
        started_at: '2026-01-01T00:00:03.000Z', ended_at: '2026-01-01T00:00:07.000Z',
      }),
      turn({
        turn_index: 2, role: 'doctor', text: 'Doctor replies for one second.',
        started_at: '2026-01-01T00:00:07.200Z', ended_at: '2026-01-01T00:00:08.200Z',
      }),
    ]
    const signals = computeRealtimeSignals(turns)
    expect(signals).not.toBeNull()
    expect(signals!.talkRatio.repMs).toBe(4000)
    expect(signals!.talkRatio.partnerMs).toBe(3000)
    expect(signals!.interruptionCount).toBe(0)
    // Doctor turn 2 starts 200ms after rep turn 1 ends — a fast back-and-forth,
    // not a true interruption (turn 1 already ended before turn 2 started).
    expect(signals!.avgResponseLatencyMs).toBe(200)
  })

  it('counts a rapid speaker switch as an interruption proxy', () => {
    const turns = [
      turn({
        turn_index: 0, role: 'doctor',
        started_at: '2026-01-01T00:00:00.000Z', ended_at: '2026-01-01T00:00:03.000Z',
      }),
      turn({
        // Rep starts 100ms BEFORE the doctor's turn ends — a genuine overlap/cut-off.
        turn_index: 1, role: 'rep',
        started_at: '2026-01-01T00:00:02.900Z', ended_at: '2026-01-01T00:00:05.000Z',
      }),
    ]
    const signals = computeRealtimeSignals(turns)
    expect(signals!.interruptionCount).toBe(1)
  })

  it('skips turns missing either timestamp rather than treating them as zero-duration', () => {
    const turns = [
      turn({ turn_index: 0, role: 'doctor', started_at: '2026-01-01T00:00:00.000Z', ended_at: '2026-01-01T00:00:02.000Z' }),
      turn({ turn_index: 1, role: 'rep', started_at: null, ended_at: null }), // text-based-path fallback turn mixed in
      turn({ turn_index: 2, role: 'doctor', started_at: '2026-01-01T00:00:05.000Z', ended_at: '2026-01-01T00:00:06.000Z' }),
    ]
    const signals = computeRealtimeSignals(turns)
    expect(signals!.talkRatio.totalMs).toBe(3000) // only the two doctor turns with real timing
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run src/lib/voice-partner-timing.test.ts`
Expected: FAIL — `Cannot find module './voice-partner-timing'`.

- [ ] **Step 6: Implement `src/lib/voice-partner-timing.ts`**

```typescript
import type { ConversationTurn } from '@/types/game'
import { computeTalkRatio, computeRapidTurnSwitches, type Turn, type TalkRatio } from '@/lib/roleplay-core'

// Phase 5 (realtime hardening) — real per-turn speech timing, populated only
// by the Pipecat realtime bot (migration 030). Reuses roleplay-core.ts's
// proven talk-ratio/interruption-proxy math verbatim instead of
// reimplementing it — same "server computes, model only interprets" split as
// session-evaluator.ts and pressure-shift.ts.

export interface RealtimeSignals {
  talkRatio: TalkRatio
  interruptionCount: number
  /** Avg gap (ms) between a rep turn ending and the next doctor turn
   * starting, across all such pairs — 0 or negative gaps (true overlap) are
   * included as 0, never negative, since "the doctor started before the rep
   * finished" is an interruption, not negative latency. */
  avgResponseLatencyMs: number
}

/** True when at least one turn carries a complete {started_at, ended_at}
 * pair — the realtime path's presence signal. A mixed session (some turns
 * timed, some not, e.g. a reconnect) still computes signals from whichever
 * turns have real timing; turns missing either timestamp are excluded, never
 * treated as zero-duration. */
export function hasTimingData(turns: ConversationTurn[]): boolean {
  return turns.some(t => t.started_at != null && t.ended_at != null)
}

function toTimedTurn(t: ConversationTurn): Turn | null {
  if (t.started_at == null || t.ended_at == null) return null
  const start = Date.parse(t.started_at)
  const end = Date.parse(t.ended_at)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return { speaker: t.role, text: t.text, start, end, durationMs: end - start }
}

function computeAvgResponseLatency(turns: Turn[]): number {
  const sorted = [...turns].sort((a, b) => a.start - b.start)
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].speaker === 'doctor' && sorted[i - 1].speaker === 'rep') {
      gaps.push(Math.max(0, sorted[i].start - sorted[i - 1].end))
    }
  }
  return gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0
}

/** Builds RealtimeSignals from whichever turns carry real timing. Returns
 * null when no turn has timing (text-based-path session, or a realtime
 * session whose timing capture failed silently — never fabricates zeros in
 * either case, matching pressure-shift.ts's "report not applicable rather
 * than compare against a fabricated baseline" rule). */
export function computeRealtimeSignals(turns: ConversationTurn[]): RealtimeSignals | null {
  if (!hasTimingData(turns)) return null
  const timed = turns.map(toTimedTurn).filter((t): t is Turn => t !== null)
  if (timed.length < 2) return null
  const sorted = [...timed].sort((a, b) => a.start - b.start)
  return {
    talkRatio: computeTalkRatio(sorted, 'rep'),
    interruptionCount: computeRapidTurnSwitches(sorted, 0), // strict overlap only: next turn starts before the previous one ends
    avgResponseLatencyMs: computeAvgResponseLatency(sorted),
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run src/lib/voice-partner-timing.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Extend `turn/route.ts`'s insert to accept and persist rep timing**

The rep's own speech start/end IS known before this route runs (bot.py captures it from VAD before POSTing — see Task 3). The doctor turn's timing is NOT known yet at this point (TTS hasn't played) — it's patched in later by Task 1 Step 9's route. Edit `src/app/api/voice-partner/turn/route.ts`:

After the existing `const repTextInput = ...` block (~line 71), add:

```typescript
  const repStartedAtRaw = form.get('repStartedAt')
  const repEndedAtRaw = form.get('repEndedAt')
  const repStartedAt = typeof repStartedAtRaw === 'string' && !Number.isNaN(Date.parse(repStartedAtRaw)) ? repStartedAtRaw : null
  const repEndedAt = typeof repEndedAtRaw === 'string' && !Number.isNaN(Date.parse(repEndedAtRaw)) ? repEndedAtRaw : null
```

Then change the insert block (~line 155-166) from:

```typescript
  const { error: turnInsertError } = await supabase.from('conversation_turns').insert([
    {
      session_id: sessionId, rep_id: user.id, doctor_id: doctorId, turn_index: baseIndex,
      role: 'rep', text: repText, objection_type: objectionTypeRaw, clear_steps_hit: judged.clearSteps,
      trust: nextState.trust, skepticism: nextState.skepticism, engagement: nextState.engagement, time_pressure: nextState.timePressure,
    },
    {
      session_id: sessionId, rep_id: user.id, doctor_id: doctorId, turn_index: baseIndex + 1,
      role: 'doctor', text: judged.doctorReply, objection_type: objectionTypeRaw, clear_steps_hit: [],
      trust: nextState.trust, skepticism: nextState.skepticism, engagement: nextState.engagement, time_pressure: nextState.timePressure,
    },
  ])
```

to:

```typescript
  const { error: turnInsertError } = await supabase.from('conversation_turns').insert([
    {
      session_id: sessionId, rep_id: user.id, doctor_id: doctorId, turn_index: baseIndex,
      role: 'rep', text: repText, objection_type: objectionTypeRaw, clear_steps_hit: judged.clearSteps,
      trust: nextState.trust, skepticism: nextState.skepticism, engagement: nextState.engagement, time_pressure: nextState.timePressure,
      started_at: repStartedAt, ended_at: repEndedAt,
    },
    {
      session_id: sessionId, rep_id: user.id, doctor_id: doctorId, turn_index: baseIndex + 1,
      role: 'doctor', text: judged.doctorReply, objection_type: objectionTypeRaw, clear_steps_hit: [],
      trust: nextState.trust, skepticism: nextState.skepticism, engagement: nextState.engagement, time_pressure: nextState.timePressure,
      started_at: null, ended_at: null, // patched by /api/voice-partner/turn-timing once TTS finishes playing
    },
  ])
```

- [ ] **Step 9: Write `turn-timing/route.ts`**

Small, best-effort, fire-and-forget PATCH-equivalent (POST, matching this codebase's route convention) that bot.py calls once it knows the doctor line finished playing. Reuses `authenticateVoicePartnerRequest` exactly like `turn/route.ts`.

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { authenticateVoicePartnerRequest } from '@/lib/voice-partner-auth'

// Best-effort patch of a single conversation_turns row's timing, called by
// the realtime bot once BotStoppedSpeakingFrame confirms the doctor's line
// finished playing (unknown at /turn response time — see turn/route.ts
// Step 8's comment). Never blocks the pipeline; a failure here only means
// that one turn's RealtimeSignals contribution is missing, same "best-effort
// evidence store" tolerance turn/route.ts already applies to its own insert.
export async function POST(req: Request) {
  if (process.env.AI_VOICE_PARTNER_ENABLED !== 'true') {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const auth = await authenticateVoicePartnerRequest(req)
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const supabase = auth.viaToken ? createAdminClient() : await createClient()

  const body = await req.json().catch(() => null) as {
    sessionId?: string; turnIndex?: number; startedAt?: string; endedAt?: string
  } | null
  if (!body?.sessionId || typeof body.turnIndex !== 'number') {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  if (!body.startedAt || !body.endedAt || Number.isNaN(Date.parse(body.startedAt)) || Number.isNaN(Date.parse(body.endedAt))) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const { error } = await supabase.from('conversation_turns')
    .update({ started_at: body.startedAt, ended_at: body.endedAt })
    .eq('session_id', body.sessionId).eq('turn_index', body.turnIndex).eq('rep_id', auth.userId)
  if (error) console.warn('conversation_turns timing patch failed:', error.message)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 10: Run the full test suite and commit**

Run: `npx vitest run`
Expected: all existing tests still pass, plus the 4 new `voice-partner-timing.test.ts` tests.

```bash
git add supabase/migrations/030_ai_doctor_realtime_timing.sql src/types/game.ts src/app/api/voice-partner/turn/route.ts src/app/api/voice-partner/turn-timing/route.ts src/lib/voice-partner-timing.ts src/lib/voice-partner-timing.test.ts
git commit -m "feat: persist real per-turn speech timing on the realtime voice-partner path"
```

---

## Task 2: Surface RealtimeSignals in the evaluator report

**Files:**
- Modify: `src/lib/session-evaluator.ts` (`SessionSignals` interface and `computeSessionSignals`, ~line 16-98)
- Test: `src/lib/session-evaluator.test.ts` (extend existing file — locate it first with `ls src/lib/session-evaluator.test.ts`; if it doesn't exist, check `docs/ai-doctor-gap-analysis.md` for why before creating one from scratch)

**Interfaces:**
- Consumes: `RealtimeSignals`, `computeRealtimeSignals` from Task 1's `src/lib/voice-partner-timing.ts`.
- Produces: `SessionSignals.realtimeSignals?: RealtimeSignals | null`, consumed by whatever route/prompt renders the "Conversational Balance" section of the report (find it first — grep `session-analysis/route.ts` for how `SessionSignals` currently reaches the evaluator prompt/response before adding a new field to the LLM-facing prompt; the field itself is server-computed evidence, so it can be attached to the route's JSON response even before any prompt text mentions it).

- [ ] **Step 1: Locate the existing evaluator test file and route usage**

Run: `find src -iname "session-evaluator.test.ts" && grep -n "computeSessionSignals\|SessionSignals" src/app/api/voice-partner/session-analysis/route.ts`

Read both results before proceeding — this determines whether Step 2 adds cases to an existing describe block or creates a new one, and confirms the exact call site to update in Step 4.

- [ ] **Step 2: Add a failing test for the new field**

In the located test file (or a new one following the `pressure-shift.test.ts` `turn()` helper pattern from Task 1), add:

```typescript
import { computeSessionSignals } from './session-evaluator'
// ... existing imports

it('includes realtimeSignals when turns carry real timing', () => {
  const turns = [
    turn({ turn_index: 0, role: 'doctor', started_at: '2026-01-01T00:00:00.000Z', ended_at: '2026-01-01T00:00:02.000Z' }),
    turn({ turn_index: 1, role: 'rep', started_at: '2026-01-01T00:00:03.000Z', ended_at: '2026-01-01T00:00:06.000Z' }),
  ]
  const signals = computeSessionSignals(turns, false)
  expect(signals.realtimeSignals).not.toBeNull()
  expect(signals.realtimeSignals!.talkRatio.repMs).toBe(3000)
})

it('leaves realtimeSignals null for a text-based-path session with no timing', () => {
  const turns = [turn({ turn_index: 0, role: 'doctor' }), turn({ turn_index: 1, role: 'rep' })]
  expect(computeSessionSignals(turns, false).realtimeSignals).toBeNull()
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run` (targeting the located/created test file)
Expected: FAIL — `Property 'realtimeSignals' does not exist` / `undefined` where `not.toBeNull()` was expected.

- [ ] **Step 4: Add the field to `SessionSignals` and compute it**

Edit `src/lib/session-evaluator.ts`. Add the import:

```typescript
import { computeRealtimeSignals, type RealtimeSignals } from '@/lib/voice-partner-timing'
```

Add to the `SessionSignals` interface (after `hiddenConcernRevealTurnIndex: number | null`):

```typescript
  /** Null for a text-based-path session (no speech timing exists to derive
   * this from) — see voice-partner-timing.ts's "report not applicable
   * rather than fabricate" rule. */
  realtimeSignals: RealtimeSignals | null
```

Add to the `return` in `computeSessionSignals` (after `hiddenConcernRevealTurnIndex,`):

```typescript
    realtimeSignals: computeRealtimeSignals(sorted),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run`
Expected: all tests pass, including the 2 new ones.

- [ ] **Step 6: Wire into the report route's response (read-only addition, no prompt change yet)**

At the call site found in Step 1 (`session-analysis/route.ts`), confirm `signals` (the `computeSessionSignals` result) is already included whole in the JSON response returned to the client — if so, `realtimeSignals` reaches the client automatically and this step is just verification (`grep -n "signals" src/app/api/voice-partner/session-analysis/route.ts` to confirm the response shape). If the route destructures specific fields instead of spreading `signals`, add `realtimeSignals: signals.realtimeSignals` to that destructured response object.

- [ ] **Step 7: Commit**

```bash
git add src/lib/session-evaluator.ts src/lib/session-evaluator.test.ts src/app/api/voice-partner/session-analysis/route.ts
git commit -m "feat: surface realtime speech-timing signals in the session evaluator"
```

---

## Task 3: Capture real speech timing in the Pipecat bot

**Files:**
- Modify: `pipecat-bot/bot.py`

**Interfaces:**
- Consumes: `/api/voice-partner/turn` (Task 1, now accepts `repStartedAt`/`repEndedAt` form fields), `/api/voice-partner/turn-timing` (Task 1, new route).
- Produces: nothing consumed by later tasks — this is a leaf.

**Verified against pipecat-ai==1.10.0 tagged source** (`https://github.com/pipecat-ai/pipecat` at `refs/tags/v1.10.0`):
- `pipecat.frames.frames.BotStartedSpeakingFrame` / `BotStoppedSpeakingFrame` are `SystemFrame`s "emitted upstream and downstream by the BaseTransportOutput" — they reach `VoicePartnerJudgeProcessor` (positioned before `tts`/`transport.output()` in the pipeline) via the upstream direction, no pipeline change needed to see them.
- `pipecat.frames.frames.VADUserStartedSpeakingFrame` / `VADUserStoppedSpeakingFrame` are emitted by `pipecat.processors.audio.vad_processor.VADProcessor`, which must be placed in the pipeline (it does NOT exist as a `TransportParams`/`DailyParams` field in 1.10.0 — that field was removed from this version's `TransportParams`, confirmed by reading `src/pipecat/transports/base_transport.py` at the same tag).
- `pipecat.audio.vad.silero.SileroVADAnalyzer` ships in pipecat-ai's own `silero` extra, which is `silero = []` (no extra pip install).

- [ ] **Step 1: Verify the installed environment matches before editing**

Run (from `pipecat-bot/`): `uv sync` then `uv run python -c "from pipecat.processors.audio.vad_processor import VADProcessor; from pipecat.audio.vad.silero import SileroVADAnalyzer; from pipecat.frames.frames import VADUserStartedSpeakingFrame, VADUserStoppedSpeakingFrame, BotStartedSpeakingFrame, BotStoppedSpeakingFrame; print('ok')"`
Expected: prints `ok`. If any import fails, STOP and diff the actual installed version's frame/processor module paths against this task's assumptions before writing any code — do not guess past an import error.

- [ ] **Step 2: Add VAD to the pipeline and timestamp-tracking to the judge processor**

Edit `pipecat-bot/bot.py`. Add imports (alongside the existing `pipecat.frames.frames` import block):

```python
import time

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import (
    BotStartedSpeakingFrame,
    BotStoppedSpeakingFrame,
    EndFrame,
    EndWorkerFrame,
    OutputTransportMessageUrgentFrame,
    TranscriptionFrame,
    TTSSpeakFrame,
    VADUserStartedSpeakingFrame,
    VADUserStoppedSpeakingFrame,
)
from pipecat.processors.audio.vad_processor import VADProcessor
```

In `VoicePartnerJudgeProcessor.__init__`, after `self._turn_count = 0`:

```python
        self._rep_speech_started_at: float | None = None
        self._pending_doctor_turn_index: int | None = None
        self._doctor_speech_started_at: float | None = None
```

Replace `process_frame` with:

```python
    async def process_frame(self, frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, VADUserStartedSpeakingFrame):
            self._rep_speech_started_at = time.time()
        elif isinstance(frame, VADUserStoppedSpeakingFrame):
            # Final transcript may arrive slightly after this — _handle_rep_turn
            # reads self._rep_speech_started_at at that point, not here.
            pass
        elif isinstance(frame, BotStartedSpeakingFrame):
            self._doctor_speech_started_at = time.time()
        elif isinstance(frame, BotStoppedSpeakingFrame):
            await self._report_doctor_timing()

        if isinstance(frame, TranscriptionFrame) and frame.text.strip():
            await self._handle_rep_turn(frame.text.strip())
            return  # don't forward the raw transcription frame further

        await self.push_frame(frame, direction)

    async def _report_doctor_timing(self):
        """Fires once the doctor's TTS line finishes playing — the only point
        both start and end are known for that turn (see turn/route.ts's
        comment on why this can't be included in the /turn POST itself)."""
        if self._pending_doctor_turn_index is None or self._doctor_speech_started_at is None:
            return
        ended_at = time.time()
        try:
            await self._client.post("/api/voice-partner/turn-timing", json={
                "sessionId": self._session["sessionId"],
                "turnIndex": self._pending_doctor_turn_index,
                "startedAt": _iso(self._doctor_speech_started_at),
                "endedAt": _iso(ended_at),
            })
        except Exception:
            pass  # best-effort, never blocks the pipeline (matches turn/route.ts's insert tolerance)
        self._pending_doctor_turn_index = None
        self._doctor_speech_started_at = None
```

Add the ISO-timestamp helper near the top of the file (after `TURN_CAP`):

```python
from datetime import datetime, timezone


def _iso(epoch_seconds: float) -> str:
    return datetime.fromtimestamp(epoch_seconds, tz=timezone.utc).isoformat()
```

- [ ] **Step 3: Send rep timing in the existing `/turn` POST and track the pending doctor turn's index**

In `_handle_rep_turn`, change the `form = {...}` block to include the captured rep timing, and after the response is parsed, record which turn_index the NEXT `BotStoppedSpeakingFrame` should patch:

```python
    async def _handle_rep_turn(self, rep_text: str):
        await self._broadcast({"type": "rep_text", "text": rep_text})
        rep_started_at = self._rep_speech_started_at
        rep_ended_at = time.time()
        self._rep_speech_started_at = None

        form = {
            "doctorId": self._session["doctorId"],
            "sessionId": self._session["sessionId"],
            "lang": self._session["lang"],
            "history": json.dumps(self._history),
            "repText": rep_text,
            "objectionType": self._session["objectionType"],
            "state": json.dumps(self._state),
            "clearStepsHit": json.dumps(self._clear_steps_hit),
        }
        if rep_started_at is not None:
            form["repStartedAt"] = _iso(rep_started_at)
            form["repEndedAt"] = _iso(rep_ended_at)
        # No `audio` field at all — the /turn route only requires one
        # when `repText` is absent.
        resp = await self._client.post("/api/voice-partner/turn", data=form)
        if resp.status_code != 200:
            await self._broadcast({"type": "error", "stage": "turn", "status": resp.status_code})
            return

        data = resp.json()
        # Two rows were just inserted server-side at turn_index = baseIndex
        # (rep) and baseIndex + 1 (doctor) — baseIndex is len(history) at
        # POST time, mirroring turn/route.ts's own baseIndex computation
        # exactly, since history is the same array sent in this request.
        self._pending_doctor_turn_index = len(self._history) + 1
        self._history.append({"role": "rep", "text": rep_text})
        self._history.append({"role": "doctor", "text": data["doctorText"]})
```

(The rest of `_handle_rep_turn` — state/clear-steps update, broadcast, `TTSSpeakFrame` push, outcome check — stays unchanged.)

- [ ] **Step 4: Wire the VAD processor into the pipeline**

In `bot()`, change:

```python
    pipeline = Pipeline([transport.input(), stt, judge, tts, transport.output()])
```

to:

```python
    vad = VADProcessor(vad_analyzer=SileroVADAnalyzer())
    pipeline = Pipeline([transport.input(), vad, stt, judge, tts, transport.output()])
```

- [ ] **Step 5: Manual smoke-test checklist (no automated test — no local pipecat runtime available in this environment)**

This cannot be unit-tested without a running Daily room and real Deepgram/ElevenLabs credentials. Once Task 5's deploy runbook is followed and the bot is live, verify manually:
1. Start a session, speak a rep line, let the doctor reply — confirm two `conversation_turns` rows appear with the rep row's `started_at`/`ended_at` populated.
2. Wait for the doctor's TTS to finish — confirm the doctor row's `started_at`/`ended_at` get patched (poll `conversation_turns` right after the line finishes playing, or check server logs for the `turn-timing` POST).
3. Interrupt the doctor mid-sentence by speaking early — confirm the app doesn't crash and a `conversation_turns` row still gets written (even if its timing looks like an overlap).

- [ ] **Step 6: Commit**

```bash
git add pipecat-bot/bot.py
git commit -m "feat: capture real per-turn speech timing in the Pipecat bot via VAD + bot-speaking frames"
```

---

## Task 4: Replay-This-Moment

**Files:**
- Create: `src/app/api/voice-partner/replay-context/route.ts`
- Modify: `src/components/game/VoicePartner.tsx` (locate the report/outcome rendering first — see Step 1)
- Create: `src/components/game/ReplayMoment.tsx`
- Test: `src/app/api/voice-partner/replay-context/route.test.ts` (or wherever this repo's route tests already live — check for a sibling `*.test.ts` next to another `route.ts` before assuming a path)

**Interfaces:**
- Consumes: `findPressureMoment`, `PressureMoment` from `src/lib/pressure-shift.ts`; `PhysicianState`, `isPhysicianState` from `src/lib/voice-partner-core.ts`; the existing `pipecat-session` start flow (`src/app/api/voice-partner/pipecat-session/route.ts` — unchanged, reused as-is with a seeded `openingText`/`state`).
- Produces: nothing consumed by other tasks — this is the outermost user-facing feature.

- [ ] **Step 1: Locate where the session report/scorecard currently renders**

Run: `grep -rn "session-analysis\|useSessionAnalysis\|pressure_shift\|pressureShift" src/components src/hooks --include="*.ts*" -l`

Read every matched file before writing any UI code. This determines: (a) the exact component to add a "Replay this moment" button/section to, (b) whether a `useSessionAnalysis`-style hook already exists to follow the same data-fetching pattern, (c) the exact shape the report data currently has when it reaches that component (needed to know where `pressureShiftTurnIndex`/`before`/`after` — migration 029's `session_scorecards` columns — actually surface today, if at all).

- [ ] **Step 2: Write `replay-context` route**

Given a `sessionId` and `turnIndex` (the pressure moment's doctor `turn_index`), returns everything needed to seed a fresh realtime session at that moment: the doctor turn's text (becomes the new `openingText`) and its persisted state snapshot (becomes the new seed `state`).

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { isPhysicianState } from '@/lib/voice-partner-core'
import type { ConversationTurn } from '@/types/game'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const sessionId = url.searchParams.get('sessionId')
  const turnIndexRaw = url.searchParams.get('turnIndex')
  const turnIndex = turnIndexRaw !== null ? Number(turnIndexRaw) : NaN
  if (!sessionId || !Number.isInteger(turnIndex)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  // RLS on conversation_turns scopes this to the caller's own rep_id rows —
  // same trust boundary as every other voice-partner route.
  const { data: turn } = await supabase.from('conversation_turns').select('*')
    .eq('session_id', sessionId).eq('turn_index', turnIndex).eq('role', 'doctor').single()
  if (!turn) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const row = turn as ConversationTurn
  const state = { trust: row.trust, skepticism: row.skepticism, engagement: row.engagement, timePressure: row.time_pressure }
  if (!isPhysicianState(state)) return NextResponse.json({ error: 'no_snapshot' }, { status: 422 })

  return NextResponse.json({ openingText: row.text, state, objectionType: row.objection_type, doctorId: row.doctor_id })
}
```

- [ ] **Step 3: Write the failing route test**

```typescript
// Adjust the mock pattern to match whatever this repo's existing route
// tests already use (found in Step 1) — this is illustrative of intent,
// not a literal drop-in if the repo's Supabase test-mocking convention differs.
import { describe, it, expect } from 'vitest'
// ... follow the exact mocking pattern from a sibling route test found in Step 1
```

Do not skip Step 1's investigation to fill this in blind — the real test code depends on this repo's actual Supabase-client mocking convention, which must be read first.

- [ ] **Step 4: Build `ReplayMoment.tsx`**

A small component: given `sessionId` + `turnIndex` of a detected `PressureMoment` (from the report screen located in Step 1), on "Retry this moment":
1. `GET /api/voice-partner/replay-context?sessionId=...&turnIndex=...`
2. Generate a fresh `sessionId` (client-side uuid, matching however the existing session-start flow already does this — check `useVoicePartner.ts` for the pattern before inventing a new one).
3. `POST /api/voice-partner/pipecat-session` with `{ doctorId, sessionId: newSessionId, lang, openingText, objectionType, state }` from Step 2's response — this is the EXACT existing route, unmodified, just seeded from the moment instead of a fresh `seedPhysicianState()`.
4. Reuse the existing realtime call UI (the component found in Step 1 that already renders during a live `pipecat-session`) rather than building a second one.

Exact JSX/hook code depends entirely on what Step 1's investigation finds — do not write this component's body without first reading `VoicePartner.tsx` and `useVoicePartner.ts` in full.

- [ ] **Step 5: Manual verification**

1. Complete a session that produces a detected pressure moment (or seed one directly in `conversation_turns` for testing, per `pressure-shift.test.ts`'s `turn()` helper pattern).
2. Open the report, click "Retry this moment."
3. Confirm a new realtime session starts with the doctor's opening line matching the original moment's text, and the doctor's demeanor reflects the seeded state.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/voice-partner/replay-context src/components/game/ReplayMoment.tsx
git commit -m "feat: Replay-This-Moment retry flow for detected pressure moments"
```

---

## Task 5: Docs and `.env.example`

**Files:**
- Create: `docs/AI_DOCTOR_ARCHITECTURE.md`
- Create: `docs/AI_DOCTOR_SETUP.md`
- Create: `docs/AI_DOCTOR_TEST_PLAN.md`
- Create: `.env.example` (repo root — does not exist today; `pipecat-bot/.env.example` already exists and is untouched by this task)

**Interfaces:** None — pure documentation, no code interfaces.

- [ ] **Step 1: `docs/AI_DOCTOR_ARCHITECTURE.md`**

Cover, grounded in the actual code (not the aspirational mega-spec): the turn-based vs. realtime split, the DoctorAgent/Evaluator separation (`voice-partner-core.ts`'s judge call vs. `session-evaluator.ts`'s lazy post-session call — quote the exact "never part of the live judge call" comment from `session-evaluator.ts`), the physician-state engine, the weighted social-style blend, the Pressure Shift / Critical Moment engine, and this plan's additions (real timing, RealtimeSignals, Replay-This-Moment). Link to `docs/ai-doctor-phase-1-plan.md`, `docs/ai-doctor-gap-analysis.md`, and `docs/ai-doctor-audit.md` rather than duplicating their content.

- [ ] **Step 2: `docs/AI_DOCTOR_SETUP.md`**

The exact Pipecat Cloud deploy runbook (from `docs/superpowers/plans/2026-09-16-ai-voice-partner-realtime.md`'s Task 8, lines ~745-776): `pipecat-ai[cli]` install, `pipecat cloud auth login` (requires a Pipecat Cloud account — external, manual), `pipecat cloud secrets set` with real `DEEPGRAM_API_KEY`/`ELEVENLABS_API_KEY`, `pipecat cloud deploy`, then setting `PIPECAT_CLOUD_API_KEY` + `VOICE_PARTNER_BOT_TOKEN_SECRET` in `.env.local`/Netlify. State plainly that this is 100% external account/credential provisioning with zero code gap remaining.

- [ ] **Step 3: `docs/AI_DOCTOR_TEST_PLAN.md`**

List: every existing automated test file covering this feature (`voice-partner-core.test.ts`, `pressure-shift.test.ts`, `session-evaluator.test.ts`, `voice-partner-timing.test.ts` from Task 1, `voice-partner-bot-token.test.ts`), plus the manual smoke-test checklist from Task 3 Step 5 and Task 4 Step 5, plus the spec's 15-scenario manual test list (interrupt doctor, doctor interrupts user, 3s/8s silence, Arabic, English, code-switching, Iraqi Arabic, noisy audio, unsupported medical claim, long monologue, excellent/poor questioning, abrupt termination, network reconnect) marked explicitly as **not yet automatable** without a running Pipecat/Daily test harness — don't claim coverage that doesn't exist.

- [ ] **Step 4: Root `.env.example`**

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=

# AI providers
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# AI Doctor voice partner (text-based path)
AI_VOICE_PARTNER_ENABLED=

# AI Doctor realtime voice (Pipecat Cloud + Daily) — see docs/AI_DOCTOR_SETUP.md
PIPECAT_CLOUD_API_KEY=
VOICE_PARTNER_BOT_TOKEN_SECRET=
PIPECAT_AGENT_NAME=styleshift-voice-partner
```

- [ ] **Step 5: Commit**

```bash
git add docs/AI_DOCTOR_ARCHITECTURE.md docs/AI_DOCTOR_SETUP.md docs/AI_DOCTOR_TEST_PLAN.md .env.example
git commit -m "docs: AI Doctor architecture, setup runbook, and test plan"
```
