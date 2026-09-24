# Conversation Analysis Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every StyleShift session type (human-partner roleplay, AI Doctor voice sim, AI Doctor text sim, and a new consented real-customer-visit recording) one shared, evidence-linked report that answers the seven post-visit questions, with a social-style coaching section, without ever fabricating a quote, score, or agreement.

**Architecture:** Each flow keeps its own storage; a new `transcript_segments` table captures the two flows that currently discard their per-turn data (human-partner roleplay, new customer-visit mode). A per-flow **adapter** normalizes whichever store a session lives in into one `TranscriptSegment[]` + `ReportContext` shape. One shared pipeline (`adapter → buildReportPrompt → LLM (existing `createAnthropicComplete`) → groundReport → persistReport`) turns that into a `ConversationReport`, reusing the exact "model cites segmentIndex only, server resolves and drops invalid refs" pattern already proven in `src/agents/behaviorAnalyst/ground.ts` and `src/lib/session-evaluator.ts`. One new UI component renders it for all four session types.

**Tech Stack:** Next.js 16 (App Router, `src/app/api/**/route.ts`), TypeScript, Supabase (Postgres + RLS + `@supabase/ssr`), Anthropic Claude Haiku 4.5 via the existing `src/agents/llm.ts` seam, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-24-conversation-analysis-report-design.md`

## Global Constraints

- No new LLM/text-generation provider — reuse `createAnthropicComplete` from `src/agents/llm.ts` (model `claude-haiku-4-5-20251001`, via `AGENT_MODEL`).
- No `zod` or other schema-validation dependency — this codebase hand-writes TS interfaces plus `isX`/`ground*` validator functions (see `src/schemas/observation`, `src/agents/behaviorAnalyst/ground.ts`); follow that pattern exactly, do not add a library.
- New shared types live at `src/schemas/conversationReport/index.ts` — **not** `src/schemas/report`, which already exists and is the flow-C-specific `SessionReport`/`ReportTurn` type. Do not edit that file's exports; only its consumer (Task 16) changes.
- Every evidence reference in a generated report must be checked against the real transcript segment text server-side before display; an unverifiable reference is dropped, never repaired or displayed anyway (mirrors `groundEvidence()` in `src/agents/behaviorAnalyst/ground.ts:32`).
- Numeric measurements (talk ratio, pace, question counts, etc.) are always computed deterministically by existing code (`roleplay-core.ts`, `session-evaluator.ts`, `scoring/engine.ts`) and passed into the prompt as context — the model never invents or restates a number that becomes the displayed value.
- `ai_doctor_voice` and `ai_doctor_text` reports must never present the configured doctor persona (`style_driver/expressive/amiable/analytical`, `hidden_concern`, `trust/skepticism/engagement/timePressure`) as measured customer information — always label it a simulation setting (mirrors `assembleReport()`'s existing "internal physician state... deliberately left out", `src/agents/orchestrator/report.ts:8`).
- Any new Supabase migration file goes in `supabase/migrations/`, numbered `033_...` (next after `032_agent_sessions.sql`), and follows the existing RLS pattern: `rep_id = auth.uid()` for own-row access, no manager-read policy unless a task says otherwise (real-customer data defaults to rep-only).
- This is Next.js 16, not the version in training data — read `node_modules/next/dist/docs/01-app` before writing any new route handler or server component pattern that looks unfamiliar (per `AGENTS.md`).
- All new user-facing strings go through `src/lib/i18n.tsx`'s `EN`/`AR` dotted-key dictionaries and `useT()` — no hardcoded UI strings.
- `EN['privacy.body']`'s unconditional "audio is always discarded" claim must not remain true-by-accident once `customer_visit` retention ships — Task 17 makes it conditional.

## Review Focus

- **Fabricated evidence** — a model response citing a `segmentIndex` that doesn't exist, or a `quote` that isn't a real substring of that segment, must never reach the UI. Tested in Task 10.
- **Missing audio offsets treated as available** — `ai_doctor_text`/`ai_doctor_voice` segments and any segment with `startMs: null` must render evidence with no playback control at all, never a disabled/broken one. Tested in Task 14.
- **Speaker correction going stale** — after a rep corrects `speakerRole` on a transcript and regenerates, the prior report for that `(sessionType, sessionId)` must be marked outdated, not silently replaced with no trace. Tested in Task 11 and Task 18.
- **Simulation state leaking as customer data** — a doctor's configured `style_*`/`hidden_concern`/`trust` fields must never appear in the `customerUnderstanding` or `socialStyle.customer` sections of an `ai_doctor_*` report as if discovered from the conversation. Tested in Task 9 and Task 18.
- **Commitment-type collapse** — an AI-suggested follow-up, a proposed-but-unaccepted action, and an explicitly agreed commitment must never be flattened into one list with one implied status. Tested in Task 10 and Task 18.

---

## Task 1: `transcript_segments`, `customer_visits`, `conversation_reports` tables

**Files:**
- Create: `supabase/migrations/033_conversation_reports.sql`
- Test: manual — apply locally, no automated migration test in this repo's convention (existing migrations have none)

**Interfaces:**
- Produces: three tables consumed by every later task. Column names below are final and used verbatim by Tasks 3, 4–7, 11, 12, 13, 18.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/033_conversation_reports.sql
--
-- Adds the storage this feature needs without touching the three existing
-- session tables (roleplay_sessions, conversation_turns, agent_sessions):
--
-- transcript_segments: canonical per-turn evidence store for the two flows
--   that don't already have one with real audio offsets (human-partner
--   roleplay's diarized utterances are currently discarded after the
--   aggregate is saved; the new customer-visit flow needs the same thing).
--   conversation_turns and agent_sessions.record.session.transcript remain
--   the source of truth for their own flows — a per-flow adapter reads them
--   directly instead of duplicating them here.
--
-- customer_visits: the new consented real-customer-recording session type.
--
-- conversation_reports: one generated ConversationReport per
-- (session_type, session_id, transcript_version) combination.

create table public.transcript_segments (
  id uuid primary key default gen_random_uuid(),
  session_type text not null check (session_type = any (array['human_partner','customer_visit'])),
  session_id uuid not null,
  rep_id uuid not null references public.profiles(id) on delete cascade,
  transcript_version integer not null default 1,
  segment_index integer not null,
  speaker_role text not null check (speaker_role = any (array['rep','counterpart'])),
  text text not null,
  start_ms integer,
  end_ms integer,
  created_at timestamptz not null default now(),
  unique (session_type, session_id, transcript_version, segment_index)
);

create index transcript_segments_session_idx
  on public.transcript_segments (session_type, session_id, transcript_version);

alter table public.transcript_segments enable row level security;

create policy "own transcript segments read" on public.transcript_segments
  for select using (rep_id = auth.uid());
create policy "own transcript segments insert" on public.transcript_segments
  for insert with check (rep_id = auth.uid());
create policy "own transcript segments delete" on public.transcript_segments
  for delete using (rep_id = auth.uid());

-- No update policy: a transcript version is immutable once written. A
-- speaker correction (Task 13) inserts a NEW transcript_version rather than
-- mutating rows in place, so every report can always cite the exact
-- version it was generated from.

create table public.customer_visits (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  objective text,
  product_context text,
  speaker_label_rep text,
  speaker_label_customer text,
  consent_confirmed_at timestamptz,
  retention_policy text not null default 'discard_after_report'
    check (retention_policy = any (array['discard_after_report','retain_90_days','retain_indefinite'])),
  audio_deleted_at timestamptz,
  status text not null default 'recording'
    check (status = any (array['recording','transcribing','pick_speaker','ready','failed'])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_visits enable row level security;

create policy "own customer visits read" on public.customer_visits
  for select using (rep_id = auth.uid());
create policy "own customer visits insert" on public.customer_visits
  for insert with check (rep_id = auth.uid());
create policy "own customer visits update" on public.customer_visits
  for update using (rep_id = auth.uid()) with check (rep_id = auth.uid());
create policy "own customer visits delete" on public.customer_visits
  for delete using (rep_id = auth.uid());

-- Deliberately no manager-read policy on customer_visits or its segments —
-- this is consented real-customer data; nothing in the product yet promises
-- manager access to it (same reasoning as agent_sessions, migration 032).

create table public.conversation_reports (
  id uuid primary key default gen_random_uuid(),
  session_type text not null check (session_type = any (array['human_partner','ai_doctor_voice','ai_doctor_text','customer_visit'])),
  session_id uuid not null,
  rep_id uuid not null references public.profiles(id) on delete cascade,
  transcript_version integer not null default 1,
  report_schema_version integer not null default 1,
  scoring_config_version text,
  report jsonb not null,
  status text not null check (status = any (array['complete','partial','failed'])),
  failure_reason text,
  superseded_by uuid references public.conversation_reports(id) on delete set null,
  created_at timestamptz not null default now()
);

create index conversation_reports_session_idx
  on public.conversation_reports (session_type, session_id, created_at desc);

alter table public.conversation_reports enable row level security;

create policy "own conversation reports read" on public.conversation_reports
  for select using (rep_id = auth.uid());
create policy "own conversation reports insert" on public.conversation_reports
  for insert with check (rep_id = auth.uid());
create policy "own conversation reports update" on public.conversation_reports
  for update using (rep_id = auth.uid()) with check (rep_id = auth.uid());
create policy "own conversation reports delete" on public.conversation_reports
  for delete using (rep_id = auth.uid());
```

- [ ] **Step 2: Apply the migration locally and verify**

