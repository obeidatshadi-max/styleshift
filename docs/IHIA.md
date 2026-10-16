# Iraqi Healthcare Intelligence inside StyleShift

## Architecture assessment from source

Inspected checkout: `6b50ed894e77e2fbe3e2fd64784891867db184ba`. The generic README does not describe all current flows.

- **Application:** Next.js 16.2.7 App Router, React 19, TypeScript, Tailwind and CSS variables. Next route handlers are the backend. See `src/app/layout.tsx`, `src/app/globals.css`, `package.json`.
- **Authentication:** `src/lib/supabase-server.ts` uses Supabase SSR cookies; `src/proxy.ts` refreshes sessions, redirects unauthenticated requests and restricts manager dashboard pages. The service-role client remains server-side. Existing manager/rep profile roles do not automatically authorize IHIA review.
- **Database:** migrations cover companies/profiles, doctors/visits, voice sessions/conversation turns, structured agent sessions/reports, scenarios, knowledge packs, and methodologies. Existing knowledge packs are company/product-specific. IHIA adds a separate global linguistic catalog, containing shareable references only.
- **Current realtime voice:** `/api/pipecat/session` checks authentication, doctor ownership and rate limits before starting Daily/Pipecat Cloud. `pipecat-agent/bot.py` uses one audio pipeline; `live_provider.py` defaults to Gemini and optionally selects OpenAI. `scenario.py` builds the doctor instructions. No credentials were printed and no billed provider calls were made to verify provider availability.
- **Legacy voice:** `pipecat-bot/bot.py` uses Deepgram STT and ElevenLabs TTS, calling `/api/voice-partner/turn`. That route uses an Anthropic judge and existing OpenAI/Deepgram transcription paths. Existing transcript storage is unchanged.
- **Text training:** `/api/simulation/*`, `src/agents/orchestrator/*`, doctor/analyst/coach ports, deterministic scoring and `src/agents/llm.ts` (Anthropic completion adapter). Existing drills, training instructions and product knowledge packs remain in place.
- **Hosting:** Netlify with Blobs-based rate limiting and Supabase persistence. No new hosting, subscriptions or audio pipeline.

## Implemented scope

### AI-assisted discovery

At `/ihia`, start with **Let the AI suggest expressions**. No remembered phrase is needed: select **Busy doctor**, **Asking for evidence**, **Pharmacy stock** or **Using a new app**, or describe a general situation in Arabic/English. Leaving the situation blank requests starter expressions.

`POST /api/ihia/suggest` reuses the existing `OPENAI_API_KEY` with GPT-4.1 mini structured output (`store:false`); Gemini remains the Pipecat live-voice provider. The production Anthropic credential failed a real authentication check, so it was not selected for discovery. No new key, dependency or database migration is needed. Requests require a signed-in session and the IHIA flag, are limited to ten per user per hour, and accept at most 1,000 context characters. Use synthetic/general situations without patient details. Existing provider usage is billed normally. Optional server-only `IHIA_SUGGESTION_PROVIDER=anthropic` selects the existing Anthropic adapter explicitly; no silent cross-provider retry is performed.

Suggestions include Arabic wording, literal and possible contextual meanings, a synthetic usage example and uncertainty. All are marked **unverified AI suggestions**. The server ignores model-supplied approval status, source claims and region overrides, validates/deduplicates the proposals and supplies an explicit AI-generated provenance marker. Malformed responses fail with a retry message; no invented fallback corpus is returned.

Any signed-in user may discover expressions. Explicit reviewers can click **Save as draft for review**. Generation never writes to the database automatically, and saving never approves an expression. Suggestions only enter production interpretation/voice vocabulary after the existing human approval flow. An Iraqi speaker should verify wording, regional use and meanings; AI-generated text is not independent evidence.

The added files are `src/lib/ihia/suggestions.ts`, its unit and opt-in live tests, and `src/app/api/ihia/suggest/route.ts` with route tests. `IhiaPanel` has generation and draft-save interaction coverage. The optional live check is:

The provider adapter is `src/lib/ihia/provider.ts`, with tests for refused/incomplete outputs, missing configuration, no silent provider retry and provider error containment. A real synthetic generation using the existing production OpenAI configuration passed before rollout. This verifies provider connectivity and validated output, not regional linguistic accuracy. The initial proposed Anthropic path was rejected because the existing credential returned 401; no existing key was overwritten.

