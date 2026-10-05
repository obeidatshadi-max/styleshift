# StyleShift: current state and next release

Reviewed 5 October 2026. GitHub fetched successfully; local main matches origin/main at `ae4271d` (12:15 +03:00), merge of `feat/focus-pattern-digest`. Working tree was clean before this report. This review adds documentation only.

## Decision

StyleShift already has the main daily coaching loop: prepare a visit, practice, record a recollection, get private coaching, track a promise, and review context before returning. The immediate priority is to make that loop reliable and accurate. Next, add structured extraction from the existing voice narrative. Do not rebuild voice entry, visit planning, promises, reminders or the weekly digest: those now exist.

## What exists now

| Area | Current implementation | Boundary |
|---|---|---|
| Visit preparation | Doctor profiles, objective and success-measure entry, pre-visit brief, history | No structured visit date/outcome model in the inspected plan flow |
| AI Coach | Spoken or typed account, optional reflections and objectives, optional opening/questions/objections/closing focus | Requires doctor and account of at least 20 characters; output reflects the rep's recollection, not observed performance |
| Follow-through | Previous action done/partly/not-done input; explicit promises offered for approval; promise completion | Promise is stored on a visit row; no dedicated due-date/rescheduling/evidence lifecycle |
| Practice | Text AI Doctor, voice modes, live voice route, colleague roleplay/report infrastructure, company scenarios | Live AI modes depend on provider configuration and feature flags |
| Reporting | Shared conversation report schema/adapters, grounded observations, scoring engine, practice history | Keep self-reported coaching distinct from transcript-grounded practice; do not combine into an unexplained score |
| Home | Dominant next action, coach nudge, recurring practice pattern | Pattern requires enough scored sessions; reminders are simple rules, not an individualized spaced-practice schedule |
| Manager | Team metrics, assignments/coaching queue, scenarios, doctor profiles, behavioral trends, weekly digest | Private text simulations and debriefs excluded from digest |
| Reminders | Opt-in web push, hourly scheduled trigger, timezone-aware delivery logic | Presence in code does not establish deployed scheduler/VAPID configuration or phone delivery |
| Offline | IndexedDB queue for selected insert operations, offline shell/sync component | Not full offline AI or durable debrief/audio recovery |
| Transcription protection | Authentication, rate/size checks and language selection in endpoint | Real-phone codec behavior and noisy Arabic accuracy still require testing |

Relevant current files: `src/components/game/AICoach.tsx`, `PlanPanel.tsx`, `VisitBrief.tsx`, `src/lib/coach-debrief.ts`, `coach-nudges.ts`, `practice-pattern.ts`, `weekly-digest.ts`, `src/app/dashboard/page.tsx`, `src/schemas/conversationReport/`, `src/app/api/transcribe/route.ts`.

The older `review-and-ai-guidelines-2026-10-05.md` describes several gaps that subsequent commits already addressed. Its claims about seven required debrief inputs, missing planning, no reminders and no previous-action follow-up should no longer drive development. Its legacy-recorder finding still applies.

## Verification performed

- `git fetch origin`: succeeded; no newer origin/main commit than local main.
- `npm test`: **694 tests passed in 90 files**.
- `npx tsc --noEmit`: passed.
- Test output contains React “Maximum update depth exceeded” warnings in two doctor-history hook tests. Investigate mock/client dependency stability; passing assertions do not explain those warnings. They do not by themselves prove a production render loop.
- Production URL retrieval through the web tool failed. No authenticated browser session, real microphone, deployment configuration, migration state or production database was verified. No production build was run for this source review.

## Next release: reliability before expansion

These are source-derived findings. The scenarios and acceptance criteria below should become regression checks during implementation; they were not reproduced on a live account in this review.

### P0 — 1. Keep each doctor's debrief context separate

**Finding:** `AICoach.tsx:79` changes doctor ID but prefills a plan only when both objective fields are empty. Select Doctor A with a saved plan, then Doctor B: A's objective can remain while the submitted doctor ID is B. Other entered narrative/reflection state also remains.

**Change:** maintain a draft per doctor, or explicitly offer to discard/move a draft when changing doctors. Track whether objective text was auto-filled or manually edited. A doctor's auto-filled plan must not silently carry into another doctor's debrief.

**Done when:** switching A → B → A preserves the intended drafts; submission always shows the correct doctor and objective; returning to a saved entry cannot attach a promise to a different doctor accidentally.

### P0 — 2. Retain the recording after failed transcription

**Finding:** `AICoach.tsx:116` calls `recorder.take()` before the request. `useAudioRecorder.ts` clears its stored blob and preview when taking it. If transcription fails, the catch path asks the user to type or record again; there is no retained take to retry.

**Change:** keep the audio until transcription succeeds or the user explicitly discards it. Add retry and clear pending/error state. Decide a short, explicit retention policy for local drafts rather than retaining recordings indefinitely.

**Done when:** simulate failed request, retry with the same recording, and receive one transcript; navigating away follows the agreed draft behavior; successful completion clears temporary audio.

### P0 — 3. Make debrief saving recoverable

**Finding:** `api/coach-debrief/route.ts:28` can generate a valid report and fail its database insert. It returns `saved:false`; the UI warns the rep to keep a copy. There is no durable save-only retry in this path. Inputs are React state, so reloading before saving can also lose work.

**Change:** store a scoped recoverable draft and give each request a stable ID. Provide a save-only retry for an already generated report so the user does not pay/wait for generation again. Distinguish “generated,” “saved,” and “pending sync.”

**Done when:** generation success plus save failure survives reload; retry creates exactly one record; another signed-in user cannot see the draft; sign-out handling is defined.