Run: `npx supabase db push` (or the project's usual local-apply command — check `docs/superpowers/plans/2026-09-16-ai-voice-partner-realtime.md`'s Task-8-adjacent notes if unsure of the project's flow; this repo has no local Supabase stack script beyond the CLI).
Expected: three new tables appear; `select * from public.transcript_segments limit 1;` returns an empty result with no error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/033_conversation_reports.sql
git commit -m "feat: add transcript_segments, customer_visits, conversation_reports tables"
```

---

## Task 2: Shared report schema and validator scaffolding

**Files:**
- Create: `src/schemas/conversationReport/index.ts`
- Test: `src/schemas/conversationReport/index.test.ts`

**Interfaces:**
- Consumes: nothing (pure types + guards).
- Produces: `ReportSessionType`, `TranscriptSegment`, `EvidenceRef`, `Certainty`, `CommitmentStatus`, `ObjectiveStatus`, `SocialStyle`, and every interface under `ConversationReport` exactly as specified below — every later task imports from this module. `isReportSessionType`, `isCertainty`, `isCommitmentStatus`, `isSocialStyle` guard functions are exported for use by `groundReport.ts` (Task 9).

- [ ] **Step 1: Write the failing test**

```ts
// src/schemas/conversationReport/index.test.ts
import { describe, it, expect } from 'vitest'
import { isReportSessionType, isCertainty, isCommitmentStatus, isSocialStyle } from './index'

describe('conversationReport guards', () => {
  it('accepts only the four known session types', () => {
    expect(isReportSessionType('human_partner')).toBe(true)
    expect(isReportSessionType('customer_visit')).toBe(true)
    expect(isReportSessionType('made_up')).toBe(false)
  })
  it('accepts only the three certainty labels', () => {
    expect(isCertainty('stated')).toBe(true)
    expect(isCertainty('guessed')).toBe(false)
  })
  it('accepts only the three commitment statuses', () => {
    expect(isCommitmentStatus('agreed')).toBe(true)
    expect(isCommitmentStatus('done')).toBe(false)
  })
  it('accepts only the four social styles', () => {
    expect(isSocialStyle('driver')).toBe(true)
    expect(isSocialStyle('dominant')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/schemas/conversationReport/index.test.ts`
Expected: FAIL — `./index` has no exports yet.

- [ ] **Step 3: Write the schema module**

```ts
// src/schemas/conversationReport/index.ts

export const REPORT_SESSION_TYPES = ['human_partner', 'ai_doctor_voice', 'ai_doctor_text', 'customer_visit'] as const
export type ReportSessionType = typeof REPORT_SESSION_TYPES[number]
export function isReportSessionType(v: unknown): v is ReportSessionType {
  return typeof v === 'string' && (REPORT_SESSION_TYPES as readonly string[]).includes(v)
}

export const CERTAINTIES = ['stated', 'inferred', 'not_established'] as const
export type Certainty = typeof CERTAINTIES[number]
export function isCertainty(v: unknown): v is Certainty {
  return typeof v === 'string' && (CERTAINTIES as readonly string[]).includes(v)
}

export const COMMITMENT_STATUSES = ['agreed', 'proposed', 'ai_recommended'] as const
export type CommitmentStatus = typeof COMMITMENT_STATUSES[number]
export function isCommitmentStatus(v: unknown): v is CommitmentStatus {
  return typeof v === 'string' && (COMMITMENT_STATUSES as readonly string[]).includes(v)
}

export const OBJECTIVE_STATUSES = ['achieved', 'partial', 'not_achieved', 'insufficient_evidence'] as const
export type ObjectiveStatus = typeof OBJECTIVE_STATUSES[number]
export function isObjectiveStatus(v: unknown): v is ObjectiveStatus {
  return typeof v === 'string' && (OBJECTIVE_STATUSES as readonly string[]).includes(v)
}

export const SOCIAL_STYLES = ['driver', 'expressive', 'amiable', 'analytical'] as const
export type SocialStyle = typeof SOCIAL_STYLES[number]
export function isSocialStyle(v: unknown): v is SocialStyle {
  return typeof v === 'string' && (SOCIAL_STYLES as readonly string[]).includes(v)
}

export const PERFORMANCE_DIMENSIONS = [
  'opening', 'questioning', 'listening', 'value_linking',
  'evidence_use', 'objection_handling', 'adaptation', 'closing',
] as const
export type PerformanceDimension = typeof PERFORMANCE_DIMENSIONS[number]
export function isPerformanceDimension(v: unknown): v is PerformanceDimension {
  return typeof v === 'string' && (PERFORMANCE_DIMENSIONS as readonly string[]).includes(v)
}

export const VOICE_METRICS = [
  'speaking_share', 'speaking_rate', 'pitch_variation', 'pauses',
  'rapid_turn_switches', 'question_frequency', 'open_question_ratio',
] as const
export type VoiceMetric = typeof VOICE_METRICS[number]

export const SIGNAL_CATEGORIES = [
  'directness', 'detail_request', 'results_focus', 'relationship_language',
  'possibility_interest', 'reassurance_request', 'pace_preference',
] as const
export type SignalCategory = typeof SIGNAL_CATEGORIES[number]
export function isSignalCategory(v: unknown): v is SignalCategory {
  return typeof v === 'string' && (SIGNAL_CATEGORIES as readonly string[]).includes(v)
}

export interface TranscriptSegment {
  segmentIndex: number
  speakerRole: 'rep' | 'counterpart'
  text: string
  startMs: number | null
  endMs: number | null
  createdAt: string | null
}

/** `quote` is checked server-side (groundReport.ts) to be a real substring
 * of segments[segmentIndex].text. Never trust a model-supplied EvidenceRef
 * without that check. */
export interface EvidenceRef {
  segmentIndex: number
  speakerRole: 'rep' | 'counterpart'
  quote: string
}

export interface VisitSummary {
  sessionType: ReportSessionType
  objective: string | null
  summary: string
  objectiveStatus: ObjectiveStatus
  objectiveStatusReason: string
  evidence: EvidenceRef[]
}

export interface CustomerUnderstandingItem {
  text: string
  certainty: Certainty
  evidence: EvidenceRef[]
}

export interface CustomerUnderstanding {
  needs: CustomerUnderstandingItem[]
  concerns: CustomerUnderstandingItem[]
  decisionCriteria: CustomerUnderstandingItem[]
  openQuestions: CustomerUnderstandingItem[]
}

export interface PerformanceFinding {
  dimension: PerformanceDimension
  whatHappened: string
  evidence: EvidenceRef[]
  whyItMattered: string
  improvement: string | null
}

export interface CriticalMoment {
  evidence: EvidenceRef
  observedBehavior: string
  interpretation: string
  interpretationCertainty: Certainty
  betterResponseExample: string | null
}

export interface VoiceMeasurement {
  metric: VoiceMetric
  value: number
  unit: string
  explanation: string
  available: boolean
}

export interface Commitment {
  action: string
  status: CommitmentStatus
  owner: string | null
  date: string | null
  evidence: EvidenceRef[]
}

export interface CoachingPriority {
  behavior: string
  evidence: EvidenceRef[]
  betterPhrase: string
  practiceExercise: string
  successLooksLike: string
}

export interface Strength {
  behavior: string
  evidence: EvidenceRef[]
}

export interface SocialStyleSignal {
  text: string
  evidence: EvidenceRef
  category: SignalCategory
}

export interface SocialStyleRead {
  subject: 'customer' | 'rep'
  strongestSignals: SocialStyleSignal[]
  possibleStyle: SocialStyle | null
  mixedEvidenceNote: string | null
  alternativeExplanation: string | null
  savedProfile: SocialStyle | null
  profileDrift: boolean
  isSimulationSetting: boolean
}

export interface AdaptationFinding {
  customerSignal: EvidenceRef
  repResponse: EvidenceRef
  assessment: 'well_adapted' | 'mismatched' | 'insufficient_evidence'
  betterResponseExample: string | null
  suggestedAdjustment: string | null
}

export interface SocialStyleSection {
  customer: SocialStyleRead
  rep: SocialStyleRead
  adaptation: AdaptationFinding[]
  signalChanges: { description: string; evidence: EvidenceRef[] }[]
  coachingCard: {
    observedSignals: string
    possiblePreference: string
    evidenceAndAlternative: string
    repResponse: string
    mostUsefulAdjustment: string
    suggestedWordingNextVisit: string
  } | null
}

export interface ConversationReport {
  reportSchemaVersion: 1
  sessionType: ReportSessionType
  transcriptVersion: number
  scoringConfigVersion: string | null
  generatedAt: string
  visitSummary: VisitSummary
  customerUnderstanding: CustomerUnderstanding
  performance: PerformanceFinding[]
  criticalMoments: CriticalMoment[]
  voiceMeasurements: VoiceMeasurement[]
  commitments: Commitment[]
  coachingPriority: CoachingPriority
  strength: Strength
  socialStyle: SocialStyleSection
  qualityFlags: string[]
}

/** Context an adapter builds from the flow's own data, given to the prompt
 * builder alongside the segments. Never re-derived by the model. */
export interface ReportContext {
  objective: string | null
  productContext: string | null
  isSimulation: boolean
  simulationPersona: { style: SocialStyle | null; hiddenConcern: string | null } | null
  savedCounterpartStyle: SocialStyle | null
  deterministicMetrics: Record<string, number | string | boolean | null>
  qualityFlags: string[]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/schemas/conversationReport/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/schemas/conversationReport
git commit -m "feat: add shared conversation-report schema types"
```

---

## Task 3: Persist human-partner transcript segments instead of discarding them

**Files:**
- Create: `src/lib/transcript-segments.ts`
- Test: `src/lib/transcript-segments.test.ts`
- Modify: `src/hooks/useRoleplayRecorder.ts:283-345` (the `pickSpeaker` callback)

**Interfaces:**
- Consumes: `Utterance` from `src/lib/roleplay-core.ts` (`{speaker, text, start, end}`).
- Produces: `persistTranscriptSegments(supabase, args)` — used by this task and by Task 7 (customer-visit flow).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/transcript-segments.test.ts
import { describe, it, expect, vi } from 'vitest'
import { toTranscriptSegmentRows } from './transcript-segments'

describe('toTranscriptSegmentRows', () => {
  it('maps utterances to rows, marking the rep speaker vs everyone else', () => {
    const rows = toTranscriptSegmentRows({
      utterances: [
        { speaker: 'A', text: 'Hello doctor', start: 0, end: 1000 },
        { speaker: 'B', text: 'Hello, busy today', start: 1000, end: 2500 },
      ],
      repSpeaker: 'A',
      sessionType: 'human_partner',
      sessionId: 'sess-1',
      repId: 'rep-1',
      transcriptVersion: 1,
    })
    expect(rows).toEqual([
      { session_type: 'human_partner', session_id: 'sess-1', rep_id: 'rep-1', transcript_version: 1, segment_index: 0, speaker_role: 'rep', text: 'Hello doctor', start_ms: 0, end_ms: 1000 },
      { session_type: 'human_partner', session_id: 'sess-1', rep_id: 'rep-1', transcript_version: 1, segment_index: 1, speaker_role: 'counterpart', text: 'Hello, busy today', start_ms: 1000, end_ms: 2500 },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/transcript-segments.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/transcript-segments.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export interface RawUtterance { speaker: string; text: string; start: number; end: number }

export interface TranscriptSegmentRow {
  session_type: 'human_partner' | 'customer_visit'
  session_id: string
  rep_id: string
  transcript_version: number
  segment_index: number
  speaker_role: 'rep' | 'counterpart'
  text: string
  start_ms: number | null
  end_ms: number | null
}

export function toTranscriptSegmentRows(args: {
  utterances: RawUtterance[]
  repSpeaker: string
  sessionType: 'human_partner' | 'customer_visit'
  sessionId: string
  repId: string
  transcriptVersion: number
}): TranscriptSegmentRow[] {
  return args.utterances.map((u, segment_index) => ({
    session_type: args.sessionType,
    session_id: args.sessionId,
    rep_id: args.repId,
    transcript_version: args.transcriptVersion,
    segment_index,
    speaker_role: u.speaker === args.repSpeaker ? 'rep' : 'counterpart',
    text: u.text,
    start_ms: u.start,
    end_ms: u.end,
  }))
}

/** Writes one transcript version's worth of segments. Never partially
 * writes: on failure the caller sees the error and the session's report
 * generation simply has no segments to work from (never a truncated set). */
export async function persistTranscriptSegments(
  supabase: SupabaseClient, args: Parameters<typeof toTranscriptSegmentRows>[0],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = toTranscriptSegmentRows(args)
  if (rows.length === 0) return { ok: true }
  const { error } = await supabase.from('transcript_segments').insert(rows)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/transcript-segments.test.ts`
Expected: PASS

- [ ] **Step 5: Wire it into `useRoleplayRecorder.ts`'s `pickSpeaker`**

In `src/hooks/useRoleplayRecorder.ts`, add the import:

```ts
import { persistTranscriptSegments } from '@/lib/transcript-segments'
```

Immediately after the existing update-path success (`if (updateError || !updated?.length) throw ...` — the line right after it, still inside the `if (sessionId)` branch) and immediately after the existing insert-path success (`setSessionId(inserted.id)` line), add:

```ts
const segResult = await persistTranscriptSegments(supabase, {
  utterances: utterancesRef.current.map(u => ({ speaker: u.speaker, text: u.text, start: u.start, end: u.end })),
  repSpeaker,
  sessionType: 'human_partner',
  sessionId: sessionId ?? inserted.id, // whichever branch this runs in
  repId: user.id,
  transcriptVersion: 1,
})
if (!segResult.ok) console.error('transcript segment save failed:', segResult.error)
```

(Use `sessionId` in the update branch and `inserted.id` in the insert branch — copy the two call sites exactly as their surrounding code already distinguishes them; do not introduce a new shared variable that changes control flow.) A segment-save failure is logged, not thrown — the aggregate `roleplay_sessions` row (the XP-earning, already-working part) must still save even if evidence storage has a hiccup.

- [ ] **Step 6: Run the existing roleplay recorder tests to confirm no regression**

Run: `npx vitest run src/hooks`
Expected: PASS (no existing test asserts on `transcript_segments`, so nothing should break; if `useRoleplayRecorder.ts` has no existing `.test.ts`, this step just confirms no other hook test broke).

- [ ] **Step 7: Commit**

```bash
git add src/lib/transcript-segments.ts src/lib/transcript-segments.test.ts src/hooks/useRoleplayRecorder.ts
git commit -m "feat: persist human-partner roleplay transcript segments instead of discarding them"
```

---

## Task 4: Adapter for AI Doctor text simulation (`ai_doctor_text`)

**Files:**
- Create: `src/lib/report/adapters/fromAgentSession.ts`
- Test: `src/lib/report/adapters/fromAgentSession.test.ts`

**Interfaces:**
- Consumes: `agent_sessions.record` (a `SessionRecord` whose `.session` is a `StyleShiftSession` — `src/schemas/session/index.ts`; `session.transcript: TranscriptTurn[]`, `session.physician`, `session.scores: SessionScore | null`).
- Produces: `adaptAgentSession(record: SessionRecord): { segments: TranscriptSegment[]; context: ReportContext }` — the shape every later pipeline step (Task 9) consumes, identical across all four adapters (Tasks 4–7).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/report/adapters/fromAgentSession.test.ts
import { describe, it, expect } from 'vitest'
import { createEmptySession } from '@/schemas/session/factory'
import { adaptAgentSession } from './fromAgentSession'
import type { SessionRecord } from '@/agents/orchestrator/types'

function record(): SessionRecord {
  const session = createEmptySession('s1', 'r1')
  session.transcript = [
    { turnIndex: 0, role: 'doctor', text: 'I have five minutes only.', objectionType: null, clearStepsHit: [], state: { trust: 0.4, skepticism: 0.6, engagement: 0.3, timePressure: 0.8 }, vocalFeedback: null, createdAt: '2026-09-24T09:00:00.000Z' },
    { turnIndex: 1, role: 'rep', text: 'Understood, I will be brief.', objectionType: null, clearStepsHit: [], state: null, vocalFeedback: null, createdAt: '2026-09-24T09:00:05.000Z' },
  ]
  session.socialStyle = { primary: 'driver', weights: { driver: 0.7, expressive: 0.1, amiable: 0.1, analytical: 0.1 }, dominant: 'driver', source: 'weighted', assertiveness: 'tell', responsiveness: 'controls' }
  session.physician.hiddenConcern = 'worried about switching cost'
  return { session, phase: 'ended', trace: [], report: null }
}

describe('adaptAgentSession', () => {
  it('maps doctor/rep turns to counterpart/rep segments with real timestamps, no audio offsets', () => {
    const { segments } = adaptAgentSession(record())
    expect(segments).toEqual([
      { segmentIndex: 0, speakerRole: 'counterpart', text: 'I have five minutes only.', startMs: null, endMs: null, createdAt: '2026-09-24T09:00:00.000Z' },
      { segmentIndex: 1, speakerRole: 'rep', text: 'Understood, I will be brief.', startMs: null, endMs: null, createdAt: '2026-09-24T09:00:05.000Z' },
    ])
  })
  it('marks the doctor persona as a simulation setting, never customer data', () => {
    const { context } = adaptAgentSession(record())
    expect(context.isSimulation).toBe(true)
    expect(context.simulationPersona).toEqual({ style: 'driver', hiddenConcern: 'worried about switching cost' })
    expect(context.savedCounterpartStyle).toBeNull() // no independent "saved profile" concept in this flow
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/report/adapters/fromAgentSession.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/report/adapters/fromAgentSession.ts
import type { SessionRecord } from '@/agents/orchestrator/types'
import type { TranscriptSegment, ReportContext } from '@/schemas/conversationReport'
import { isSocialStyle } from '@/schemas/conversationReport'

export function adaptAgentSession(record: SessionRecord): { segments: TranscriptSegment[]; context: ReportContext } {
  const { session } = record
  const segments: TranscriptSegment[] = session.transcript.map(t => ({
    segmentIndex: t.turnIndex,
    speakerRole: t.role === 'rep' ? 'rep' : 'counterpart',
    text: t.text,
    startMs: null, // a simulation turn index is not an audio timestamp — never fabricate one
    endMs: null,
    createdAt: t.createdAt,
  }))

  const dominant = session.socialStyle.dominant
  const context: ReportContext = {
    objective: null, // this flow has no rep-entered visit objective field today
    productContext: null,
    isSimulation: true,
    simulationPersona: {
      style: isSocialStyle(dominant) ? dominant : null,
      hiddenConcern: session.physician.hiddenConcern,
    },
    savedCounterpartStyle: null,
    deterministicMetrics: {
      overallScore: session.scores?.overall ?? null,
      scoringConfigVersion: session.scores?.configVersion ?? null,
    },
    qualityFlags: session.transcript.length < 6 ? ['short_session'] : [],
  }
  return { segments, context }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/report/adapters/fromAgentSession.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/report/adapters/fromAgentSession.ts src/lib/report/adapters/fromAgentSession.test.ts
git commit -m "feat: add ai_doctor_text report adapter"
```

---

## Task 5: Adapter for AI Doctor voice simulation (`ai_doctor_voice`)

**Files:**
- Create: `src/lib/report/adapters/fromConversationTurns.ts`
- Test: `src/lib/report/adapters/fromConversationTurns.test.ts`

**Interfaces:**
- Consumes: `ConversationTurn[]` (`src/types/game.ts:131`) and a `Doctor` row, plus `resolveDoctorStyleProfile` (`src/lib/session-evaluator.ts:189`).
- Produces: `adaptConversationTurns(turns: ConversationTurn[], doctor: Doctor): { segments: TranscriptSegment[]; context: ReportContext }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/report/adapters/fromConversationTurns.test.ts
import { describe, it, expect } from 'vitest'
import { adaptConversationTurns } from './fromConversationTurns'
import type { ConversationTurn, Doctor } from '@/types/game'

const turns: ConversationTurn[] = [
  { id: 't0', session_id: 's1', rep_id: 'r1', doctor_id: 'd1', turn_index: 0, role: 'doctor', text: 'Why should I switch?', objection_type: 'cost', clear_steps_hit: [], trust: 0.3, skepticism: 0.7, engagement: 0.4, time_pressure: 0.2, created_at: '2026-09-24T09:00:00.000Z' },
  { id: 't1', session_id: 's1', rep_id: 'r1', doctor_id: 'd1', turn_index: 1, role: 'rep', text: 'It cuts your refill calls in half.', objection_type: null, clear_steps_hit: ['clarify'], trust: null, skepticism: null, engagement: null, time_pressure: null, created_at: '2026-09-24T09:00:04.000Z' },
]
const doctor = { id: 'd1', style: 'analytical', style_driver: null, style_expressive: null, style_amiable: null, style_analytical: null } as unknown as Doctor

describe('adaptConversationTurns', () => {
  it('maps turns to segments, doctor as counterpart, no audio offsets', () => {
    const { segments } = adaptConversationTurns(turns, doctor)
    expect(segments[0]).toEqual({ segmentIndex: 0, speakerRole: 'counterpart', text: 'Why should I switch?', startMs: null, endMs: null, createdAt: '2026-09-24T09:00:00.000Z' })
    expect(segments[1].speakerRole).toBe('rep')
  })
  it('resolves the doctor persona style via the legacy single-style field, flagged as simulation', () => {
    const { context } = adaptConversationTurns(turns, doctor)
    expect(context.isSimulation).toBe(true)
    expect(context.simulationPersona?.style).toBe('analytical')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/report/adapters/fromConversationTurns.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/report/adapters/fromConversationTurns.ts
import type { ConversationTurn, Doctor } from '@/types/game'
import { resolveDoctorStyleProfile } from '@/lib/session-evaluator'
import type { TranscriptSegment, ReportContext } from '@/schemas/conversationReport'

export function adaptConversationTurns(turns: ConversationTurn[], doctor: Doctor): { segments: TranscriptSegment[]; context: ReportContext } {
  const segments: TranscriptSegment[] = turns.map(t => ({
    segmentIndex: t.turn_index,
    speakerRole: t.role === 'rep' ? 'rep' : 'counterpart',
    text: t.text,
    startMs: null,
    endMs: null,
    createdAt: t.created_at,
  }))

  const profile = resolveDoctorStyleProfile(doctor)
  const context: ReportContext = {
    objective: doctor.meeting_stage ?? null,
    productContext: doctor.product_context ?? null,
    isSimulation: true,
    simulationPersona: { style: profile.dominant, hiddenConcern: doctor.hidden_concern ?? null },
    savedCounterpartStyle: null,
    deterministicMetrics: {},
    qualityFlags: turns.length < 6 ? ['short_session'] : [],
  }
  return { segments, context }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/report/adapters/fromConversationTurns.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/report/adapters/fromConversationTurns.ts src/lib/report/adapters/fromConversationTurns.test.ts
git commit -m "feat: add ai_doctor_voice report adapter"
```

---

## Task 6: Adapter for human-partner roleplay (`human_partner`)

**Files:**
- Create: `src/lib/report/adapters/fromRoleplaySession.ts`
- Test: `src/lib/report/adapters/fromRoleplaySession.test.ts`

**Interfaces:**
- Consumes: rows from `transcript_segments` (Task 1/3) for a given `roleplay_sessions.id`, plus the `roleplay_sessions` row's stored deterministic metrics (`talk_ratio`, `rapid_turn_switches`, `question_ratio`, `open_question_ratio`, `paraphrase_score`, `active_listening_score`, `rep_style`, `partner_style`, `adaptation_score`).
- Produces: `adaptRoleplaySession(segmentRows, sessionRow): { segments: TranscriptSegment[]; context: ReportContext }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/report/adapters/fromRoleplaySession.test.ts
import { describe, it, expect } from 'vitest'
import { adaptRoleplaySession, type RoleplaySessionRow, type TranscriptSegmentRow } from './fromRoleplaySession'

const segmentRows: TranscriptSegmentRow[] = [
  { segment_index: 0, speaker_role: 'rep', text: 'Good morning, thanks for the time.', start_ms: 0, end_ms: 2000 },
  { segment_index: 1, speaker_role: 'counterpart', text: 'I only have ten minutes.', start_ms: 2000, end_ms: 4000 },
]
const sessionRow: RoleplaySessionRow = {
  talk_ratio: 0.55, rapid_turn_switches: 2, question_ratio: 0.3, open_question_ratio: 0.6,
  paraphrase_score: 0.4, active_listening_score: 70, rep_style: 'driver', partner_style: 'analytical', adaptation_score: 60,
}

describe('adaptRoleplaySession', () => {
  it('carries real audio offsets through unchanged', () => {
    const { segments } = adaptRoleplaySession(segmentRows, sessionRow)
    expect(segments[0].startMs).toBe(0)
    expect(segments[1].endMs).toBe(4000)
  })
  it('passes stored deterministic metrics through as context, not simulation', () => {
    const { context } = adaptRoleplaySession(segmentRows, sessionRow)
    expect(context.isSimulation).toBe(false)
    expect(context.savedCounterpartStyle).toBe('analytical')
    expect(context.deterministicMetrics.talkRatio).toBe(0.55)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/report/adapters/fromRoleplaySession.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/report/adapters/fromRoleplaySession.ts
import type { TranscriptSegment, ReportContext, SocialStyle } from '@/schemas/conversationReport'
import { isSocialStyle } from '@/schemas/conversationReport'

export interface TranscriptSegmentRow {
  segment_index: number
  speaker_role: 'rep' | 'counterpart'
  text: string
  start_ms: number | null
  end_ms: number | null
}

export interface RoleplaySessionRow {
  talk_ratio: number | null
  rapid_turn_switches: number | null
  question_ratio: number | null
  open_question_ratio: number | null
  paraphrase_score: number | null
  active_listening_score: number | null
  rep_style: string | null
  partner_style: string | null
  adaptation_score: number | null
}

export function adaptRoleplaySession(
  rows: TranscriptSegmentRow[], session: RoleplaySessionRow,
): { segments: TranscriptSegment[]; context: ReportContext } {
  const segments: TranscriptSegment[] = rows.map(r => ({
    segmentIndex: r.segment_index,
    speakerRole: r.speaker_role,
    text: r.text,
    startMs: r.start_ms,
    endMs: r.end_ms,
    createdAt: null,
  }))

  const savedCounterpartStyle: SocialStyle | null = isSocialStyle(session.partner_style) ? session.partner_style : null

  const context: ReportContext = {
    objective: null,
    productContext: null,
    isSimulation: false,
    simulationPersona: null,
    savedCounterpartStyle,
    deterministicMetrics: {
      talkRatio: session.talk_ratio, rapidTurnSwitches: session.rapid_turn_switches,
      questionRatio: session.question_ratio, openQuestionRatio: session.open_question_ratio,
      paraphraseScore: session.paraphrase_score, activeListeningScore: session.active_listening_score,
      repStyle: session.rep_style, adaptationScore: session.adaptation_score,
    },
    qualityFlags: rows.length < 10 ? ['short_session'] : [], // MIN_RELIABLE_TURNS in roleplay-core.ts
  }
  return { segments, context }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/report/adapters/fromRoleplaySession.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/report/adapters/fromRoleplaySession.ts src/lib/report/adapters/fromRoleplaySession.test.ts
git commit -m "feat: add human_partner report adapter"
```

---

## Task 7: Customer-visit mode — consent, speaker confirmation, retention, adapter

**Files:**
- Create: `src/app/api/customer-visits/route.ts` (POST creates a visit; requires `consent: true`)
- Create: `src/app/api/customer-visits/[id]/route.ts` (PATCH sets speaker labels / objective / retention / status)
- Create: `src/lib/report/adapters/fromCustomerVisit.ts`
- Test: `src/app/api/customer-visits/route.test.ts`
- Test: `src/lib/report/adapters/fromCustomerVisit.test.ts`

**Interfaces:**
- Consumes: `customer_visits` + `transcript_segments` rows (Task 1), `persistTranscriptSegments` (Task 3), `diarizeAudio`/`DiarizedUtterance` (`src/lib/assemblyai-client.ts`, already exists — reused unchanged).
- Produces: `adaptCustomerVisit(visit, segmentRows): { segments, context }`; a working consent → record → diarize → confirm-speakers → generate-report user flow.

- [ ] **Step 1: Write the failing route test (consent gate)**

```ts
// src/app/api/customer-visits/route.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))

import { POST } from './route'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'

afterEach(() => vi.clearAllMocks())

function mockSupabase(userId = 'rep-1') {
  const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: { id: 'visit-1' }, error: null }) }) }))
  return { auth: { getUser: async () => ({ data: { user: { id: userId } } }) }, from: () => ({ insert }) }
}

const request = (body: unknown) => new Request('http://localhost/api/customer-visits', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

describe('POST /api/customer-visits', () => {
  it('rejects a request that does not confirm consent', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase() as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    const res = await POST(request({ consent: false }))
    expect(res.status).toBe(400)
  })
  it('creates a visit when consent is confirmed', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase() as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    const res = await POST(request({ consent: true, objective: 'Confirm formulary switch', retentionPolicy: 'discard_after_report' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe('visit-1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/customer-visits/route.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Write `src/app/api/customer-visits/route.ts`**

```ts
// src/app/api/customer-visits/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'

const RETENTION_POLICIES = ['discard_after_report', 'retain_90_days', 'retain_indefinite']

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await checkRateLimit('customer-visit-create', user.id, 20, 3600)))
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })

  const body = await request.json().catch(() => null) as {
    consent?: boolean; objective?: string; productContext?: string; retentionPolicy?: string
  } | null
  if (!body || body.consent !== true)
    return NextResponse.json({ error: 'Recording and analysis consent must be explicitly confirmed.' }, { status: 400 })

  const retention_policy = RETENTION_POLICIES.includes(body.retentionPolicy ?? '') ? body.retentionPolicy! : 'discard_after_report'

  const { data, error } = await supabase.from('customer_visits').insert({
    rep_id: user.id,
    objective: body.objective ?? null,
    product_context: body.productContext ?? null,
    retention_policy,
    consent_confirmed_at: new Date().toISOString(),
    status: 'recording',
  }).select('id').single()

  if (error) return NextResponse.json({ error: 'Could not start visit recording' }, { status: 500 })
  return NextResponse.json({ id: data.id })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/customer-visits/route.test.ts`
Expected: PASS

- [ ] **Step 5: Write `src/app/api/customer-visits/[id]/route.ts` (speaker confirmation + retention update)**

```ts
// src/app/api/customer-visits/[id]/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json().catch(() => null) as {
    speakerLabelRep?: string; speakerLabelCustomer?: string; status?: string
  } | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const patch: Record<string, string> = {}
  if (body.speakerLabelRep) patch.speaker_label_rep = body.speakerLabelRep
  if (body.speakerLabelCustomer) patch.speaker_label_customer = body.speakerLabelCustomer
  if (body.status) patch.status = body.status
  patch.updated_at = new Date().toISOString()

  // RLS (rep_id = auth.uid()) is the real authorization check here — this
  // update simply can't touch another rep's row regardless of `id`.
  const { data, error } = await supabase.from('customer_visits').update(patch).eq('id', id).select('id').single()
  if (error || !data) return NextResponse.json({ error: 'Visit not found or not yours' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6: Write the failing adapter test**

```ts
// src/lib/report/adapters/fromCustomerVisit.test.ts
import { describe, it, expect } from 'vitest'
import { adaptCustomerVisit } from './fromCustomerVisit'
import type { TranscriptSegmentRow } from './fromRoleplaySession'

const rows: TranscriptSegmentRow[] = [
  { segment_index: 0, speaker_role: 'rep', text: 'Thanks for seeing me today.', start_ms: 0, end_ms: 1500 },
]
const visit = {
  objective: 'Confirm switch to new formulation', product_context: 'Cardio line', retention_policy: 'discard_after_report' as const,
}

describe('adaptCustomerVisit', () => {
  it('carries the stated objective/product context through, never invents one', () => {
    const { context } = adaptCustomerVisit(rows, visit)
    expect(context.objective).toBe('Confirm switch to new formulation')
    expect(context.isSimulation).toBe(false)
  })
  it('flags a real customer session with no saved style profile', () => {
    const { context } = adaptCustomerVisit(rows, visit)
    expect(context.savedCounterpartStyle).toBeNull()
  })
})
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run src/lib/report/adapters/fromCustomerVisit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 8: Write `src/lib/report/adapters/fromCustomerVisit.ts`**

```ts
// src/lib/report/adapters/fromCustomerVisit.ts
import type { TranscriptSegment, ReportContext } from '@/schemas/conversationReport'
import type { TranscriptSegmentRow } from './fromRoleplaySession'

export interface CustomerVisitRow {
  objective: string | null
  product_context: string | null
  retention_policy: 'discard_after_report' | 'retain_90_days' | 'retain_indefinite'
}

export function adaptCustomerVisit(
  rows: TranscriptSegmentRow[], visit: CustomerVisitRow,
): { segments: TranscriptSegment[]; context: ReportContext } {
  const segments: TranscriptSegment[] = rows.map(r => ({
    segmentIndex: r.segment_index,
    speakerRole: r.speaker_role,
    text: r.text,
    startMs: r.start_ms,
    endMs: r.end_ms,
    createdAt: null,
  }))
  const context: ReportContext = {
    objective: visit.objective,
    productContext: visit.product_context,
    isSimulation: false,
    simulationPersona: null,
    savedCounterpartStyle: null, // no prior recorded profile for a real customer exists yet
    deterministicMetrics: {},
    qualityFlags: rows.length < 10 ? ['short_session'] : [],
  }
  return { segments, context }
}
```

- [ ] **Step 9: Run both new tests to verify they pass**

Run: `npx vitest run src/app/api/customer-visits src/lib/report/adapters/fromCustomerVisit.test.ts`
Expected: PASS

- [ ] **Step 10: Write `src/hooks/useCustomerVisitRecorder.ts` — the actual capture/diarize/persist glue**

Tasks 1–9 above build the customer-visit backend (consent record, speaker-label patch, adapter) but nothing yet actually records and diarizes a customer-visit conversation. This step closes that gap with a hook parallel to `useRoleplayRecorder.ts` but deliberately simpler: it does NOT capture pitch/silence samples or run `roleplay-core`'s acoustic social-style classifier (`processAcousticData`/`classifySocialStyle`) — a real customer visit's social-style read comes from the text-based `extractSocialSignals` (Task 8) through the LLM report pipeline, not from acoustic analysis, so duplicating `useRoleplayRecorder`'s ~140-line pitch-tracking `autoCorrelate` loop here would be unused code. This keeps the hook to capture → diarize → confirm-speaker → persist, reusing `diarizeAudio` (`src/lib/assemblyai-client.ts`, unchanged) and `persistTranscriptSegments` (Task 3, unchanged) exactly as they exist today.

```ts
// src/hooks/useCustomerVisitRecorder.ts
'use client'
import { useCallback, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { diarizeAudio, DiarizationError, type DiarizedUtterance } from '@/lib/assemblyai-client'
import { persistTranscriptSegments } from '@/lib/transcript-segments'

export type VisitRecorderPhase = 'idle' | 'recording' | 'processing' | 'pick-speaker' | 'saving' | 'done' | 'error'

export interface RawSpeakerPreview { speaker: string; sample: string }

/** Records, diarizes, and stores the transcript for one consented
 * customer-visit recording (`visitId` = a `customer_visits.id` already
 * created via POST /api/customer-visits). Does not compute acoustic
 * metrics — this session type's social-style read is text-based
 * (extractSocialSignals, Task 8), not acoustic. */
export function useCustomerVisitRecorder(visitId: string) {
  const supabase = createClient()
  const [phase, setPhase] = useState<VisitRecorderPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [speakerPreviews, setSpeakerPreviews] = useState<RawSpeakerPreview[]>([])
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const utterancesRef = useRef<DiarizedUtterance[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, autoGainControl: false } })
      streamRef.current = stream
      const mediaRec = new MediaRecorder(stream)
      mediaRecRef.current = mediaRec
      chunksRef.current = []
      mediaRec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mediaRec.start()
      setPhase('recording')
      setError(null)
    } catch {
      setError('mic')
      setPhase('error')
    }
  }, [])

  const stop = useCallback(async () => {
    const mediaRec = mediaRecRef.current
    if (!mediaRec) return
    setPhase('processing')
    const blob = await new Promise<Blob>(resolve => {
      mediaRec.onstop = () => resolve(new Blob(chunksRef.current, { type: mediaRec.mimeType || 'audio/webm' }))
      mediaRec.stop()
    })
    streamRef.current?.getTracks().forEach(t => t.stop())
    try {
      const utterances = await diarizeAudio(blob)
      utterancesRef.current = utterances
      const bySpeaker = new Map<string, string>()
      for (const u of utterances) if (!bySpeaker.has(u.speaker)) bySpeaker.set(u.speaker, u.text)
      setSpeakerPreviews([...bySpeaker.entries()].map(([speaker, sample]) => ({ speaker, sample })))
      setPhase('pick-speaker')
    } catch (err) {
      setError(err instanceof DiarizationError ? err.code : 'diarize')
      setPhase('error')
    }
  }, [])

  const confirmSpeaker = useCallback(async (repSpeaker: string) => {
    setPhase('saving')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('session'); setPhase('error'); return }

    const otherSpeaker = speakerPreviews.find(p => p.speaker !== repSpeaker)?.speaker ?? null
    await supabase.from('customer_visits').update({
      speaker_label_rep: repSpeaker, speaker_label_customer: otherSpeaker, status: 'ready', updated_at: new Date().toISOString(),
    }).eq('id', visitId)

    const result = await persistTranscriptSegments(supabase, {
      utterances: utterancesRef.current.map(u => ({ speaker: u.speaker, text: u.text, start: u.start, end: u.end })),
      repSpeaker, sessionType: 'customer_visit', sessionId: visitId, repId: user.id, transcriptVersion: 1,
    })
    if (!result.ok) { setError('speakers'); setPhase('error'); return }
    setPhase('done')
  }, [supabase, visitId, speakerPreviews])

  return { phase, error, speakerPreviews, start, stop, confirmSpeaker }
}
```

- [ ] **Step 11: Manually verify the hook compiles and the flow type-checks**

Run: `npx tsc --noEmit`
Expected: no new type errors introduced by this file.

- [ ] **Step 12: Note the deferred scope in the ledger (controller step, not implementer)**

This plan builds the customer-visit backend and recording hook completely, but does **not** add a navigation entry point (a button/screen reachable from `VisitPrep.tsx` or `Colleagues.tsx`, the two existing places `RoleplayRecorder` is invoked) that lets a rep actually reach this hook in the app. Wiring that in requires reading those two screens' current UX flow in more depth than this plan's investigation covered — guessing at it risks a broken or unreachable nav entry. **The implementer for this task must add a ledger note recording this as an explicit deferred-scope item, not silently skip it.** A short follow-up task ("add a 'Record customer visit' entry to VisitPrep.tsx calling `useCustomerVisitRecorder`") is the natural next step once this plan ships.

- [ ] **Step 13: Commit**

```bash
git add src/app/api/customer-visits src/lib/report/adapters/fromCustomerVisit.ts src/lib/report/adapters/fromCustomerVisit.test.ts src/hooks/useCustomerVisitRecorder.ts
git commit -m "feat: add consented real-customer-visit recording mode"
```

---

## Task 8: Deterministic social-style signal extraction (EN + Iraqi Arabic)

**Files:**
- Create: `src/lib/report/socialSignals.ts`
- Test: `src/lib/report/socialSignals.test.ts`

**Interfaces:**
- Consumes: `TranscriptSegment[]` (Task 2).
- Produces: `extractSocialSignals(segments: TranscriptSegment[], speakerRole: 'rep' | 'counterpart'): SocialStyleSignal[]` — fed into `buildReportPrompt` (Task 9) as deterministic evidence the model may narrate around but not invent.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/report/socialSignals.test.ts
import { describe, it, expect } from 'vitest'
import { extractSocialSignals } from './socialSignals'
import type { TranscriptSegment } from '@/schemas/conversationReport'

function seg(i: number, role: 'rep' | 'counterpart', text: string): TranscriptSegment {
  return { segmentIndex: i, speakerRole: role, text, startMs: null, endMs: null, createdAt: null }
}

describe('extractSocialSignals', () => {
  it('detects a directness/brevity signal in English', () => {
    const segments = [seg(0, 'counterpart', 'Just give me the bottom line, I do not have time for details.')]
    const signals = extractSocialSignals(segments, 'counterpart')
    expect(signals.some(s => s.category === 'directness')).toBe(true)
  })
  it('detects a detail/evidence request in Iraqi Arabic', () => {
    const segments = [seg(0, 'counterpart', 'شنو الدليل او الدراسة الي تثبت هذا الكلام؟')]
    const signals = extractSocialSignals(segments, 'counterpart')
    expect(signals.some(s => s.category === 'detail_request')).toBe(true)
  })
  it('detects a relationship/acknowledgement signal in Iraqi Arabic', () => {
    const segments = [seg(0, 'counterpart', 'شلونك حبيبي، شخبار العائلة؟')]
    const signals = extractSocialSignals(segments, 'counterpart')
    expect(signals.some(s => s.category === 'relationship_language')).toBe(true)
  })
  it('returns evidence pointing at the real segment', () => {
    const segments = [seg(2, 'counterpart', 'Can we move faster on this decision?')]
    const signals = extractSocialSignals(segments, 'counterpart')
    expect(signals[0].evidence).toEqual({ segmentIndex: 2, speakerRole: 'counterpart', quote: 'Can we move faster on this decision?' })
  })
  it('only reads segments from the requested speaker', () => {
    const segments = [seg(0, 'rep', 'Just the bottom line for you.'), seg(1, 'counterpart', 'Take your time explaining.')]
    const signals = extractSocialSignals(segments, 'counterpart')
    expect(signals.every(s => s.evidence.segmentIndex === 1)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/report/socialSignals.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Follow `classifyQuestions()`'s existing EN+Iraqi-Arabic regex pattern in `src/lib/roleplay-core.ts:198` for diacritic/hamza-insensitive matching style.

```ts
// src/lib/report/socialSignals.ts
import type { TranscriptSegment, SocialStyleSignal, SignalCategory } from '@/schemas/conversationReport'

interface SignalRule { category: SignalCategory; pattern: RegExp }

// English + Iraqi Arabic (colloquial, not MSA) patterns. Kept deliberately
// small and literal — this is evidence extraction, not sentiment analysis;
// false negatives (missed signal) are safe, false positives are not, so
// each pattern targets a specific, unambiguous phrasing rather than a broad
// keyword.
const RULES: SignalRule[] = [
  { category: 'directness', pattern: /\b(bottom line|just tell me|get to the point|quickly|no time for details)\b|بسرعة|خلص|بالمختصر|ماعندي وكت/i },
  { category: 'detail_request', pattern: /\b(evidence|study|studies|data|proof|compare|comparison|source)\b|دليل|دراسة|بيانات|مصدر|قارن/i },
  { category: 'results_focus', pattern: /\b(results?|outcome|decision|faster|move (this |the )?forward)\b|نتيجة|نتائج|قرار|اسرع/i },
  { category: 'relationship_language', pattern: /\b(how (are|is) (you|your family)|appreciate you|good to see you)\b|شلونك|شخبار|حبيبي|العائلة|شكرا الك/i },
  { category: 'possibility_interest', pattern: /\b(what if|possibilit(y|ies)|could this|imagine|down the (road|line))\b|شنو لو|ممكن بالمستقبل|تخيل/i },
  { category: 'reassurance_request', pattern: /\b(are you sure|what happens if|support (after|later)|guarantee)\b|متأكد|شنو الضمان|دعم بعدين/i },
  { category: 'pace_preference', pattern: /\b(more time|slow down|take (your|my) time|not (yet|ready))\b|خذلك وكت|مو جاهز|ببطء/i },
]

export function extractSocialSignals(segments: TranscriptSegment[], speakerRole: 'rep' | 'counterpart'): SocialStyleSignal[] {
  const signals: SocialStyleSignal[] = []
  for (const seg of segments) {
    if (seg.speakerRole !== speakerRole) continue
    for (const rule of RULES) {
      if (rule.pattern.test(seg.text)) {
        signals.push({
          text: seg.text,
          evidence: { segmentIndex: seg.segmentIndex, speakerRole: seg.speakerRole, quote: seg.text },
          category: rule.category,
        })
        break // one signal per segment keeps the strongest-match, avoids over-counting a single line
      }
    }
  }
  return signals
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/report/socialSignals.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/report/socialSignals.ts src/lib/report/socialSignals.test.ts
git commit -m "feat: add deterministic EN/Iraqi-Arabic social-style signal extraction"
```

---

## Task 9: Report prompt builder

**Files:**
- Create: `src/lib/report/buildReportPrompt.ts`
- Test: `src/lib/report/buildReportPrompt.test.ts`

**Interfaces:**
- Consumes: `TranscriptSegment[]`, `ReportContext` (Task 2), `SocialStyleSignal[]` from both `extractSocialSignals` calls (Task 8).
- Produces: `buildReportPrompt(segments, context, signals): { system: string; prompt: string; maxTokens: number }` — fed directly to `createAnthropicComplete` (Task 12).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/report/buildReportPrompt.test.ts
import { describe, it, expect } from 'vitest'
import { buildReportPrompt, SYSTEM } from './buildReportPrompt'
import type { TranscriptSegment, ReportContext } from '@/schemas/conversationReport'

const segments: TranscriptSegment[] = [
  { segmentIndex: 0, speakerRole: 'counterpart', text: 'I have five minutes only.', startMs: 0, endMs: 2000, createdAt: null },
  { segmentIndex: 1, speakerRole: 'rep', text: 'Understood, I will be brief.', startMs: 2000, endMs: 4000, createdAt: null },
]
const context: ReportContext = {
  objective: 'Introduce new formulation', productContext: null, isSimulation: true,
  simulationPersona: { style: 'driver', hiddenConcern: 'cost' }, savedCounterpartStyle: null,
  deterministicMetrics: { talkRatio: 0.5 }, qualityFlags: [],
}

describe('buildReportPrompt', () => {
  it('includes every segment indexed, never renumbered', () => {
    const { prompt } = buildReportPrompt(segments, context, [])
    expect(prompt).toContain('[0] counterpart: I have five minutes only.')
    expect(prompt).toContain('[1] rep: Understood, I will be brief.')
  })
  it('tells the model to cite segmentIndex only, never quote text itself', () => {
    const { prompt } = buildReportPrompt(segments, context, [])
    expect(prompt.toLowerCase()).toContain('segmentindex')
    expect(prompt.toLowerCase()).toMatch(/do not (include|write) the quoted text/)
  })
  it('marks a simulation persona as configuration, not customer data, in the prompt', () => {
    const { prompt } = buildReportPrompt(segments, context, [])
    expect(prompt).toMatch(/simulation.*persona|persona.*simulation/i)
    expect(prompt).not.toMatch(/customer('s)? (trust|hidden concern)/i)
  })
  it('forbids inventing an objective when none was supplied', () => {
    const noObjective = { ...context, objective: null }
    const { prompt } = buildReportPrompt(segments, noObjective, [])
    expect(prompt).toMatch(/no objective was (supplied|given|stated)/i)
  })
  it('system prompt forbids fabricating commitments/dates/scores', () => {
    expect(SYSTEM.toLowerCase()).toMatch(/never invent/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/report/buildReportPrompt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/report/buildReportPrompt.ts
import type { TranscriptSegment, ReportContext, SocialStyleSignal } from '@/schemas/conversationReport'

export const SYSTEM = 'You are an objective sales-conversation analyst, not a clinician. ' +
  'You write evidence-based reports for a medical sales rep about their own conversation. ' +
  'Never invent a quote, a score, a date, an owner, an agreement, a hidden emotion, or a fact ' +
  'not present in the transcript. Never present a simulated persona\'s configuration as real ' +
  'customer information. Never invent clinical data, efficacy numbers, or real/branded drug names. ' +
  'When evidence is insufficient, say so explicitly rather than guessing. ' +
  'Output ONLY a single valid JSON object, no markdown fences, no commentary.'

function formatSegments(segments: TranscriptSegment[]): string {
  return segments.map(s => `[${s.segmentIndex}] ${s.speakerRole}: ${s.text}`).join('\n')
}

function formatSignals(label: string, signals: SocialStyleSignal[]): string {
  if (signals.length === 0) return `${label}: none detected.`
  return `${label}:\n` + signals.map(s => `- [${s.evidence.segmentIndex}] (${s.category}) "${s.text}"`).join('\n')
}

export function buildReportPrompt(
  segments: TranscriptSegment[], context: ReportContext,
  counterpartSignals: SocialStyleSignal[], repSignals: SocialStyleSignal[] = [],
): { system: string; prompt: string; maxTokens: number } {
  const objectiveLine = context.objective
    ? `Stated visit objective: ${context.objective}`
    : 'No objective was supplied for this session — do not invent one; say so in visitSummary.'

  const simulationLine = context.isSimulation
    ? `This is a SIMULATION. The counterpart's configured persona (style: ${context.simulationPersona?.style ?? 'unknown'}, ` +
      `hidden concern: ${context.simulationPersona?.hiddenConcern ?? 'none'}) is SIMULATION CONFIGURATION, not customer data. ` +
      'Never describe it as something the customer revealed or that was measured from the conversation.'
    : 'This is a REAL conversation (human colleague or real customer). Do not invent a "hidden concern" or force a style label — insufficient evidence is a valid, expected answer.'

  const prompt = `${objectiveLine}
${simulationLine}
${context.productContext ? `Product context: ${context.productContext}` : ''}

TRANSCRIPT (each line: [segmentIndex] speakerRole: text — "rep" is the sales rep, "counterpart" is the doctor/colleague/customer):
${formatSegments(segments)}

Deterministic measurements already computed (do not recompute or contradict these numbers):
${JSON.stringify(context.deterministicMetrics)}

${formatSignals('Counterpart social-style signals (deterministically detected)', counterpartSignals)}
${formatSignals('Rep social-style signals (deterministically detected)', repSignals)}

Return a single JSON object with these top-level keys: visitSummary, customerUnderstanding, performance,
criticalMoments (max 5), commitments, coachingPriority, strength, socialStyle.

For every piece of evidence, cite ONLY { "segmentIndex": <number>, "speakerRole": "rep"|"counterpart" } —
do NOT include the quoted text yourself; the exact words will be looked up separately from the real
transcript by segmentIndex. A segmentIndex that does not appear in the transcript above will be discarded.

For socialStyle, ground every "possibleStyle" claim in one or more of the listed detected signals via
their segmentIndex — do not assign a style with no matching signal. Use null / "insufficient evidence"
freely; do not force a style onto ambiguous or contradictory signals.

Never claim one behavior caused a reaction merely because it came first in the transcript.`

  return { system: SYSTEM, prompt, maxTokens: 4000 }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/report/buildReportPrompt.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/report/buildReportPrompt.ts src/lib/report/buildReportPrompt.test.ts
git commit -m "feat: add conversation-report LLM prompt builder"
```

---

## Task 10: Grounding — validate and resolve the model's response

**Files:**
- Create: `src/lib/report/groundReport.ts`
- Test: `src/lib/report/groundReport.test.ts`

**Interfaces:**
- Consumes: raw parsed JSON from the model, `TranscriptSegment[]`, `ReportContext`.
- Produces: `groundReport(raw: unknown, segments: TranscriptSegment[], context: ReportContext, opts: { sessionType, transcriptVersion }): ConversationReport | null` — `null` only when the response is unusable (Task 12 retries once, then reports failure, never fakes a result).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/report/groundReport.test.ts
import { describe, it, expect } from 'vitest'
import { groundReport } from './groundReport'
import type { TranscriptSegment, ReportContext } from '@/schemas/conversationReport'

const segments: TranscriptSegment[] = [
  { segmentIndex: 0, speakerRole: 'counterpart', text: 'I have five minutes only, and I need real evidence.', startMs: 0, endMs: 2000, createdAt: null },
  { segmentIndex: 1, speakerRole: 'rep', text: 'Here is the trial summary in one page.', startMs: 2000, endMs: 4000, createdAt: null },
]
const context: ReportContext = {
  objective: 'Introduce switch', productContext: null, isSimulation: false, simulationPersona: null,
  savedCounterpartStyle: null, deterministicMetrics: {}, qualityFlags: [],
}
const base = { sessionType: 'human_partner' as const, transcriptVersion: 1 }

function minimalRaw(overrides: Record<string, unknown> = {}) {
  return {
    visitSummary: { objective: 'Introduce switch', summary: 'Short visit.', objectiveStatus: 'partial', objectiveStatusReason: 'Time ran out.', evidence: [{ segmentIndex: 0, speakerRole: 'counterpart' }] },
    customerUnderstanding: { needs: [], concerns: [], decisionCriteria: [], openQuestions: [] },
    performance: [],
    criticalMoments: [],
    commitments: [],
    coachingPriority: { behavior: 'Ask before pitching', evidence: [{ segmentIndex: 1, speakerRole: 'rep' }], betterPhrase: 'What matters most to you today?', practiceExercise: 'Practice one open question.', successLooksLike: 'Customer answers with a need.' },
    strength: { behavior: 'Stayed brief', evidence: [{ segmentIndex: 1, speakerRole: 'rep' }] },
    socialStyle: { customer: { strongestSignals: [], possibleStyle: null }, rep: { strongestSignals: [], possibleStyle: null }, adaptation: [], signalChanges: [] },
    ...overrides,
  }
}

describe('groundReport', () => {
  it('resolves a real quote and drops a reference to a non-existent segmentIndex', () => {
    const raw = minimalRaw({
      criticalMoments: [
        { evidence: { segmentIndex: 0, speakerRole: 'counterpart' }, observedBehavior: 'Set a time limit', interpretation: 'Time pressure', interpretationCertainty: 'stated', betterResponseExample: null },
        { evidence: { segmentIndex: 99, speakerRole: 'counterpart' }, observedBehavior: 'fabricated', interpretation: 'fabricated', interpretationCertainty: 'stated', betterResponseExample: null },
      ],
    })
    const report = groundReport(raw, segments, context, base)!
    expect(report.criticalMoments).toHaveLength(1)
    expect(report.criticalMoments[0].evidence.quote).toBe('I have five minutes only, and I need real evidence.')
  })
  it('never trusts a model-supplied quote string even if present', () => {
    const raw = minimalRaw()
    ;(raw.coachingPriority.evidence[0] as Record<string, unknown>).quote = 'something the model made up'
    const report = groundReport(raw, segments, context, base)!
    expect(report.coachingPriority.evidence[0].quote).toBe('Here is the trial summary in one page.')
  })
  it('rejects an evidence-less finding entirely rather than keeping it with no support', () => {
    const raw = minimalRaw({
      performance: [{ dimension: 'opening', whatHappened: 'no evidence for this', evidence: [{ segmentIndex: 99, speakerRole: 'rep' }], whyItMattered: 'x', improvement: null }],
    })
    const report = groundReport(raw, segments, context, base)!
    expect(report.performance).toHaveLength(0)
  })
  it('never invents an objective when none was supplied, even if the model writes one', () => {
    const noObjectiveContext = { ...context, objective: null }
    const raw = minimalRaw()
    const report = groundReport(raw, segments, noObjectiveContext, base)!
    expect(report.visitSummary.objective).toBeNull()
  })
  it('labels a simulation persona style as isSimulationSetting, never as a discovered customer style', () => {
    const simContext: ReportContext = { ...context, isSimulation: true, simulationPersona: { style: 'driver', hiddenConcern: 'cost' } }
    const raw = minimalRaw({ socialStyle: { customer: { strongestSignals: [], possibleStyle: 'driver' }, rep: { strongestSignals: [], possibleStyle: null }, adaptation: [], signalChanges: [] } })
    const report = groundReport(raw, segments, simContext, base)!
    expect(report.socialStyle.customer.isSimulationSetting).toBe(true)
    expect(report.socialStyle.customer.savedProfile).toBeNull() // this flow has no independently "saved" profile
  })
  it('drops a commitment whose status is not one of the three valid values rather than defaulting to agreed', () => {
    const raw = minimalRaw({ commitments: [{ action: 'Send samples', status: 'done', owner: null, date: null, evidence: [{ segmentIndex: 1, speakerRole: 'rep' }] }] })
    const report = groundReport(raw, segments, context, base)!
    expect(report.commitments).toHaveLength(0)
  })
  it('returns null for a response with no usable top-level shape', () => {
    expect(groundReport({ nonsense: true }, segments, context, base)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/report/groundReport.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/report/groundReport.ts
import {
  isCertainty, isCommitmentStatus, isObjectiveStatus, isPerformanceDimension, isSocialStyle, isSignalCategory,
  type ConversationReport, type TranscriptSegment, type ReportContext, type EvidenceRef,
  type ReportSessionType,
} from '@/schemas/conversationReport'

const MIN_QUOTE_CHARS = 3

function normalize(s: string): string {
  return s.toLowerCase().replace(/[‘’“”"'`«»]/g, '').replace(/\s+/g, ' ').trim()
}

/** The only place a quote is ever produced. Ignores any `quote` field the
 * model supplied — resolves the real text from the real segment, or drops
 * the reference entirely. Mirrors src/agents/behaviorAnalyst/ground.ts. */
function groundEvidence(raw: unknown, segments: TranscriptSegment[]): EvidenceRef | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  if (typeof e.segmentIndex !== 'number') return null
  const seg = segments.find(s => s.segmentIndex === e.segmentIndex)
  if (!seg) return null
  if (normalize(seg.text).length < MIN_QUOTE_CHARS) return null
  return { segmentIndex: seg.segmentIndex, speakerRole: seg.speakerRole, quote: seg.text }
}

function groundEvidenceList(raw: unknown, segments: TranscriptSegment[]): EvidenceRef[] {
  if (!Array.isArray(raw)) return []
  return raw.map(e => groundEvidence(e, segments)).filter((e): e is EvidenceRef => e !== null)
}

function str(v: unknown, fallback = ''): string { return typeof v === 'string' ? v : fallback }
function strOrNull(v: unknown): string | null { return typeof v === 'string' && v.length > 0 ? v : null }

export function groundReport(
  raw: unknown, segments: TranscriptSegment[], context: ReportContext,
  opts: { sessionType: ReportSessionType; transcriptVersion: number },
): ConversationReport | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  // ── Visit summary ──
  const vs = (r.visitSummary && typeof r.visitSummary === 'object' ? r.visitSummary : {}) as Record<string, unknown>
  const objectiveStatus = isObjectiveStatus(vs.objectiveStatus) ? vs.objectiveStatus : 'insufficient_evidence'
  const visitSummary = {
    sessionType: opts.sessionType,
    objective: context.objective, // NEVER taken from the model — only the app-supplied context can set this
    summary: str(vs.summary),
    objectiveStatus: context.objective ? objectiveStatus : ('insufficient_evidence' as const),
    objectiveStatusReason: context.objective ? str(vs.objectiveStatusReason) : 'No objective was supplied for this session.',
    evidence: groundEvidenceList(vs.evidence, segments),
  }
  if (!visitSummary.summary) return null // an unusable response has no summary at all

  // ── Customer understanding ──
  function groundItems(raw: unknown): { text: string; certainty: 'stated' | 'inferred' | 'not_established'; evidence: EvidenceRef[] }[] {
    if (!Array.isArray(raw)) return []
    return raw.map(item => {
      const it = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
      const evidence = groundEvidenceList(it.evidence, segments)
      const text = str(it.text)
      if (!text || evidence.length === 0) return null
      return { text, certainty: isCertainty(it.certainty) ? it.certainty : 'inferred', evidence }
    }).filter((x): x is NonNullable<typeof x> => x !== null)
  }
  const cu = (r.customerUnderstanding && typeof r.customerUnderstanding === 'object' ? r.customerUnderstanding : {}) as Record<string, unknown>
  const customerUnderstanding = {
    needs: groundItems(cu.needs), concerns: groundItems(cu.concerns),
    decisionCriteria: groundItems(cu.decisionCriteria), openQuestions: groundItems(cu.openQuestions),
  }

  // ── Performance findings ──
  const performance = (Array.isArray(r.performance) ? r.performance : []).map(item => {
    const p = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const evidence = groundEvidenceList(p.evidence, segments)
    const dimension = isPerformanceDimension(p.dimension) ? p.dimension : null
    const whatHappened = str(p.whatHappened)
    if (!dimension || !whatHappened || evidence.length === 0) return null
    return { dimension, whatHappened, evidence, whyItMattered: str(p.whyItMattered), improvement: strOrNull(p.improvement) }
  }).filter((x): x is NonNullable<typeof x> => x !== null)

  // ── Critical moments (max 5) ──
  const criticalMoments = (Array.isArray(r.criticalMoments) ? r.criticalMoments : []).map(item => {
    const m = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const evidence = groundEvidence(m.evidence, segments)
    if (!evidence) return null
    return {
      evidence, observedBehavior: str(m.observedBehavior),
      interpretation: str(m.interpretation),
      interpretationCertainty: isCertainty(m.interpretationCertainty) ? m.interpretationCertainty : 'inferred',
      betterResponseExample: strOrNull(m.betterResponseExample),
    }
  }).filter((x): x is NonNullable<typeof x> => x !== null).slice(0, 5)

  // ── Commitments — status must be exactly one of the three valid values ──
  const commitments = (Array.isArray(r.commitments) ? r.commitments : []).map(item => {
    const c = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const evidence = groundEvidenceList(c.evidence, segments)
    const status = isCommitmentStatus(c.status) ? c.status : null
    const action = str(c.action)
    if (!status || !action || evidence.length === 0) return null
    return { action, status, owner: strOrNull(c.owner), date: strOrNull(c.date), evidence }
  }).filter((x): x is NonNullable<typeof x> => x !== null)

  // ── Coaching priority + strength — required; drop the report if unusable ──
  const cp = (r.coachingPriority && typeof r.coachingPriority === 'object' ? r.coachingPriority : {}) as Record<string, unknown>
  const coachingEvidence = groundEvidenceList(cp.evidence, segments)
  if (!str(cp.behavior) || coachingEvidence.length === 0) return null
  const coachingPriority = {
    behavior: str(cp.behavior), evidence: coachingEvidence, betterPhrase: str(cp.betterPhrase),
    practiceExercise: str(cp.practiceExercise), successLooksLike: str(cp.successLooksLike),
  }

  const sf = (r.strength && typeof r.strength === 'object' ? r.strength : {}) as Record<string, unknown>
  const strengthEvidence = groundEvidenceList(sf.evidence, segments)
  const strength = { behavior: str(sf.behavior, 'Not enough evidence to identify a repeatable strength.'), evidence: strengthEvidence }

  // ── Social style ──
  const ss = (r.socialStyle && typeof r.socialStyle === 'object' ? r.socialStyle : {}) as Record<string, unknown>
  function groundStyleRead(raw: unknown, subject: 'customer' | 'rep'): ConversationReport['socialStyle']['customer'] {
    const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const strongestSignals = (Array.isArray(s.strongestSignals) ? s.strongestSignals : []).map(sig => {
      const g = (sig && typeof sig === 'object' ? sig : {}) as Record<string, unknown>
      const evidence = groundEvidence(g.evidence, segments)
      if (!evidence) return null
      return { text: evidence.quote, evidence, category: isSignalCategory(g.category) ? g.category : 'directness' }
    }).filter((x): x is NonNullable<typeof x> => x !== null)
    // A style claim with zero matching signals is forced to null — never a
    // forced label with no evidence behind it.
    const claimedStyle = isSocialStyle(s.possibleStyle) ? s.possibleStyle : null
    const isSim = subject === 'customer' && context.isSimulation
    return {
      subject,
      strongestSignals,
      possibleStyle: strongestSignals.length > 0 ? claimedStyle : null,
      mixedEvidenceNote: strOrNull(s.mixedEvidenceNote),
      alternativeExplanation: strOrNull(s.alternativeExplanation),
      savedProfile: subject === 'customer' && !isSim ? context.savedCounterpartStyle : null,
      profileDrift: subject === 'customer' && !isSim && context.savedCounterpartStyle != null && claimedStyle != null
        ? claimedStyle !== context.savedCounterpartStyle : false,
      isSimulationSetting: isSim,
    }
  }
  // When it's a simulation, the "customer" read is forced to the configured
  // persona style rather than whatever the model claims to have observed —
  // it is configuration, not a discovery, by construction.
  const customerRead = context.isSimulation
    ? { ...groundStyleRead(ss.customer, 'customer'), possibleStyle: context.simulationPersona?.style ?? null, isSimulationSetting: true }
    : groundStyleRead(ss.customer, 'customer')
  const repRead = groundStyleRead(ss.rep, 'rep')

  const adaptation = (Array.isArray(ss.adaptation) ? ss.adaptation : []).map(item => {
    const a = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const customerSignal = groundEvidence(a.customerSignal, segments)
    const repResponse = groundEvidence(a.repResponse, segments)
    if (!customerSignal || !repResponse) return null
    const assessment = a.assessment === 'well_adapted' || a.assessment === 'mismatched' ? a.assessment : 'insufficient_evidence'
    return { customerSignal, repResponse, assessment, betterResponseExample: strOrNull(a.betterResponseExample), suggestedAdjustment: strOrNull(a.suggestedAdjustment) }
  }).filter((x): x is NonNullable<typeof x> => x !== null)

  const signalChanges = (Array.isArray(ss.signalChanges) ? ss.signalChanges : []).map(item => {
    const c = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const evidence = groundEvidenceList(c.evidence, segments)
    const description = str(c.description)
    if (!description || evidence.length === 0) return null
    return { description, evidence }
  }).filter((x): x is NonNullable<typeof x> => x !== null)

  const cc = (ss.coachingCard && typeof ss.coachingCard === 'object' ? ss.coachingCard : null) as Record<string, unknown> | null
  const coachingCard = cc && customerRead.strongestSignals.length > 0 ? {
    observedSignals: str(cc.observedSignals), possiblePreference: str(cc.possiblePreference),
    evidenceAndAlternative: str(cc.evidenceAndAlternative), repResponse: str(cc.repResponse),
    mostUsefulAdjustment: str(cc.mostUsefulAdjustment), suggestedWordingNextVisit: str(cc.suggestedWordingNextVisit),
  } : null

  return {
    reportSchemaVersion: 1,
    sessionType: opts.sessionType,
    transcriptVersion: opts.transcriptVersion,
    scoringConfigVersion: typeof context.deterministicMetrics.scoringConfigVersion === 'string' ? context.deterministicMetrics.scoringConfigVersion : null,
    generatedAt: new Date().toISOString(),
    visitSummary, customerUnderstanding, performance, criticalMoments,
    voiceMeasurements: [], // filled in by the caller from deterministic data (Task 12) — the model never supplies these
    commitments, coachingPriority, strength,
    socialStyle: { customer: customerRead, rep: repRead, adaptation, signalChanges, coachingCard },
    qualityFlags: context.qualityFlags,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/report/groundReport.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/report/groundReport.ts src/lib/report/groundReport.test.ts
git commit -m "feat: ground conversation-report model output against real transcript evidence"
```

---

## Task 11: Persist the report, supersede outdated versions

**Files:**
- Create: `src/lib/report/persistReport.ts`
- Test: `src/lib/report/persistReport.test.ts`

**Interfaces:**
- Consumes: `ConversationReport` (Task 10), a Supabase client.
- Produces: `persistReport(supabase, report, sessionType, sessionId, repId): Promise<{ ok: true; id: string } | { ok: false; error: string }>` — used by Task 12.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/report/persistReport.test.ts
import { describe, it, expect, vi } from 'vitest'
import { persistReport } from './persistReport'
import type { ConversationReport } from '@/schemas/conversationReport'

const report = { reportSchemaVersion: 1, sessionType: 'human_partner', transcriptVersion: 2 } as unknown as ConversationReport

function mockSupabase() {
  const updateEq = vi.fn(async () => ({ error: null }))
  const insertSelectSingle = vi.fn(async () => ({ data: { id: 'report-2' }, error: null }))
  return {
    from: (table: string) => {
      if (table !== 'conversation_reports') throw new Error('unexpected table')
      return {
        update: () => ({ eq: () => ({ eq: () => ({ lt: updateEq }) }) }),
        insert: () => ({ select: () => ({ single: insertSelectSingle }) }),
      }
    },
    _updateEq: updateEq, _insertSelectSingle: insertSelectSingle,
  }
}

describe('persistReport', () => {
  it('inserts the new report and marks older transcript versions superseded', async () => {
    const supabase = mockSupabase()
    const res = await persistReport(supabase as never, report, 'human_partner', 'sess-1', 'rep-1')
    expect(res).toEqual({ ok: true, id: 'report-2' })
    expect(supabase._insertSelectSingle).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/report/persistReport.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/report/persistReport.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConversationReport, ReportSessionType } from '@/schemas/conversationReport'

export async function persistReport(
  supabase: SupabaseClient, report: ConversationReport,
  sessionType: ReportSessionType, sessionId: string, repId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.from('conversation_reports').insert({
    session_type: sessionType,
    session_id: sessionId,
    rep_id: repId,
    transcript_version: report.transcriptVersion,
    report_schema_version: report.reportSchemaVersion,
    scoring_config_version: report.scoringConfigVersion,
    report,
    status: 'complete',
  }).select('id').single()

  if (error || !data) return { ok: false, error: error?.message ?? 'insert failed' }

  // Mark any prior report for this session with an OLDER transcript version
  // as superseded — the report UI (Task 14) checks superseded_by to show
  // the "outdated" banner. A report with the SAME transcript_version being
  // regenerated is a separate case (retry after failure) and is not marked.
  await supabase.from('conversation_reports')
    .update({ superseded_by: data.id })
    .eq('session_type', sessionType).eq('session_id', sessionId)
    .lt('transcript_version', report.transcriptVersion)

  return { ok: true, id: data.id }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/report/persistReport.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/report/persistReport.ts src/lib/report/persistReport.test.ts
git commit -m "feat: persist conversation reports and supersede outdated transcript versions"
```

---

## Task 12: `/api/reports/generate` — orchestrates the whole pipeline

**Files:**
- Create: `src/app/api/reports/generate/route.ts`
- Test: `src/app/api/reports/generate/route.test.ts`

**Interfaces:**
- Consumes: all four adapters (Tasks 4–7), `extractSocialSignals` (Task 8), `buildReportPrompt` (Task 9), `groundReport` (Task 10), `persistReport` (Task 11), `createAnthropicComplete` (`src/agents/llm.ts`).
- Produces: `POST { sessionType, sessionId }` → `{ reportId, report }` or a typed error, never a fabricated fallback report.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/reports/generate/route.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))

import { POST } from './route'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks() })

const request = (body: unknown) => new Request('http://localhost/api/reports/generate', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

function mockSupabaseForRoleplay(userId = 'rep-1') {
  return {
    auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    from: (table: string) => {
      if (table === 'roleplay_sessions') return { select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: { rep_id: userId, talk_ratio: 0.5, rapid_turn_switches: 1, question_ratio: 0.3, open_question_ratio: 0.5, paraphrase_score: 0.4, active_listening_score: 60, rep_style: 'driver', partner_style: 'analytical', adaptation_score: 50 }, error: null }) }) }) })
      if (table === 'transcript_segments') return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ order: async () => ({ data: [{ segment_index: 0, speaker_role: 'rep', text: 'Hello there, thanks for your time today.', start_ms: 0, end_ms: 2000 }], error: null }) }) }) }) }) }
      if (table === 'conversation_reports') return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'report-1' }, error: null }) }) }), update: () => ({ eq: () => ({ eq: () => ({ lt: async () => ({ error: null }) }) }) }) }
      throw new Error(`unexpected table ${table}`)
    },
  }
}

describe('POST /api/reports/generate', () => {
  it('rejects unauthenticated requests', async () => {
    vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } } as never)
    const res = await POST(request({ sessionType: 'human_partner', sessionId: 's1' }))
    expect(res.status).toBe(401)
  })
  it('rejects an unknown sessionType', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabaseForRoleplay() as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    const res = await POST(request({ sessionType: 'nonsense', sessionId: 's1' }))
    expect(res.status).toBe(400)
  })
  it('returns 502 (never a fabricated report) when the model call fails', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabaseForRoleplay() as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
    vi.stubEnv('ANTHROPIC_API_KEY', 'key')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    const res = await POST(request({ sessionType: 'human_partner', sessionId: 's1' }))
    expect(res.status).toBe(502)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/reports/generate/route.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/app/api/reports/generate/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { createAnthropicComplete } from '@/agents/llm'
import { isReportSessionType, type TranscriptSegment, type ReportContext } from '@/schemas/conversationReport'
import { extractSocialSignals } from '@/lib/report/socialSignals'
import { buildReportPrompt } from '@/lib/report/buildReportPrompt'
import { groundReport } from '@/lib/report/groundReport'
import { persistReport } from '@/lib/report/persistReport'
import { adaptRoleplaySession } from '@/lib/report/adapters/fromRoleplaySession'
import { adaptConversationTurns } from '@/lib/report/adapters/fromConversationTurns'
import { adaptAgentSession } from '@/lib/report/adapters/fromAgentSession'
import { adaptCustomerVisit } from '@/lib/report/adapters/fromCustomerVisit'

const RETRY_NOTE = '\n\nYour previous response was not valid JSON in the exact shape requested, or had no usable evidence. Return ONLY the JSON object, with every evidence reference a real segmentIndex from the transcript above.'

/** Loads the segments+context for a session by reading whichever store that
 * session type actually lives in, then runs its adapter. Returns null when
 * the session doesn't exist or doesn't belong to this rep (RLS also
 * enforces this, but a clear 404 beats an opaque empty-segments report). */
async function loadSessionData(
  supabase: Awaited<ReturnType<typeof createClient>>, sessionType: string, sessionId: string, repId: string,
): Promise<{ segments: TranscriptSegment[]; context: ReportContext; transcriptVersion: number } | null> {
  if (sessionType === 'human_partner' || sessionType === 'customer_visit') {
    const table = sessionType === 'human_partner' ? 'roleplay_sessions' : 'customer_visits'
    const { data: session } = await supabase.from(table).select('*').eq('id', sessionId).eq('rep_id', repId).single()
    if (!session) return null
    const { data: rows } = await supabase.from('transcript_segments')
      .select('*').eq('session_type', sessionType).eq('session_id', sessionId)
      .order('transcript_version', { ascending: false }).order('segment_index', { ascending: true })
    const segmentRows = (rows ?? []) as { segment_index: number; speaker_role: 'rep' | 'counterpart'; text: string; start_ms: number | null; end_ms: number | null; transcript_version: number }[]
    if (segmentRows.length === 0) return null
    const transcriptVersion = segmentRows[0].transcript_version
    const latest = segmentRows.filter(r => r.transcript_version === transcriptVersion)
    const { segments, context } = sessionType === 'human_partner'
      ? adaptRoleplaySession(latest, session) : adaptCustomerVisit(latest, session)
    return { segments, context, transcriptVersion }
  }
  if (sessionType === 'ai_doctor_voice') {
    const { data: turns } = await supabase.from('conversation_turns').select('*').eq('session_id', sessionId).eq('rep_id', repId).order('turn_index')
    if (!turns || turns.length === 0) return null
    const { data: doctor } = await supabase.from('doctors').select('*').eq('id', turns[0].doctor_id).single()
    const { segments, context } = adaptConversationTurns(turns, doctor)
    return { segments, context, transcriptVersion: 1 }
  }
  if (sessionType === 'ai_doctor_text') {
    const { data: row } = await supabase.from('agent_sessions').select('*').eq('id', sessionId).eq('rep_id', repId).single()
    if (!row) return null
    const { segments, context } = adaptAgentSession(row.record)
    return { segments, context, transcriptVersion: 1 }
  }
  return null
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await checkRateLimit('report-generate', user.id, 20, 3600)))
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })

  const body = await request.json().catch(() => null) as { sessionType?: string; sessionId?: string } | null
  if (!body || !isReportSessionType(body.sessionType) || typeof body.sessionId !== 'string')
    return NextResponse.json({ error: 'Invalid sessionType or sessionId' }, { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Report generation is not configured' }, { status: 503 })

  const loaded = await loadSessionData(supabase, body.sessionType, body.sessionId, user.id)
  if (!loaded) return NextResponse.json({ error: 'Session not found or has no transcript yet' }, { status: 404 })
  const { segments, context, transcriptVersion } = loaded

  const counterpartSignals = extractSocialSignals(segments, 'counterpart')
  const repSignals = extractSocialSignals(segments, 'rep')
  const { system, prompt, maxTokens } = buildReportPrompt(segments, context, counterpartSignals, repSignals)

  const complete = createAnthropicComplete(apiKey)
  let report = null
  for (const suffix of ['', RETRY_NOTE]) {
    const raw = await complete({ system, prompt: prompt + suffix, maxTokens })
    if (!raw) continue
    const start = raw.indexOf('{'), end = raw.lastIndexOf('}')
    const parsed = start !== -1 && end > start ? (() => { try { return JSON.parse(raw.slice(start, end + 1)) } catch { return null } })() : null
    report = parsed ? groundReport(parsed, segments, context, { sessionType: body.sessionType, transcriptVersion }) : null
    if (report) break
  }
  // Never replace a failed analysis with a plausible demo result — a real
  // failure surfaces as an error the rep can retry, not a silently invented report.
  if (!report) return NextResponse.json({ error: 'Report generation failed. Please try again.' }, { status: 502 })

  const saved = await persistReport(supabase, report, body.sessionType, body.sessionId, user.id)
  if (!saved.ok) return NextResponse.json({ error: 'Report generated but could not be saved' }, { status: 500 })

  return NextResponse.json({ reportId: saved.id, report })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/reports/generate/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/reports/generate/route.ts src/app/api/reports/generate/route.test.ts
git commit -m "feat: add /api/reports/generate pipeline endpoint"
```

---

## Task 13: `/api/reports/[id]` — fetch + speaker-correction regeneration trigger

**Files:**
- Create: `src/app/api/reports/[id]/route.ts`
- Create: `src/app/api/transcript-segments/correct/route.ts` (bumps `transcript_version`, triggers regen)
- Test: `src/app/api/reports/[id]/route.test.ts`
- Test: `src/app/api/transcript-segments/correct/route.test.ts`

**Interfaces:**
- Consumes: `conversation_reports`, `transcript_segments` tables.
- Produces: `GET /api/reports/[id]` → `{ report, outdated: boolean }`; `POST /api/transcript-segments/correct` → writes a new `transcript_version` with corrected `speaker_role` values and returns the new version number for the client to call `/api/reports/generate` again with.

- [ ] **Step 1: Write the failing fetch-route test**

```ts
// src/app/api/reports/[id]/route.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
import { GET } from './route'
import { createClient } from '@/lib/supabase-server'

afterEach(() => vi.clearAllMocks())

describe('GET /api/reports/[id]', () => {
  it('marks a report outdated when superseded_by is set', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'rep-1' } } }) },
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { report: { a: 1 }, superseded_by: 'report-2' }, error: null }) }) }) }),
    } as never)
    const res = await GET(new Request('http://localhost/api/reports/r1'), { params: Promise.resolve({ id: 'r1' }) })
    const body = await res.json()
    expect(body.outdated).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/reports/[id]/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/app/api/reports/[id]/route.ts`**

```ts
// src/app/api/reports/[id]/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data, error } = await supabase.from('conversation_reports').select('report, superseded_by, status, failure_reason').eq('id', id).single()
  if (error || !data) return NextResponse.json({ error: 'Report not found' }, { status: 404 })

  return NextResponse.json({ report: data.report, outdated: data.superseded_by != null, status: data.status, failureReason: data.failure_reason })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/reports/[id]/route.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing speaker-correction test**