Implementation reference: [official OpenAI structured-output documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

```powershell
$env:IHIA_LIVE_SMOKE='true'
npm test -- src/lib/ihia/suggestions.live.test.ts
```

It makes one real synthetic request using an existing server-side key in the test environment. Normal test runs skip it. Never place the key in a command argument, source file or browser bundle.

Approved expression → authenticated knowledge retrieval → region-aware contextual interpretation → response at `/ihia`.

The interpreter uses **normalized phrase matching**, not general semantic Arabic understanding. It handles Arabic diacritics/alef variants, mixed English terms and phrase boundaries. Original text is preserved. Unknown expressions request clarification; competing meanings remain visible.

Reusable modules in `src/lib/ihia/`:

| Module | Responsibility |
| --- | --- |
| `core.ts` | Dialect/region types, validation, retrieval, uncertain responses and provider-neutral vocabulary instructions |
| `medical.ts` | Approved medical/pharmacy terms with sources; no treatment recommendations |
| `behavior.ts` | Separate observed phrase evidence from possible workflow concerns; no personality or hidden-motive inference |
| `market.ts` | Group recurrent workflow-expression candidates across distinct supplied feedback IDs, retaining sources/uncertainty |
| `server.ts` | Supabase adapter, explicit reviewer grants and optional voice grounding |

Baghdad is the default. Basra, Mosul, Najaf and Iraq-wide tags provide an extension structure. **No expert-approved corpus is bundled**, so no regional coverage is claimed. Medical/behavioral interpretation is limited to approved expressions. Market counts describe a supplied sample, never prevalence or verified speaker intent. The pure market module adds no bulk feedback endpoint or persistence.

## Review and database security

Migration `20261016091923_ihia_knowledge.sql` adds `ihia_reviewers`, `ihia_entries`, `ihia_history` and private audit trigger functions. Its filename matches the recorded hosted migration version; no remote migration history was rewritten.

- Only a database administrator provisions reviewer grants. Users cannot grant themselves access; editable profile metadata is not an authorization source.
- Signed-in users read approved entries only. Reviewers can inspect drafts/rejections/history, create drafts and review/correct entries. Anonymous clients have no table privileges.
- API validation strips client-supplied approval/creator fields on creation. Database triggers independently force draft creation and stamp versions/actors/timestamps.
- Every content correction returns to draft, **even via direct REST updates**. Content edits cannot simultaneously approve the edited meaning.
- Approvals/rejections require a reason. API updates use optimistic version checks; stale saves return 409.
- Every version has an immutable history snapshot. Authenticated clients cannot write/delete history. Private trigger functions use an empty search path, check reviewer identity and are not exposed as RPCs.
- Source references are supplied and checked by human reviewers; their accuracy is not automatically verified. This is a global catalog: never enter patient data, transcripts or private company feedback.
- IHIA interpretation persists no utterances, recordings or responses. API responses use `no-store`; the existing service worker does not cache API results. No microphone, monitoring or new retention workflow was introduced.
- Deterministic interpretation cannot execute commands in an utterance. Voice reference JSON has anti-injection instructions, but prompt tests cannot establish complete live-model injection immunity.

Database security follows [Supabase's RLS and grant guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Existing voice integration

### Two-person recording analysis

When IHIA is enabled, reports for existing `human_partner` and `customer_visit` recordings now receive Iraqi-language analysis guidance and per-segment matches from the approved Baghdad/Iraq-wide catalog. The original transcript, speaker assignment, timestamps, evidence references and deterministic measurements are preserved. A separate bounded reference section supplies possible literal/contextual meanings, uncertainty, knowledge version and provenance; it never rewrites the transcript or becomes evidence for speaker intent.

Explanations in the report use the requested clear Arabic or English. Ambiguous dialect is to remain inferred/uncertain, with a clarifying question. Unknown expressions have no verified dictionary gloss; the model may cautiously interpret ordinary language from the original context, without claiming an approved translation. Draft/rejected AI suggestions are never used as dictionary references.

This runs during the existing **post-recording report generation**, after recording stops and speakers are confirmed. It does not stream live translations, alter microphone behavior, create a new transcript store or introduce background monitoring. Existing ownership, consent and retention flows remain; customer-visit analysis additionally requires the recorded consent confirmation. No actual participant audio was used in verification.

In the existing two-person recorder: confirm consent → record → stop → identify your speaker → on the result screen choose **AI conversation analysis** (Arabic: **تحليل المحادثة بالذكاء الاصطناعي**). The original voice measurements remain visible below. Analysis is user-triggered and reuses an existing saved report when one exists. Older saved reports are shown as originally generated; this change does not silently regenerate them. `RecordedConversationAnalysis.tsx` connects the existing recorder to the shared report renderer; `PracticeReport` now also accepts human recording session types.

This path uses the same verified existing OpenAI connection as discovery (GPT-4.1 mini, JSON output, `store:false`), with four existing small report parts and existing grounding/persistence. Other session types retain their previous provider path. No Anthropic credential was overwritten; the IHIA recording path returns a configuration error if the existing OpenAI key is unavailable instead of silently trying another provider. Report grounding always resolves evidence quotes from the original transcript, not model paraphrases.

New reusable code: `src/agents/openai-complete.ts` and `src/lib/ihia/recording.ts`. The suggestion provider reuses the extracted completion adapter without changing its structured-output schema. Tests cover recording/report integration, speaker/evidence preservation, unapproved-reference exclusion, consent/ownership, unavailable knowledge and bounded prompt data. `recording.live.test.ts` is an opt-in synthetic provider/grounding check, not an accuracy evaluation on real Iraqi recordings.

With `IHIA_ENABLED=true`, `/api/pipecat/session` loads approved vocabulary server-side and supplies `ihiaContext`; client-supplied context is ignored. `scenario.py` treats it as reference data, preserves mixed terms, asks for clarification and prohibits dialect-based personality/treatment inference. The same instructions reach Gemini or OpenAI. Models, credentials, transport and audio settings are unchanged.

The legacy `/api/voice-partner/turn` also appends approved vocabulary to its existing judge instructions. IHIA retrieval failures omit optional voice grounding, preserving the existing flow. The interpretation API instead returns 503, never an unapproved fallback.

Limits: retrieval reads at most 1,000 approved records; voice snapshots include the first 40 by ID. This is a bounded catalog slice, not scalable semantic search. New live sessions load new knowledge. Active sessions retain their initial snapshot; **end and restart them after a withdrawal**. No dynamic provider-context revocation is implemented.

No STT boosting parameters were added. The realtime providers receive vocabulary through prompt context. Recognition accuracy and natural Iraqi responses require expert listening tests; no improvement is claimed from offline tests alone. The independent text orchestrator does not yet consume IHIA; the integrated training paths are the live agent and legacy turn judge.

## Exact local test steps

1. Open the existing checkout:

   ```powershell
   cd 'C:\Users\shadi\Desktop\AI APP 2026\pharma\styleshift-app'
   ```

2. Use a **local/nonproduction Supabase instance** with the existing StyleShift schema and local test user. Apply the new migration there. If the local migration history is already reconciled:

   ```powershell
   npx supabase migration up --local
   ```

   This applies **all pending local migrations**. Review the pending list first. Existing filenames mix numeric/timestamp conventions; do not repair remote history for this feature. Alternatively execute only `supabase/migrations/20261016091923_ihia_knowledge.sql` in the nonproduction SQL editor. The subsequent authorized production rollout already applied this migration to StyleShift; do not reapply it there.

3. In that same nonproduction database, provision your test user's UUID:

   ```sql
   insert into public.ihia_reviewers(user_id)
   values ('YOUR-LOCAL-TEST-USER-UUID') on conflict do nothing;
   ```

4. Point the existing `.env.local` Supabase URL/anon key at that nonproduction instance and add `IHIA_ENABLED=true`. Preserve other configuration. No new AI API key is required. Never put server secrets in `NEXT_PUBLIC_*` variables.
5. Run `npm run dev`, sign in as that user and open `http://localhost:3000/ihia` (or Next's printed port). The enabled manager dashboard also links to “Iraqi knowledge”. Only granted reviewers see the review controls.
6. Add this **synthetic local fixture**, explicitly labelled as synthetic:

   | Field | Test value |
   | --- | --- |
   | expression | ما عندي وكت |
   | literal meaning | I have no time |
   | contextual meaning | المتحدث يصرّح بضيق الوقت؛ اسأله عن وقت مناسب |
   | region / specialty / kind | baghdad / general / workflow |
   | uncertainty | Synthetic example; may refer only to this visit. Confirm speaker intent. |
   | source reference | Local synthetic workshop fixture, not verified field evidence |

7. Save the draft. Interpret `دكتور ما عندي وكت`: it must request clarification because the row is unapproved. For this disposable fixture only, enter a review reason and approve it. Interpret again: the possible meaning appears, with original text/source/ID/version in the evidence details.
8. Correct the meaning and save a reason. It must return to draft and disappear from interpretation until reapproval. View history. Reject/withdraw it and confirm exclusion again.
9. Sign in as a second local user without a grant: interpretation remains available, review controls disappear and knowledge writes return 403. Direct table access also obeys RLS.
10. Optional existing-service voice check: after genuine expert approval of an expression, start a **new** AI Doctor session and test code-switching, clarification and recognition with an Iraqi expert. This uses the already configured billed Pipecat/provider services; no such calls were made during implementation.

Disable by setting `IHIA_ENABLED=false` and restarting Next. Do not deploy or run remote migrations without separate approval.

## Automated verification

Verified during implementation:

- `npm test`: 133 files, 1,092 tests passed, including React review/interpretation interactions and existing voice/application regressions.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- In `pipecat-agent`, `python -m unittest discover -s tests`: 9 passed.
- Disposable PostgreSQL migration/policy/trigger harness: 19 checks passed.

There is no repository lint script/configuration, so no lint pass is claimed. Tests use synthetic data and mocked provider calls; they do not verify a hosted Supabase rollout or live model output.

Optional repeatable database verification (no production access):

```powershell
npm install --prefix "$env:TEMP/ihia-validation" @electric-sql/pglite --no-audit --no-fund
node tools/verify-ihia-db.mjs "$env:TEMP/ihia-validation/node_modules/@electric-sql/pglite/dist/index.js"
```

PGlite is an isolated development verification tool, not an application dependency. The harness bootstraps minimal `auth.users`/`auth.uid()` equivalents in disposable PostgreSQL and runs the actual migration. It does not test Supabase Auth issuance or PostgREST settings. Run advisors and a nonproduction full-stack smoke test before requesting rollout approval.

## Future reuse and remaining work

Core, medical, behavior and market modules have no Next.js/provider/database dependencies and can be packaged later. The server adapter is replaceable. `/api/ihia/interpret` currently uses the existing StyleShift authenticated session and RLS. No wildcard CORS, public endpoint or service-role sharing was added.

Future server-to-server callers need explicit JWT audience/scopes or application credentials, tenant policy, rate limiting and audit rules at this API boundary. That external credential flow is not enabled yet. Never give other apps the Supabase service-role key.

Still needed: Iraqi expert curation, regional evaluation corpus, live recognition/naturalness testing, browser visual review, hosted nonproduction Auth/PostgREST validation and scalable retrieval if the catalog grows. No autonomous clinical decisions, media scraping, bulk feedback storage or population-level market claims are implemented.

The initial implementation was validated without production changes. The user subsequently authorized push and deployment. During rollout, the additive IHIA migration was applied to the existing StyleShift Supabase project and `IHIA_ENABLED=true` was configured for Netlify production. No reviewer was provisioned and no expressions were automatically approved. Deployment status should be checked against the published commit in Netlify.

The production web build and GitHub CI/smoke workflows passed for the feature commit. The Pipecat agent was rebuilt and reached ready status using build `bab58034-2a2e-4860-a056-7b84a948fd0b`, preserving `us-west`, `arm64`, `agent-1x`, min/max replicas 0/2, the existing secret set and the 600-second session limit. Anonymous HTTP checks confirmed `/login` returns 200 and `/ihia`, `/play`, `/dashboard` and the knowledge API redirect to login. Authenticated expert review and live audio evaluation still require a designated reviewer and approved vocabulary.

## All modified files

New:

- `src/lib/ihia/core.ts`, `medical.ts`, `behavior.ts`, `market.ts`, `server.ts`
- `src/lib/ihia/core.test.ts`, `market.test.ts`, `server.test.ts`
- `src/app/api/ihia/interpret/route.ts`, `knowledge/route.ts`, `ihia.test.ts`
- `src/app/ihia/page.tsx`
- `src/components/IhiaPanel.tsx`, `IhiaPanel.test.tsx`
- `supabase/migrations/20261016091923_ihia_knowledge.sql`
- `tools/verify-ihia-db.mjs`
- `docs/IHIA.md`

Updated:

- `.env.example`, `.gitignore`, `README.md`, `vitest.config.ts`
- `src/app/dashboard/page.tsx`
- `src/app/api/pipecat/session/route.ts`, `route.test.ts`
- `src/app/api/voice-partner/turn/route.ts`
- `pipecat-agent/scenario.py`, `pipecat-agent/tests/test_scenario.py`

Recording analysis requires a separate checkbox confirming both participants consent to OpenAI transcript processing and report storage. The API requires `analysisConsent: true` for IHIA recording requests. Original recording consent now accurately describes existing transcript storage.