### P0 — 4. Reuse the safer recorder in Visit Prep

**Finding:** `VoiceRecorder.tsx` remains imported by `VisitPrep.tsx`. It has no unmount cleanup or recording cap and labels its blob `audio/webm` regardless of the recorder's actual format. The shared `useAudioRecorder` already handles much of the required lifecycle.

**Change:** migrate the older component to the shared hook, including caller cleanup, duration cap, actual MIME type and retry handling.

**Done when:** microphone stops on navigation, permission denial is recoverable, maximum-duration behavior works, and recording/transcription succeeds on target Android and iPhone browsers. Do not call it fixed based only on desktop mocks.

### P1 — 5. Guarantee one logical write despite retries

**Finding:** `offline-queue.ts` replays inserts and deletes the local queue entry only afterward. Server success followed by response loss or interruption can lead to another insert. `promises.ts` checks for an existing promise and then inserts separately: two simultaneous requests can both pass that check. No corresponding uniqueness guard was found in the checked-in migrations.

**Change:** create a stable operation ID before the first attempt and enforce the chosen uniqueness rule in the database. Use an atomic create/reuse operation. Keep queues user-scoped and provide a way to resolve permanently rejected entries; today the first error stops later entries.

**Done when:** replay after response loss creates one visit; concurrent identical promise approvals create one intended promise; rejected old writes do not block all future valid work.

### P1 — 6. Separate tasks from contact history

**Finding:** `promises.ts:14` adds a promise as `source:'manual'` with a fresh timestamp. `visit-brief.ts:47` treats manual rows as real contact; it also uses debrief creation time. Approving a promise from an old debrief today can therefore make “last contact” look like today.

**Change:** distinguish a contact event, debrief, and commitment. Record the actual visit date separately from record creation. Link commitments to their source event rather than making them new visits.

**Done when:** approving an old promise does not change last-contact date; late-entered debriefs use their stated visit date; unknown visit date is displayed as unknown rather than invented.

### P1 — 7. Correct manager digest counting

**Finding:** `weekly-digest.ts:41` counts game-session rows for the displayed session total. Voice last-practiced dates contribute to active-rep counts, but not the total. `WeeklyDigestPanel.tsx` says it counts game and voice practice. This gives the two metrics different coverage without explaining it.

**Change:** either label the total explicitly “game sessions,” or count voice sessions too with a consistent date range and no duplicates. Preserve exclusions for private activity.

**Done when:** a voice-only active rep produces an understandable digest; this-week/last-week totals use the same event definition; failed queries display unavailable rather than a misleading zero.

### P1 — 8. Fetch previous action by doctor

**Finding:** debrief history endpoint returns the latest 30 records across all doctors; `AICoach.tsx:58` searches that list for the selected doctor. An older doctor's last action can disappear from the follow-up prompt despite still existing in storage.

**Change:** query the latest relevant debrief for the selected doctor or paginate appropriately.

**Done when:** a doctor's previous action appears even after more than 30 debriefs with other doctors; ownership restrictions remain enforced.

## Then add the next useful feature

### Release 2 — Structured voice debrief

Extend the existing spoken account with an editable extraction panel:

1. Doctor and actual visit date.
2. Main question or objection reported.
3. Rep's response and reported outcome.
4. Explicit promise, with supporting transcript text.
5. Proposed next action and due date, kept distinct from historical facts.

Leave missing information blank. Resolve ambiguous dates with one optional clarification. The current prompt explicitly forbids questions and the parser discards them; adaptive clarification therefore needs a deliberate interaction/schema change, not just another prompt sentence.

The rep reviews the extracted information before saving tasks. Reuse existing doctor context and promise approval. Do not infer product claims, prescriptions or verified doctor behavior from a recollection.

**Acceptance:** Arabic and English examples cover negated promises, ambiguous pronouns/dates, mixed drug names and uncertain outcomes. Every historical extraction has supporting text; retries are safe; correction time is measured.

### Release 3 — Commitments with dates and progress

Extend the current open/done tracker with due date, overdue state, rescheduled/cancelled state, optional completion note and source visit link. Reminders should prioritize an overdue commitment appropriately; the current nudge ordering always considers a saved plan first and can keep older promises out of the main card.

An unresolved plan is not proof a visit happened. Add a simple planned/completed/cancelled visit state before telling a rep they owe a post-visit debrief.

### Release 4 — Approved knowledge and shared field learning

Build a small company/country/product library with document version, owner, approval and expiry. Answers cite the approved source and say when evidence is unavailable. Company scenario approval already exists, but it is not a complete approved medical-content retrieval library.

Then let reps explicitly submit selected, redacted doctor questions or objections into a shared inbox. A manager/medical owner can assign an answer or create a reviewed practice scenario. Do not use private debriefs automatically in the manager digest.

## Practical order and pilot

1. Ship the reliability fixes, with targeted regressions for the scenarios above.
2. Verify migrations, feature flags, push scheduling, audio and tenant boundaries in a staging/live pilot environment.
3. Pilot structured debriefs with 8–12 reps for two weeks.
4. Add commitment dates and measure follow-through.
5. Add approved knowledge only when a content owner will maintain it.

Measure median debrief completion time, abandoned/failed saves, transcript correction time, duplicate writes, weekly repeat use and completed commitments. Proposed pilot target: a useful saved debrief in under 90 seconds for a typical short account, with no lost or duplicated records in the tested recovery scenarios. This is a target, not current measured performance.

Avoid adding another mode, general chatbot, clinical scribe or a new manager dashboard now. The product already has enough surfaces. A dependable prepare → debrief → action → next-visit loop is the next deliverable.
