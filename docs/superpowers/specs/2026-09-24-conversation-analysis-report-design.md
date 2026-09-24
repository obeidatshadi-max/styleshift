# Conversation Analysis Report — Design

## Purpose

StyleShift has three practice/analysis pipelines today — human-partner
audio roleplay, AI Doctor voice simulation, AI Doctor text simulation —
and each produces a different, partial report. None of them answer the
seven questions a rep actually needs after a call: what mattered to the
customer, what the rep understood or missed, how well they responded,
what the critical moments were, what was agreed, what to do next, and
what one behaviour to practise. This spec adds a **shared reporting
pipeline** that all three flows feed into, plus a **fourth session type**
— a consented real-customer-visit recording — and generates one
evidence-linked report format across all four.

**Out of scope for this spec:**
- Rebuilding transcription/diarization (AssemblyAI) or the Pipecat voice
  loop — reused as-is.
- Adding a second LLM provider — everything routes through the existing
  `createAnthropicComplete` (`src/agents/llm.ts`).
- Manager-facing analytics/rollups on the new report data — a future spec.
- `doctor_visits` (1 prod row, no migration file) — its shape predates the
  numbered migration scheme and is unrelated to this feature; not touched.

## What already exists (confirmed by direct code/DB inspection)

Three pipelines, never converging:

1. **Human-partner roleplay** (`useRoleplayRecorder.ts`, `roleplay-core.ts`,
   `assemblyai-client.ts`) — records mic audio, diarizes via AssemblyAI
   (real ms offsets), computes pitch/pace/pause/talk-ratio/question-type/
   paraphrase/social-style client-side. **Only the aggregated metrics are
   persisted** (`roleplay_sessions`) — the utterances themselves
   (`DiarizedUtterance[]`, with text/speaker/start/end) live in a `useRef`
   and are discarded on unmount. This is the biggest existing gap: there
   is no stored evidence to link a report finding back to.
2. **AI Doctor voice** (`session-evaluator.ts`, `pressure-shift.ts`,
   `conversation_turns` table) — transcript persisted turn-by-turn already.
   `buildEvaluatorPrompt()`/`groundEvaluatorResult()` already implement the
   exact anti-hallucination pattern this spec needs: the model returns
   `turnIndex` references only, never quoted text; grounding code resolves
   the real quote from the stored turn and **drops any turnIndex that
   doesn't exist**. Scores are `number | null`, never fabricated.
3. **AI Doctor text simulation** (`src/agents/*`, `src/scoring/engine.ts`,
   `src/schemas/observation`, `src/schemas/coaching`, `agent_sessions`
   table) — the most spec-aligned flow already: typed `EvidenceRef{
   turnIndex, role, quote}` checked server-side against the real turn,
   `Observation.confidence` 0–1, `SessionScore` with `score: null,
   reason: 'insufficient_evidence'` when data doesn't support a number,
   a versioned deterministic scoring engine (`configVersion`), and a
   `CoachingRecommendation` shape that already matches this spec's §3G
   almost field-for-field. `assembleReport()` already deliberately strips
   the simulated doctor's internal trust/skepticism/hidden-concern state
   before building the rep-facing report — the "never present simulation
   state as measured customer information" rule is already enforced here
   by construction, and this spec generalises that rule to the other flows.

Social style: `classifySocialStyle()` (`roleplay-core.ts`) is the only
classifier, acoustic-only (flow 1), and its `confidence` (50–95) is
rendered as a bare percentage next to the style label in
`RoleplayRecorder.tsx` — exactly the "calibrated probability" problem
§9F below forbids. Flows 2/3 have no style signal at all today.

DB: migrations 026–032 are all applied in prod (a stale memory note says
032 is unapplied — verified false via `supabase list_migrations`).
`agent_sessions`, `conversation_turns`, `session_scorecards`,
`session_critical_moments`, `roleplay_sessions` all exist with RLS
(own-rows via `rep_id = auth.uid()`; `conversation_turns` and
`roleplay_sessions` additionally allow manager read via
`profiles.company_id`; `agent_sessions` deliberately has no manager-read
policy yet).

