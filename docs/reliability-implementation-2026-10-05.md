# StyleShift reliability update

Implemented on branch `fix/field-workflow-reliability`, starting at `ae4271d`. Code and the new Supabase migration are local; no deploy or database migration has been applied.

## Changed

- Each debrief keeps a separate draft per doctor. Practice selection has its own state, so it cannot change which doctor owns the debrief or an approved promise.
- Unsaved text, reflections and generated reports recover from the same browser tab for the signed-in account. Drafts include the visit date and the original request ID; they clear on sign-out and expire after seven days.
- If report generation succeeds but database saving fails, a signed, seven-day recovery token lets the owner retry the save without another AI call. Repeated generation requests with the same ID return the original saved report.
- Failed transcription retains the same recording for retry. Visit Prep now uses the shared recorder, stops the mic on unmount, and can retry a failed transcription.
- Visit/debrief dates distinguish the actual customer contact from the time someone entered notes. “Add promise” creates a task, not a contact.
- Visit queue writes have stable IDs, retry after a lost response without inserting a duplicate, are scoped to the signed-in rep, survive a reload and do not disappear during a racing history refresh. Rejected writes remain visible with a retry control.
- Promise creation is serialized server-side so simultaneous approvals reuse one open promise. Weekly digest labels now distinguish game-session counts from reps active through game or voice practice.
- The selected doctor's previous action is fetched independently of the last 30 entries shown in general history.

## Checks

- Full suite after final changes: 92 files, 716 tests passed.
- Later targeted run: 46 tests passed across AI Coach, debrief API, visit history, offline queue and translations.
- Focused recorder/visit/date run: 11 tests passed before the final full suite.
- TypeScript passed.
- Production build passed with all 63 static pages generated.
- `git diff --check` passed.

## Required before release

Review and apply `supabase/migrations/20261005150000_reliable_promises.sql` to the correct Supabase project. It adds actual contact dates, separates promise tasks from contact, and grants authenticated users access to the owner-checked, serialized `add_doctor_promise` function. The SQL was included in the source build but was not applied to any database. Verify the deployed `SUPABASE_SERVICE_ROLE_KEY` is available for report-recovery signing (the code falls back to the server-only Anthropic key), configure transcription as intended, then test a real signed-in account and phone/browser microphone before deploying.