```ts
// src/app/api/transcript-segments/correct/route.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
import { POST } from './route'
import { createClient } from '@/lib/supabase-server'

afterEach(() => vi.clearAllMocks())

const request = (body: unknown) => new Request('http://localhost/api/transcript-segments/correct', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

describe('POST /api/transcript-segments/correct', () => {
  it('writes a new transcript_version with the corrected speaker roles', async () => {
    const insert = vi.fn(async () => ({ error: null }))
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'rep-1' } } }) },
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ order: async () => ({ data: [
          { segment_index: 0, speaker_role: 'counterpart', text: 'hi', start_ms: 0, end_ms: 500, transcript_version: 1 },
          { segment_index: 1, speaker_role: 'rep', text: 'hello', start_ms: 500, end_ms: 900, transcript_version: 1 },
        ], error: null }) }) }),
        insert,
      }),
    } as never)
    const res = await POST(request({ sessionType: 'human_partner', sessionId: 's1', swapSegmentIndexes: [0, 1] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.newTranscriptVersion).toBe(2)
    expect(insert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ segment_index: 0, speaker_role: 'rep', transcript_version: 2 }),
      expect.objectContaining({ segment_index: 1, speaker_role: 'counterpart', transcript_version: 2 }),
    ]))
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/app/api/transcript-segments/correct/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Write `src/app/api/transcript-segments/correct/route.ts`**

```ts
// src/app/api/transcript-segments/correct/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { isReportSessionType } from '@/schemas/conversationReport'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json().catch(() => null) as { sessionType?: string; sessionId?: string; swapSegmentIndexes?: number[] } | null
  if (!body || !isReportSessionType(body.sessionType) || (body.sessionType !== 'human_partner' && body.sessionType !== 'customer_visit') || typeof body.sessionId !== 'string')
    return NextResponse.json({ error: 'Only human_partner or customer_visit sessions have correctable transcripts' }, { status: 400 })

  const { data: rows } = await supabase.from('transcript_segments').select('*')
    .eq('session_type', body.sessionType).eq('session_id', body.sessionId).order('transcript_version', { ascending: false })
  if (!rows || rows.length === 0) return NextResponse.json({ error: 'No transcript found' }, { status: 404 })

  const currentVersion = rows[0].transcript_version
  const latest = rows.filter(r => r.transcript_version === currentVersion) as { segment_index: number; speaker_role: 'rep' | 'counterpart'; text: string; start_ms: number | null; end_ms: number | null }[]
  const swap = new Set(body.swapSegmentIndexes ?? [])
  const newVersion = currentVersion + 1

  const newRows = latest.map(r => ({
    session_type: body.sessionType, session_id: body.sessionId, rep_id: user.id, transcript_version: newVersion,
    segment_index: r.segment_index, text: r.text, start_ms: r.start_ms, end_ms: r.end_ms,
    speaker_role: swap.has(r.segment_index) ? (r.speaker_role === 'rep' ? 'counterpart' : 'rep') : r.speaker_role,
  }))

  const { error } = await supabase.from('transcript_segments').insert(newRows)
  if (error) return NextResponse.json({ error: 'Could not save correction' }, { status: 500 })

  return NextResponse.json({ newTranscriptVersion: newVersion })
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/app/api/transcript-segments/correct/route.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/app/api/reports/[id]/route.ts src/app/api/reports/[id]/route.test.ts src/app/api/transcript-segments/correct
git commit -m "feat: add report fetch + speaker-correction regeneration endpoints"
```

---

## Task 14: `ConversationReport.tsx` — shared report UI

**Files:**
- Create: `src/components/report/ConversationReport.tsx`
- Test: `src/components/report/ConversationReport.test.tsx` (uses `@testing-library/react` + `jsdom`, already a devDependency per the investigation)

**Interfaces:**
- Consumes: `ConversationReport` (Task 2), `useT()` (`src/lib/i18n.tsx`).
- Produces: the component every flow's report screen renders (Task 16 wires it into flow C; flows A/B/D get their own thin wrapper screens in a follow-up, out of scope here per the "one clear responsibility per file" file-structure rule — this task is the renderer only).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/report/ConversationReport.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConversationReport } from './ConversationReport'
import { LangProvider } from '@/lib/i18n'
import type { ConversationReport as Report } from '@/schemas/conversationReport'

function minimalReport(overrides: Partial<Report> = {}): Report {
  return {
    reportSchemaVersion: 1, sessionType: 'human_partner', transcriptVersion: 1, scoringConfigVersion: null,
    generatedAt: '2026-09-24T09:00:00.000Z',
    visitSummary: { sessionType: 'human_partner', objective: null, summary: 'Short intro visit.', objectiveStatus: 'insufficient_evidence', objectiveStatusReason: 'No objective was supplied for this session.', evidence: [] },
    customerUnderstanding: { needs: [], concerns: [], decisionCriteria: [], openQuestions: [] },
    performance: [], criticalMoments: [], voiceMeasurements: [], commitments: [],
    coachingPriority: { behavior: 'Ask before pitching', evidence: [{ segmentIndex: 0, speakerRole: 'rep', quote: 'Let me tell you about our product.' }], betterPhrase: 'What matters most to you today?', practiceExercise: 'Practice one open question.', successLooksLike: 'Customer answers with a need.' },
    strength: { behavior: 'Stayed on time', evidence: [] },
    socialStyle: { customer: { subject: 'customer', strongestSignals: [], possibleStyle: null, mixedEvidenceNote: null, alternativeExplanation: null, savedProfile: null, profileDrift: false, isSimulationSetting: false }, rep: { subject: 'rep', strongestSignals: [], possibleStyle: null, mixedEvidenceNote: null, alternativeExplanation: null, savedProfile: null, profileDrift: false, isSimulationSetting: false }, adaptation: [], signalChanges: [], coachingCard: null },
    qualityFlags: [],
    ...overrides,
  }
}

describe('ConversationReport', () => {
  it('renders the visit summary without inventing an objective when none was supplied', () => {
    render(<LangProvider><ConversationReport report={minimalReport()} outdated={false} /></LangProvider>)
    expect(screen.getByText('Short intro visit.')).toBeInTheDocument()
    expect(screen.queryByText(/objective:/i)?.textContent).not.toMatch(/undefined|null/i)
  })
  it('shows an outdated banner when outdated=true', () => {
    render(<LangProvider><ConversationReport report={minimalReport()} outdated={true} /></LangProvider>)
    expect(screen.getByTestId('report-outdated-banner')).toBeInTheDocument()
  })
  it('never renders a playback control for a segment with no startMs', () => {
    const report = minimalReport({
      coachingPriority: { behavior: 'x', evidence: [{ segmentIndex: 0, speakerRole: 'rep', quote: 'no audio here' }], betterPhrase: 'y', practiceExercise: 'z', successLooksLike: 'w' },
    })
    render(<LangProvider><ConversationReport report={report} outdated={false} audioAvailable={false} /></LangProvider>)
    expect(screen.queryByRole('button', { name: /play/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/report/ConversationReport.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Mirror `TextSimulationReport.tsx`'s existing i18n/RTL/mobile conventions (`useT()`, `dir="auto"`, `maxWidth: 560`, `<details>` for expandable sections) exactly.

```tsx
// src/components/report/ConversationReport.tsx
'use client'
import { useT } from '@/lib/i18n'
import type { ConversationReport as ReportType, EvidenceRef } from '@/schemas/conversationReport'

