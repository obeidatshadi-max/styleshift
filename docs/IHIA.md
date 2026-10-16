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

Migration `20261016074203_ihia_knowledge.sql` adds `ihia_reviewers`, `ihia_entries`, `ihia_history` and private audit trigger functions.

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

   This applies **all pending local migrations**. Review the pending list first. Existing filenames mix numeric/timestamp conventions; do not repair remote history for this feature. Alternatively execute only `supabase/migrations/20261016074203_ihia_knowledge.sql` in the nonproduction SQL editor. This task did not apply a migration to any hosted database.

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

## All modified files

New:

- `src/lib/ihia/core.ts`, `medical.ts`, `behavior.ts`, `market.ts`, `server.ts`
- `src/lib/ihia/core.test.ts`, `market.test.ts`, `server.test.ts`
- `src/app/api/ihia/interpret/route.ts`, `knowledge/route.ts`, `ihia.test.ts`
- `src/app/ihia/page.tsx`
- `src/components/IhiaPanel.tsx`, `IhiaPanel.test.tsx`
- `supabase/migrations/20261016074203_ihia_knowledge.sql`
- `tools/verify-ihia-db.mjs`
- `docs/IHIA.md`

Updated:

- `.env.example`, `.gitignore`, `README.md`, `vitest.config.ts`
- `src/app/dashboard/page.tsx`
- `src/app/api/pipecat/session/route.ts`, `route.test.ts`
- `src/app/api/voice-partner/turn/route.ts`
- `pipecat-agent/scenario.py`, `pipecat-agent/tests/test_scenario.py`