LLM: `src/agents/llm.ts` exports `CompleteFn` and
`createAnthropicComplete(apiKey)` — model `claude-haiku-4-5-20251001`,
raw `fetch` to the Anthropic Messages API. This is the only text-generation
path in the app (OpenAI is Whisper-only, for `/api/transcribe`). Reused
as-is; `CompleteFn` is the same seam used for test injection throughout
`src/agents/**/*.test.ts`.

i18n: `src/lib/i18n.tsx`, flat dotted-key `EN`/`AR` dictionaries, `useT()`,
`LangContext` toggles `document.documentElement.dir`. One landmine:
`EN['privacy.body']` currently states unconditionally that raw audio is
"discarded right after processing" — true today, but this spec adds a
session type that can retain audio, so that copy must become conditional
on the session's actual retention policy (§7 of the pasted product spec:
"Never promise that audio is discarded if the implemented workflow
retains it").

## Architecture decision: normalize, don't unify storage

The three existing flows keep their own tables and transcript shapes
(`roleplay_sessions`+new `transcript_segments`, `conversation_turns`,
`agent_sessions`'s embedded `TranscriptTurn[]`). Rewriting them onto one
table is a much bigger, riskier change than this spec needs and would
touch working code paths unnecessarily ("keep existing practice features
working"). Instead:

- One new table, **`transcript_segments`**, becomes the canonical evidence
  store going forward for flows that don't already persist per-turn data
  with real audio offsets (human-partner roleplay, and the new
  customer-visit flow). Flows that already have a good per-turn store
  (`conversation_turns`, `agent_sessions.transcript`) are read from their
  existing table by a per-flow **adapter** that normalizes them into the
  same in-memory `TranscriptSegment[]` shape — they are not migrated into
  `transcript_segments`.
- A **report schema** (`src/schemas/conversationReport/index.ts` — named
  to avoid colliding with the existing flow-C-specific
  `src/schemas/report` / `SessionReport`) generalizes
  `schemas/observation` + `schemas/coaching` (already the most
  spec-aligned code in the repo) into the full 7-question report shape,
  reusing their exact evidence-grounding discipline.
- A **single report-generation pipeline**
  (`adapter → buildReportPrompt → LLM → groundReport → persistReport`)
  is shared by all four session types. Each adapter's only job is
  producing `{ segments: TranscriptSegment[], context: ReportContext }`;
  everything downstream is flow-agnostic.

This keeps the blast radius on existing tables/components to "add a
column, add a persistence call" rather than "rewrite the schema."

## Session types

```ts
type ReportSessionType =
  | 'human_partner'   // RoleplayRecorder, roleplay_sessions + transcript_segments
  | 'ai_doctor_voice'  // Pipecat live sim, conversation_turns
  | 'ai_doctor_text'   // orchestrator text sim, agent_sessions
  | 'customer_visit'   // new: consented real recording, customer_visits + transcript_segments
```

`ai_doctor_voice` and `ai_doctor_text` are simulations: their reports
must never present the configured doctor persona (style weights,
hidden concern, trust/skepticism/engagement) as measured customer
information. `human_partner` and `customer_visit` are real people: their
reports never fabricate a "hidden concern" or hard style label the
transcript doesn't support — "insufficient evidence" is a valid, expected
answer.

## Shared evidence + report schema

```ts
// src/schemas/conversationReport/index.ts

export interface TranscriptSegment {
  segmentIndex: number
  speakerRole: 'rep' | 'counterpart'   // counterpart = doctor / colleague / customer
  text: string
  startMs: number | null               // real audio offset, null if unavailable
  endMs: number | null
  createdAt: string | null             // ISO; message-creation time, NEVER used as startMs
}

export interface EvidenceRef {
  segmentIndex: number
  speakerRole: 'rep' | 'counterpart'
  quote: string   // validated server-side: must be a real substring of segments[segmentIndex].text
}

export type Certainty = 'stated' | 'inferred' | 'not_established'
export type CommitmentStatus = 'agreed' | 'proposed' | 'ai_recommended'
export type ObjectiveStatus = 'achieved' | 'partial' | 'not_achieved' | 'insufficient_evidence'

export interface VisitSummary {
  sessionType: ReportSessionType
  objective: string | null            // null when none was supplied — never invented
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
  dimension:
    | 'opening' | 'questioning' | 'listening' | 'value_linking'
    | 'evidence_use' | 'objection_handling' | 'adaptation' | 'closing'
  whatHappened: string
  evidence: EvidenceRef[]
  whyItMattered: string
  improvement: string | null   // null when nothing actionable — never padded
}

export interface CriticalMoment {
  quote: string
  evidence: EvidenceRef
  observedBehavior: string
  interpretation: string
  interpretationCertainty: Certainty
  betterResponseExample: string | null
}

export interface VoiceMeasurement {
  metric: 'speaking_share' | 'speaking_rate' | 'pitch_variation' | 'pauses'
    | 'rapid_turn_switches' | 'question_frequency' | 'open_question_ratio'
  value: number
  unit: string
  explanation: string
  available: boolean   // false when the session type has no acoustic data (e.g. text sim)
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
  successLookslike: string
}

export interface Strength {
  behavior: string
  evidence: EvidenceRef[]
}

export type SocialStyle = 'driver' | 'expressive' | 'amiable' | 'analytical'

export interface SocialStyleSignal {
  text: string
  evidence: EvidenceRef
  category:
    | 'directness' | 'detail_request' | 'results_focus' | 'relationship_language'
    | 'possibility_interest' | 'reassurance_request' | 'pace_preference'
}

export interface SocialStyleRead {
  subject: 'customer' | 'rep'
  strongestSignals: SocialStyleSignal[]
  possibleStyle: SocialStyle | null      // null = insufficient evidence, never forced
  mixedEvidenceNote: string | null
  alternativeExplanation: string | null
  savedProfile: SocialStyle | null       // previously recorded profile, if any (flows with a saved doctor/customer profile)
  profileDrift: boolean                  // true when this session's read differs from savedProfile
  isSimulationSetting: boolean           // true for ai_doctor_* — this is a configured persona, not discovered
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
  } | null   // null when evidence is too thin for a card — never fabricated
}

export interface ConversationReport {
  reportSchemaVersion: 1
  sessionType: ReportSessionType
  transcriptVersion: number
  scoringConfigVersion: string | null   // from src/scoring/config.ts when reused
  generatedAt: string
  visitSummary: VisitSummary
  customerUnderstanding: CustomerUnderstanding
  performance: PerformanceFinding[]
  criticalMoments: CriticalMoment[]      // max 5
  voiceMeasurements: VoiceMeasurement[]
  commitments: Commitment[]
  coachingPriority: CoachingPriority
  strength: Strength
  socialStyle: SocialStyleSection
  qualityFlags: string[]   // e.g. "short_session", "uncertain_speaker_separation", "low_audio_quality"
}
```

Every `EvidenceRef` is checked server-side (`groundReport.ts`) against the
real `TranscriptSegment[]` the adapter produced. A reference to a
non-existent `segmentIndex`, or a `quote` that isn't a real substring of
that segment's text, is **dropped**, and the finding it belonged to is
dropped if it has no evidence left — mirroring
`groundEvaluatorResult()`'s existing "drop, never invent" rule.

## Report generation pipeline

```
adapter(sessionType, sessionId)
  → { segments: TranscriptSegment[], context: ReportContext }
buildReportPrompt(segments, context)
  → one Anthropic call, model returns segmentIndex-only evidence refs
groundReport(rawModelOutput, segments)
  → resolves quotes/timestamps from real segments, drops invalid refs,
    drops findings left with zero evidence, forces score-like fields to
    "not_assessed"/null when unsupported
persistReport(report, sessionType, sessionId, transcriptVersion)
  → upsert into conversation_reports; marks any prior report for the
    same (sessionType, sessionId) with an older transcriptVersion as
    outdated (superseded_by)
```

`ReportContext` carries what the model needs beyond the transcript: the
stated objective/product context (if any), whether this is a simulation
(and if so the configured doctor persona — passed to the prompt as
"simulation configuration, not customer data" and never surfaced as
customer signal in the output), any previously-saved social-style profile
to diff against, and existing deterministic metrics already computed
by `roleplay-core`/`session-evaluator`/`scoring/engine` (passed in, not
re-derived by the LLM — "keep numerical measurements deterministic").

Social-style **signal extraction** (§9A) is deterministic text/keyword
pattern matching (new `socialSignals.ts`, same style as
`classifyQuestions()`), not model output — the model only writes the
"possible interpretation" / "alternative explanation" narrative, and it
must cite the deterministic signals via `EvidenceRef`, which grounding
then validates like anything else.

## Real-customer-visit mode (`customer_visit`)

New flow, new table `customer_visits`:

1. Rep starts a customer-visit recording. UI requires an explicit consent
   checkbox ("I confirm this customer has authorized recording and
   analysis of this visit") before recording starts — no silent capture.
2. Reuses `useRoleplayRecorder`'s capture + `assemblyai-client`'s
   diarization (same code path as human-partner roleplay).
3. After diarization, rep confirms which AssemblyAI speaker label is
   "me" vs "customer" (a two-button picker showing a text sample from
   each label) — never guessed.
4. Rep optionally enters visit objective + product context.
5. Rep picks a retention policy (`discard_after_report` default /
   `retain_90_days` / `retain_indefinite`). `discard_after_report`
   deletes the audio blob (never uploaded to permanent storage in the
   first place — only the AssemblyAI proxy call, same as today) once the
   report is generated; the other two retain it in Supabase Storage.
   `transcript_segments` are always kept regardless of audio retention
   (evidence for the report) unless the rep explicitly deletes the visit.
6. `transcript_segments` rows are written with `sessionType =
   'customer_visit'`, `sessionId = customer_visits.id`.

`privacy.body`'s "audio always discarded" copy becomes conditional on the
session's actual `retention_policy` (Task 16) — it must not be shown, or
must be rephrased, for any `customer_visit` session that isn't
`discard_after_report`.

## Report UI

New shared component `src/components/report/ConversationReport.tsx`
replaces the per-flow renderers. Structure, mirroring
`TextSimulationReport.tsx`'s already-correct i18n/RTL/mobile pattern
(`useT()`, `dir="auto"` on every quote/body block, `maxWidth: 560`,
`&lt;details&gt;` for expandable evidence):

1. Overview (visit summary + objective status) — always visible.
2. Expandable sections B–G in document order, each `&lt;details&gt;`.
3. Social style section rendered via `SocialStyleCard.tsx`, using the
   exact six-line coaching-card format from §9E.
4. Timestamp playback control shown only when the segment has a non-null
   `startMs` **and** the session's audio is actually retained
   (`customer_visit` with a non-`discard_after_report` policy, or
   `human_partner` mid-session before cleanup) — otherwise the evidence
   quote renders with no playback control at all, never a disabled one.
5. "Speaker looks wrong? Fix it" control on the transcript view — lets the
   rep swap `speakerRole` on segments and re-submit; bumps
   `transcript_segments.transcript_version`, which (a) triggers
   regeneration and (b) causes the previous `conversation_reports` row to
   render with an "outdated — based on an earlier transcript" banner
   wherever the UI still has an open reference to it.

`TextSimulationReport.tsx` is retired in favor of `ConversationReport.tsx`
once the `ai_doctor_text` adapter is wired in (Task 15) — no dual
maintenance of two renderers for the same flow.

## Testing strategy

Reuses the existing repo pattern: fake `CompleteFn` injection for
prompt/grounding unit tests (no network mocking needed), colocated
`*.test.ts`. New coverage required (full list in the plan's Review Focus
and Task 18): fabricated/invalid evidence refs are dropped, missing
timestamps don't crash the UI or fabricate a playback control, speaker
correction triggers regeneration and marks the prior report outdated,
insufficient evidence renders "Not assessed" instead of a score,
`agreed`/`proposed`/`ai_recommended` commitments never collapse into one
bucket, English and Iraqi-Arabic question/filler examples are correctly
classified by the reused `classifyQuestions`/new `socialSignals`, RLS
denies cross-rep reads on all three new tables, and existing
`roleplay-core`/`session-evaluator`/`scoring/engine` tests still pass
unmodified (no behavior change to the flows this spec reuses rather than
rewrites).
