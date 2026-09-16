# AI Doctor — Test Plan

## Automated tests (run today, `npx vitest run`)

All deterministic TypeScript logic behind AI Doctor is unit-tested without any
external voice vendor — this is the majority of what actually needs correctness
guarantees (judge state machine, evaluator scoring, Pressure Shift detection, talk-ratio
math). As of this hardening pass, the full suite is 307 tests across 28 files; the
files directly covering this feature:

| File | Tests | Covers |
|---|---|---|
| `src/lib/voice-partner-core.test.ts` | 71 | judge prompt building, state deltas, `resolveTurn` outcome logic, difficulty seeding, weighted-style descriptors |
| `src/lib/session-evaluator.test.ts` | 27 | `SessionSignals` extraction, competency/adaptation grounding, `realtimeSignals` presence/absence |
| `src/lib/pressure-shift.test.ts` | 7 | Critical Moment (`findPressureMoment`) detection and before/after window comparison |
| `src/lib/voice-partner-timing.test.ts` | 6 | real-timestamp talk ratio, interruption-proxy, and response-latency computation (new, this pass) |
| `src/lib/roleplay-core.test.ts` | 20 | the shared talk-ratio/interruption/question-classification engine `voice-partner-timing.ts` reuses |
| `src/lib/voice-partner-bot-token.test.ts` | 6 | bearer-token auth the realtime bot uses to call back into Next.js routes |

Run: `npx vitest run` — expect all green, plus `npx tsc --noEmit` clean.

**Not covered by automated tests** (and why):

- `pipecat-bot/bot.py` — no Python test runner exists in this repo, and `daily-python`
  can't even install on the Windows dev machine (see `docs/AI_DOCTOR_SETUP.md`). Every
  import it uses was verified against the real pinned `pipecat-ai==1.10.0` package in a
  throwaway venv (deepgram/elevenlabs extras only, skipping the Windows-incompatible
  daily extra) — that's static-import verification, not behavioral testing.
- `src/app/api/voice-partner/turn-timing/route.ts` and `src/app/api/voice-partner/
  replay-context/route.ts` — no route-level test harness pattern was found reused from
  an existing sibling route test at the time of writing; add one following whatever
  convention `session-analysis/route.ts`'s own tests (if any) use.
- Any actual realtime audio behavior (turn-taking, interruption, VAD accuracy,
  Deepgram/ElevenLabs quality) — inherently requires a live Daily room and real
  credentials; see the manual checklist below.

## Manual test checklist — realtime timing capture (this hardening pass)

Requires a deployed Pipecat Cloud agent (see `docs/AI_DOCTOR_SETUP.md`). Not yet run —
record results here once performed:

1. Start a session, speak a rep line, let the doctor reply. Confirm two
   `conversation_turns` rows appear with the **rep** row's `started_at`/`ended_at`
   populated (non-null).
2. Wait for the doctor's TTS to finish. Confirm the **doctor** row's `started_at`/
   `ended_at` get patched shortly after (poll `conversation_turns`, or check server
   logs for a `turn-timing` POST).
3. Interrupt the doctor mid-sentence by speaking early. Confirm the app doesn't crash
   and a `conversation_turns` row still gets written, even if its timing looks like an
   overlap.
4. Complete a full session and open the report — confirm `realtimeSignals` appears
   (non-null) in the session-analysis response, with a plausible talk ratio.

## Manual test checklist — Replay-This-Moment

1. Complete a session that produces a detected Pressure Shift moment (or seed one
   directly in `conversation_turns`, following `pressure-shift.test.ts`'s `turn()`
   helper pattern, for a controlled test).
2. Open the report, trigger "Retry this moment."
3. Confirm a new realtime session starts with the doctor's opening line matching the
   original moment's text, and the doctor's demeanor reflects the seeded state
   (trust/skepticism/engagement/time-pressure).

## Spec's full manual scenario list — status

The original mega-spec named 15 realtime-voice scenarios to test. None of these are
automatable without a running Pipecat/Daily harness with real STT/TTS credentials —
listed here as an explicit, honest backlog, not claimed as covered:

| # | Scenario | Status |
|---|---|---|
| 1 | User interrupts doctor | Not yet run |
| 2 | Doctor interrupts user | Not yet run |
| 3 | 3-second silence | Not yet run |
| 4 | 8-second silence | Not yet run |
| 5 | Arabic speech | Not yet run |
| 6 | English speech | Not yet run |
| 7 | Arabic-English code-switching | Not yet run |
| 8 | Iraqi Arabic | Not yet run |
| 9 | Noisy audio | Not yet run |
| 10 | Unsupported medical claim (guardrail check) | Not yet run — SYSTEM prompt's hard rules cover this in principle (`voice-partner-core.ts`'s `SYSTEM` constant), unverified live |
| 11 | Long salesperson monologue | Not yet run |
| 12 | Excellent questioning | Not yet run |
| 13 | Poor questioning | Not yet run |
| 14 | Abrupt session termination | Partially covered — `on_participant_left`/`on_call_state_updated` handlers in `bot.py` queue an `EndFrame`, unverified live |
| 15 | Network reconnect | Not yet run |

Run this list once the Pipecat Cloud deploy (`docs/AI_DOCTOR_SETUP.md`) is live, and
update this table with actual results rather than treating the table itself as proof
of coverage.