function Evidence({ evidence, audioAvailable }: { evidence: EvidenceRef; audioAvailable: boolean }) {
  return (
    <blockquote dir="auto" style={{ margin: '4px 0', paddingInlineStart: 12, borderInlineStart: '2px solid #ccc' }}>
      "{evidence.quote}" <span style={{ opacity: 0.6 }}>({evidence.speakerRole})</span>
      {audioAvailable && <button type="button" aria-label="play">▶</button>}
    </blockquote>
  )
}

export function ConversationReport({ report, outdated, audioAvailable = false }: {
  report: ReportType; outdated: boolean; audioAvailable?: boolean
}) {
  const t = useT()
  return (
    <div dir="auto" style={{ maxWidth: 560, margin: '0 auto', padding: 16 }}>
      {outdated && (
        <div data-testid="report-outdated-banner" role="status" style={{ background: '#fff3cd', padding: 8, marginBottom: 12 }}>
          {t('report.outdated')}
        </div>
      )}

      <section>
        <h2>{t('report.visitSummary.title')}</h2>
        <p>{report.visitSummary.summary}</p>
        <p>
          {t('report.visitSummary.objective')}: {report.visitSummary.objective ?? t('report.visitSummary.noObjective')}
        </p>
        <p>{t(`report.objectiveStatus.${report.visitSummary.objectiveStatus}`)} — {report.visitSummary.objectiveStatusReason}</p>
      </section>

      <details>
        <summary>{t('report.customerUnderstanding.title')}</summary>
        {(['needs', 'concerns', 'decisionCriteria', 'openQuestions'] as const).map(key => (
          <div key={key}>
            <h4>{t(`report.customerUnderstanding.${key}`)}</h4>
            {report.customerUnderstanding[key].length === 0
              ? <p>{t('report.noEvidence')}</p>
              : report.customerUnderstanding[key].map((item, i) => (
                <div key={i}>
                  <p>{item.text} <em>({t(`report.certainty.${item.certainty}`)})</em></p>
                  {item.evidence.map((e, j) => <Evidence key={j} evidence={e} audioAvailable={audioAvailable} />)}
                </div>
              ))}
          </div>
        ))}
      </details>

      <details>
        <summary>{t('report.performance.title')}</summary>
        {report.performance.map((p, i) => (
          <div key={i}>
            <h4>{t(`report.performance.dimension.${p.dimension}`)}</h4>
            <p>{p.whatHappened}</p>
            {p.evidence.map((e, j) => <Evidence key={j} evidence={e} audioAvailable={audioAvailable} />)}
            <p><strong>{t('report.performance.whyItMattered')}:</strong> {p.whyItMattered}</p>
            {p.improvement && <p><strong>{t('report.performance.improvement')}:</strong> {p.improvement}</p>}
          </div>
        ))}
      </details>

      <details>
        <summary>{t('report.criticalMoments.title')}</summary>
        {report.criticalMoments.map((m, i) => (
          <div key={i}>
            <Evidence evidence={m.evidence} audioAvailable={audioAvailable} />
            <p>{m.observedBehavior}</p>
            <p><em>{t(`report.certainty.${m.interpretationCertainty}`)}:</em> {m.interpretation}</p>
            {m.betterResponseExample && <p><strong>{t('report.criticalMoments.better')}:</strong> {m.betterResponseExample}</p>}
          </div>
        ))}
      </details>

      <details>
        <summary>{t('report.commitments.title')}</summary>
        {(['agreed', 'proposed', 'ai_recommended'] as const).map(status => (
          <div key={status}>
            <h4>{t(`report.commitments.status.${status}`)}</h4>
            {report.commitments.filter(c => c.status === status).map((c, i) => (
              <div key={i}>
                <p>{c.action} {c.owner && `— ${c.owner}`} {c.date && `(${c.date})`}</p>
                {c.evidence.map((e, j) => <Evidence key={j} evidence={e} audioAvailable={audioAvailable} />)}
              </div>
            ))}
          </div>
        ))}
      </details>

      <section>
        <h2>{t('report.coachingPriority.title')}</h2>
        <p>{report.coachingPriority.behavior}</p>
        {report.coachingPriority.evidence.map((e, i) => <Evidence key={i} evidence={e} audioAvailable={audioAvailable} />)}
        <p><strong>{t('report.coachingPriority.betterPhrase')}:</strong> {report.coachingPriority.betterPhrase}</p>
        <p><strong>{t('report.coachingPriority.practice')}:</strong> {report.coachingPriority.practiceExercise}</p>
        <p><strong>{t('report.coachingPriority.success')}:</strong> {report.coachingPriority.successLooksLike}</p>
        <p><strong>{t('report.strength.title')}:</strong> {report.strength.behavior}</p>
      </section>

      <details>
        <summary>{t('report.socialStyle.title')}</summary>
        {report.socialStyle.coachingCard ? (
          <div>
            <p><strong>{t('report.socialStyle.observedSignals')}:</strong> {report.socialStyle.coachingCard.observedSignals}</p>
            <p><strong>{t('report.socialStyle.possiblePreference')}:</strong> {report.socialStyle.coachingCard.possiblePreference}</p>
            <p><strong>{t('report.socialStyle.evidenceAndAlternative')}:</strong> {report.socialStyle.coachingCard.evidenceAndAlternative}</p>
            <p><strong>{t('report.socialStyle.repResponse')}:</strong> {report.socialStyle.coachingCard.repResponse}</p>
            <p><strong>{t('report.socialStyle.adjustment')}:</strong> {report.socialStyle.coachingCard.mostUsefulAdjustment}</p>
            <p><strong>{t('report.socialStyle.wording')}:</strong> {report.socialStyle.coachingCard.suggestedWordingNextVisit}</p>
          </div>
        ) : <p>{t('report.socialStyle.insufficientEvidence')}</p>}
        {report.socialStyle.customer.isSimulationSetting && <p style={{ opacity: 0.7 }}>{t('report.socialStyle.simulationNote')}</p>}
        {report.socialStyle.customer.profileDrift && <p style={{ color: '#b45309' }}>{t('report.socialStyle.profileDrift')}</p>}
      </details>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/report/ConversationReport.test.tsx`
Expected: PASS (once Task 17's i18n keys exist — if run before Task 17, `t()` returns the key itself per `useT()`'s existing fallback behavior, which does not fail these assertions since they check specific rendered text, not translation-key resolution).

- [ ] **Step 5: Commit**

```bash
git add src/components/report/ConversationReport.tsx src/components/report/ConversationReport.test.tsx
git commit -m "feat: add shared ConversationReport UI component"
```

---

## Task 15: `SocialStyleCard.tsx` extraction (optional visual polish)

**Files:**
- Create: `src/components/report/SocialStyleCard.tsx`
- Modify: `src/components/report/ConversationReport.tsx` (replace the inline social-style `<details>` body with `<SocialStyleCard section={report.socialStyle} />`)
- Test: `src/components/report/SocialStyleCard.test.tsx`

**Interfaces:**
- Consumes: `SocialStyleSection` (Task 2).
- Produces: `SocialStyleCard` — pulled out of Task 14's component once it's clear the section is non-trivial (file-structure rule: split when a section grows its own logic, which the drift/simulation/adaptation-list conditionals below justify).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/report/SocialStyleCard.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SocialStyleCard } from './SocialStyleCard'
import { LangProvider } from '@/lib/i18n'
import type { SocialStyleSection } from '@/schemas/conversationReport'

function section(overrides: Partial<SocialStyleSection> = {}): SocialStyleSection {
  return {
    customer: { subject: 'customer', strongestSignals: [], possibleStyle: null, mixedEvidenceNote: null, alternativeExplanation: null, savedProfile: null, profileDrift: false, isSimulationSetting: false },
    rep: { subject: 'rep', strongestSignals: [], possibleStyle: null, mixedEvidenceNote: null, alternativeExplanation: null, savedProfile: null, profileDrift: false, isSimulationSetting: false },
    adaptation: [], signalChanges: [], coachingCard: null,
    ...overrides,
  }
}

describe('SocialStyleCard', () => {
  it('never renders a bare confidence percentage next to the style label', () => {
    const s = section({ customer: { subject: 'customer', strongestSignals: [{ text: 'x', evidence: { segmentIndex: 0, speakerRole: 'counterpart', quote: 'x' }, category: 'directness' }], possibleStyle: 'driver', mixedEvidenceNote: null, alternativeExplanation: null, savedProfile: null, profileDrift: false, isSimulationSetting: false } })
    render(<LangProvider><SocialStyleCard section={s} /></LangProvider>)
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument()
  })
  it('shows the drift banner when profileDrift is true', () => {
    const s = section({ customer: { subject: 'customer', strongestSignals: [], possibleStyle: 'expressive', mixedEvidenceNote: null, alternativeExplanation: null, savedProfile: 'analytical', profileDrift: true, isSimulationSetting: false } })
    render(<LangProvider><SocialStyleCard section={s} /></LangProvider>)
    expect(screen.getByTestId('social-style-drift')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/report/SocialStyleCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
// src/components/report/SocialStyleCard.tsx
'use client'
import { useT } from '@/lib/i18n'
import type { SocialStyleSection, SocialStyleRead } from '@/schemas/conversationReport'

function StyleRead({ read }: { read: SocialStyleRead }) {
  const t = useT()
  return (
    <div>
      <p>
        <strong>{t(`report.socialStyle.subject.${read.subject}`)}:</strong>{' '}
        {read.possibleStyle ? t(`report.socialStyle.style.${read.possibleStyle}`) : t('report.socialStyle.insufficientEvidence')}
        {read.isSimulationSetting && <span style={{ opacity: 0.6 }}> ({t('report.socialStyle.configuredNotDiscovered')})</span>}
      </p>
      {read.mixedEvidenceNote && <p style={{ opacity: 0.8 }}>{read.mixedEvidenceNote}</p>}
      {read.alternativeExplanation && <p style={{ opacity: 0.8 }}>{t('report.socialStyle.alternative')}: {read.alternativeExplanation}</p>}
      {read.profileDrift && (
        <p data-testid="social-style-drift" style={{ color: '#b45309' }}>
          {t('report.socialStyle.driftFrom')} {read.savedProfile ? t(`report.socialStyle.style.${read.savedProfile}`) : ''}
        </p>
      )}
    </div>
  )
}

export function SocialStyleCard({ section }: { section: SocialStyleSection }) {
  const t = useT()
  return (
    <div>
      <StyleRead read={section.customer} />
      <StyleRead read={section.rep} />
      {section.adaptation.length > 0 && (
        <div>
          <h4>{t('report.socialStyle.adaptation')}</h4>
          {section.adaptation.map((a, i) => (
            <p key={i}>{t(`report.socialStyle.assessment.${a.assessment}`)} — {a.suggestedAdjustment}</p>
          ))}
        </div>
      )}
      {section.coachingCard && (
        <div>
          <p><strong>{t('report.socialStyle.wording')}:</strong> {section.coachingCard.suggestedWordingNextVisit}</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Update `ConversationReport.tsx`** — replace the inline social-style `<details>` body (Task 14 Step 3, the `report.socialStyle.title` section) with:

```tsx
<details>
  <summary>{t('report.socialStyle.title')}</summary>
  <SocialStyleCard section={report.socialStyle} />
</details>
```

and add `import { SocialStyleCard } from './SocialStyleCard'` to its imports.

- [ ] **Step 5: Run both component test files to verify they pass**

Run: `npx vitest run src/components/report`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/report/SocialStyleCard.tsx src/components/report/SocialStyleCard.test.tsx src/components/report/ConversationReport.tsx
git commit -m "feat: extract SocialStyleCard, never render a bare style-confidence percentage"
```

---

## Task 16: Migrate flow C (AI Doctor text simulation) onto the new pipeline; retire `TextSimulationReport.tsx`

**Files:**
- Modify: whichever page/component currently renders `<TextSimulationReport />` (locate via `grep -rn "TextSimulationReport" src/app src/components`)
- Modify: `src/agents/orchestrator/index.ts` or its calling route — after `phase: 'reported'`, call `POST /api/reports/generate` with `{ sessionType: 'ai_doctor_text', sessionId }` instead of (or in addition to, during transition) using `assembleReport()`'s existing `SessionReport`
- Delete: `src/components/game/TextSimulationReport.tsx` (only after the replacement is verified rendering correctly — do this as the last step)
- Test: update or remove `src/components/game/TextSimulationReport.test.tsx` if it exists; add an integration check that the page renders `ConversationReport` for an `ai_doctor_text` session

**Interfaces:**
- Consumes: `ConversationReport` component (Task 14), `/api/reports/generate` (Task 12).
- Produces: one rendering path for flow C, matching the spec's "no dual maintenance of two renderers for the same flow."

- [ ] **Step 1: Find the current call site**

Run: `grep -rln "TextSimulationReport" src/app src/components`
Expected: one or two files — the report screen component and possibly its own test file.

- [ ] **Step 2: Read that call site fully before changing it**

This plan cannot name the exact JSX prop-wiring at that call site without re-reading it live (it wasn't part of the investigation's read set beyond the component itself) — read the file `grep` found, note how it currently obtains the `SessionReport` (likely a `fetch` or a prop from a server component), and how `sessionId`/`phase` are known there.

- [ ] **Step 3: Replace the render**

Replace the `<TextSimulationReport report={...} />` call with:

```tsx
import { ConversationReport } from '@/components/report/ConversationReport'
// ... existing state for sessionId, loading, error ...
const [reportData, setReportData] = useState<{ report: ConversationReportType; outdated: boolean } | null>(null)
useEffect(() => {
  fetch('/api/reports/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionType: 'ai_doctor_text', sessionId }) })
    .then(res => res.json())
    .then(data => data.report && setReportData({ report: data.report, outdated: false }))
}, [sessionId])
// ...
{reportData && <ConversationReport report={reportData.report} outdated={reportData.outdated} />}
```

(Adjust to the file's actual existing data-fetching pattern found in Step 2 — this plan gives the target shape, not a blind copy-paste, since the exact surrounding component structure wasn't in the investigation's read set.)

- [ ] **Step 4: Run the app locally and manually verify one AI Doctor text simulation renders the new report**

Run: `npm run dev`, complete a text simulation through to `phase: 'reported'`, confirm the new report renders with all sections and no console errors.

- [ ] **Step 5: Delete `TextSimulationReport.tsx` and its test**

Run: `git rm src/components/game/TextSimulationReport.tsx` (and its `.test.tsx` if present).

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, with no leftover import of the deleted file.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: migrate AI Doctor text simulation report onto the shared ConversationReport pipeline"
```

---

## Task 17: i18n keys + conditional privacy copy

**Files:**
- Modify: `src/lib/i18n.tsx` (add `report.*` keys to both `EN` and `AR`; fix `privacy.body`)

**Interfaces:**
- Consumes: nothing new.
- Produces: every `t('report.*')` key used in Tasks 14–15, in both languages; a `privacy.body` that no longer unconditionally claims audio is always discarded.

- [ ] **Step 1: Add the EN keys**

In `src/lib/i18n.tsx`'s `EN` dictionary, add:

```ts
'report.outdated': 'This report is based on an earlier version of the transcript. Regenerate it to see the latest.',
'report.noEvidence': 'Not enough evidence in this conversation.',
'report.visitSummary.title': 'Visit summary',
'report.visitSummary.objective': 'Objective',
'report.visitSummary.noObjective': 'No objective was recorded for this session.',
'report.objectiveStatus.achieved': 'Achieved',
'report.objectiveStatus.partial': 'Partially achieved',
'report.objectiveStatus.not_achieved': 'Not achieved',
'report.objectiveStatus.insufficient_evidence': 'Not enough evidence to tell',
'report.customerUnderstanding.title': 'What mattered to the customer',
'report.customerUnderstanding.needs': 'Needs',
'report.customerUnderstanding.concerns': 'Concerns',
'report.customerUnderstanding.decisionCriteria': 'Decision criteria',
'report.customerUnderstanding.openQuestions': 'Still unanswered',
'report.certainty.stated': 'Customer said this directly',
'report.certainty.inferred': 'Possible interpretation',
'report.certainty.not_established': 'Not established',
'report.performance.title': 'How the rep responded',
'report.performance.whyItMattered': 'Why it mattered',
'report.performance.improvement': 'One thing to try',
'report.performance.dimension.opening': 'Opening',
'report.performance.dimension.questioning': 'Questioning',
'report.performance.dimension.listening': 'Listening',
'report.performance.dimension.value_linking': 'Linking value to needs',
'report.performance.dimension.evidence_use': 'Using evidence',
'report.performance.dimension.objection_handling': 'Handling objections',
'report.performance.dimension.adaptation': 'Adapting to the customer',
'report.performance.dimension.closing': 'Closing',
'report.criticalMoments.title': 'Critical moments',
'report.criticalMoments.better': 'A better response could have been',
'report.commitments.title': 'What was agreed',
'report.commitments.status.agreed': 'Agreed',
'report.commitments.status.proposed': 'Proposed, not yet accepted',
'report.commitments.status.ai_recommended': 'Suggested follow-up',
'report.coachingPriority.title': 'One behaviour to practise',
'report.coachingPriority.betterPhrase': 'Try saying',
'report.coachingPriority.practice': 'Practice exercise',
'report.coachingPriority.success': 'What success looks like next time',
'report.strength.title': 'Keep doing this',
'report.socialStyle.title': 'Communication style',
'report.socialStyle.subject.customer': 'Customer',
'report.socialStyle.subject.rep': 'Rep',
'report.socialStyle.style.driver': 'Direct and results-focused',
'report.socialStyle.style.expressive': 'Enthusiastic and big-picture',
'report.socialStyle.style.amiable': 'Relationship-focused and steady',
'report.socialStyle.style.analytical': 'Detail-focused and cautious',
'report.socialStyle.insufficientEvidence': 'Not enough evidence in this conversation to describe a style.',
'report.socialStyle.configuredNotDiscovered': 'a simulation setting, not something discovered from the conversation',
'report.socialStyle.simulationNote': 'This conversation was a simulation — the doctor\'s style was configured, not observed from a real customer.',
'report.socialStyle.alternative': 'Alternative explanation',
'report.socialStyle.driftFrom': 'This session\'s signals differ from the previously recorded profile of',
'report.socialStyle.profileDrift': 'This session\'s signals differ from the saved profile — worth a second look.',
'report.socialStyle.adaptation': 'How the rep adapted',
'report.socialStyle.assessment.well_adapted': 'Well adapted',
'report.socialStyle.assessment.mismatched': 'Mismatched',
'report.socialStyle.assessment.insufficient_evidence': 'Not enough evidence',
'report.socialStyle.observedSignals': 'Observed signals',
'report.socialStyle.possiblePreference': 'Possible preference',
'report.socialStyle.evidenceAndAlternative': 'Evidence and alternative explanation',
'report.socialStyle.repResponse': 'How the rep responded',
'report.socialStyle.adjustment': 'Most useful adjustment',
'report.socialStyle.wording': 'Suggested wording for next visit',
```

- [ ] **Step 2: Add the matching AR (Iraqi-dialect-appropriate business Arabic) keys**

Add the same keys to the `AR` dictionary with natural Arabic translations, following the existing tone/register of nearby `sim.report.*` keys already in the file (read a handful of those for register before writing these). Example for the first few (translate the rest the same way, keeping business register, no literal machine-translation artifacts):

```ts
'report.outdated': 'هذا التقرير مبني على نسخة سابقة من المحادثة. أعد إنشاءه لرؤية آخر تحديث.',
'report.noEvidence': 'لا توجد أدلة كافية في هذه المحادثة.',
'report.visitSummary.title': 'ملخص الزيارة',
'report.visitSummary.objective': 'الهدف',
'report.visitSummary.noObjective': 'لم يتم تسجيل هدف لهذه الجلسة.',
// ... continue for every key added in Step 1, same keys, Arabic values.
```

- [ ] **Step 3: Make `privacy.body` conditional on retention policy**

Find the current `EN['privacy.body']` / `AR['privacy.body']` entries (unconditional "audio always discarded" claim). Change the copy to describe the default behavior accurately without a blanket promise that becomes false for `customer_visit` sessions with retention:

```ts
'privacy.body': 'Practice recordings are analyzed and the audio itself is discarded right after processing, unless you explicitly choose to keep it for a real-customer visit recording — in that case it is stored securely under your account until you delete it or your chosen retention period ends.',
```

Apply the equivalent change to `AR['privacy.body']`.

- [ ] **Step 4: Run the report component tests again to confirm real translated text renders**

Run: `npx vitest run src/components/report`
Expected: PASS, with the specific-text assertions (Task 14's `getByText('Short intro visit.')` etc.) still passing since those come from the report data, not i18n — and no console warnings about missing keys if `useT()` warns on miss (check `src/lib/i18n.tsx`'s `useT()` implementation for this behavior and confirm no warnings fire in test output).

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n.tsx
git commit -m "feat: add conversation-report i18n keys, fix unconditional audio-discard privacy copy"
```

---

## Task 18: Test suite for the Review Focus items and full regression pass

**Files:**
- Create: `src/lib/report/groundReport.rls.test.md` — NO, this repo has no SQL/RLS test runner; instead:
- Create: `docs/superpowers/specs/2026-09-24-conversation-analysis-report-rls-verification.md` (manual verification checklist, run once against the applied migration via `supabase` MCP tools or SQL editor, since this repo's test suite is TypeScript/Vitest-only and has no existing RLS test harness to extend)
- Modify: `src/lib/report/groundReport.test.ts` (add the two extra cases below if not already covered by Task 10's tests — cross-check first)
- Modify: `src/lib/report/socialSignals.test.ts` (already covers EN+Iraqi-Arabic per Task 8 — cross-check coverage against this task's list, add any gap)
- Run: full existing suite to confirm zero regressions in `roleplay-core.ts`, `session-evaluator.ts`, `scoring/engine.ts` tests (none of those files were modified by this plan)

**Interfaces:**
- Consumes: everything built in Tasks 1–17.
- Produces: the explicit coverage the product spec's §8 demanded, cross-checked against what Tasks 2–17 already wrote rather than duplicated.

- [ ] **Step 1: Cross-check existing coverage against the product spec's §8 list**

Run: `npx vitest run src/lib/report src/schemas/conversationReport src/app/api/reports src/app/api/customer-visits src/app/api/transcript-segments src/components/report`
Expected: PASS. Read the output test names against this checklist:
- Invalid evidence references / fabricated quotes → covered by Task 10 Steps 1 (two tests).
- Missing timestamps → covered by Task 14 Step 1 (no-playback-control test) and Task 4/5's `startMs: null` assertions.
- Speaker corrections → covered by Task 13 Step 5.
- Insufficient evidence → covered by Task 10 (evidence-less finding dropped) and Task 15 (`insufficientEvidence` render path).
- Proposed vs agreed actions → covered by Task 10's commitment-status test and Task 14's grouped-by-status render.
- English and Iraqi Arabic examples → covered by Task 8.
- Existing practice-flow compatibility → covered by Step 3 below.

- [ ] **Step 2: Add the one gap this plan's tasks don't yet cover — access control on the three new tables**

Since this repo has no SQL/RLS test harness, write the manual verification doc instead of a unit test (matches the "No Placeholders" rule: this is real, executable content, just not a Vitest file):

```markdown
<!-- docs/superpowers/specs/2026-09-24-conversation-analysis-report-rls-verification.md -->
# RLS verification — transcript_segments, customer_visits, conversation_reports

Run once against the applied migration (033), via the Supabase SQL editor or
`supabase` MCP `execute_sql`, using two real auth users' JWTs (rep A, rep B):

1. As rep A, insert a `customer_visits` row. As rep B, `select * from customer_visits where rep_id = '<rep A id>'` — expect zero rows (RLS blocks it), not an error.
2. As rep A, insert `transcript_segments` for that visit. As rep B, attempt the same `select` — expect zero rows.
3. As rep A, insert a `conversation_reports` row referencing that visit. As rep B, attempt `select`/`update`/`delete` on that row's `id` — expect zero rows affected / permission denied, never a successful cross-rep read or write.
4. As rep A, `delete from customer_visits where id = '<the visit>'` — expect success (rep can delete their own real-customer data on request, satisfying the product spec's retention/deletion requirement).

Record the actual result of each step here with a date once run. This
checklist exists because this repo's test suite (Vitest) has no SQL/RLS
runner — do not skip it as "covered by unit tests," since none of Tasks
1–17 executes real Postgres RLS.
```

- [ ] **Step 3: Run the full existing suite to confirm zero regressions**

Run: `npx vitest run`
Expected: PASS — every existing test in `src/lib/roleplay-core.test.ts` (if present), `src/lib/session-evaluator.test.ts`, `src/scoring/engine.test.ts`, `src/agents/**/*.test.ts` still passes unmodified, since no task in this plan edited any of those files' logic (only `useRoleplayRecorder.ts` gained an additive call in Task 3, which does not change `buildRoleplayResult`'s existing behavior or its own untouched tests).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-24-conversation-analysis-report-rls-verification.md
git commit -m "docs: add RLS verification checklist for the new conversation-report tables"
```
