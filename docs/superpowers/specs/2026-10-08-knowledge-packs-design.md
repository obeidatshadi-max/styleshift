# Knowledge Packs - manager authoring and prompt grounding

Date: 2026-10-08. Status: design, awaiting review. Path: architectural (new subsystem).

## Why

The AI Doctor, the report coach and the behavior analyst have no company
facts to work from. Product claims stay generic, and the report prompt had to
forbid efficacy wording outright (PR #36) because a suggested phrase asserted
results nobody supplied. A knowledge pack gives the three agents an approved,
sourced set of facts to ground on, so the guardrail can be "use only these"
instead of "say nothing".

## What already exists (do not rebuild)

- `src/schemas/knowledge/index.ts` - pack/item schema, three content tiers derived
  from item kind, sources, draft/approved/retired status, and the rule that an
  approved clinical fact needs at least one source. `validateKnowledgePack`.
- `src/lib/knowledge-pack.ts` - `selectForPrompt` (tier filter per audience:
  doctor sees approved facts only; analyst adds company messaging; coach adds
  coaching notes), `renderPromptBlock` (separated tiers, explicit "NOT
  AVAILABLE" line for gaps), `findProhibitedClaimHits`.
- Table `public.knowledge_packs` (migration 035, applied to prod): `company_id`,
  `name`, `product_name`, `config jsonb`, `schema_version`, `status`
  (draft/approved/archived), `approved_by/at`. RLS: manager full access within
  their company; deliberately NO rep policy.
- `SimScenario.knowledgePackId` already stored by the scenario builder; the
  builder preview warns it is "not yet used by the doctor".

## Scope

In: manager API, manager "Product knowledge" panel, pack picker in the scenario
builder, prompt wiring for scenario sessions (doctor, report coach, analyst),
prohibited-claim review signal.

Out (decided): paste/upload and AI extraction of documents, Veeva or repository
sync, packs for Practice My Doctor / micro-drills / voice partner, any rep-visible
fact UI, automatic Arabic translation. Facts are typed in by the manager.

## Decisions

1. Flag `KNOWLEDGE_PACKS_ENABLED`, off by default, checked in every new route
   and component (same pattern as `scenarioBuilderEnabled()`).
2. No migration. `config` holds the validated `KnowledgePack`; the API runs
   `validateKnowledgePack` before every write (the database does not).
3. Two approval levels, both manager actions: item `status` inside `config`
   (draft -> approved -> retired) and pack `status` on the row. Only items that
   are approved AND in an approved pack ever reach a prompt.
4. The content is the manager's responsibility. The app enforces traceability
   (sources on approved facts) but cannot judge correctness or compliance. The
   panel says so in one line.
5. Arabic: each item has English and Arabic text independently; an item with no
   text in the session language is skipped, never translated. `arabicReviewed`
   is a manager-set flag; unreviewed Arabic is shown to the manager as such.
6. Reps can never read a pack. Prompt building uses the service-role client
   server-side, and only through `selectForPrompt`.

## Components

### 1. Library: `src/lib/knowledge-packs.ts` (server)
`knowledgePacksEnabled()`; `listPacks(companyId)`, `getPack(companyId, id)`,
`createPack`, `updatePack` (re-validates, bumps `version`), `setPackStatus`
(approve requires >= 1 approved item), `archivePack`. Mirrors
`src/lib/methodologies.ts`.

### 2. Routes: `src/app/api/knowledge-packs/`
`route.ts` (GET list, POST create), `[id]/route.ts` (GET, PATCH, DELETE =
archive), approval via PATCH `{ status }`. Manager-only via the existing role
check helper used by `/api/methodologies`; 404 when the flag is off.
`/api/knowledge-packs/approved` returns `{ id, name, productName }` for the
scenario picker (manager-only).

### 3. Manager panel: `src/components/dashboard/KnowledgePackPanel.tsx`
Mounted on `/dashboard/page.tsx` next to the scenario and methodology panels.
List of packs with status; editor with product name, indication, and items
grouped by tier. Item form: kind (select, tier shown read-only), English text,
Arabic text, topics, sources (title, type, reference, version), per-item status
and "Arabic reviewed" toggle. Validation errors from the API shown inline per
field. English-only UI, like the rest of the manager dashboard.

### 4. Scenario link
`SimScenarioBuilderPanel` gets a pack select (approved packs only) bound to
`knowledgePackId`. `scenario-persona.ts` stops emitting the "not yet used"
warning when the flag is on and the pack exists; emits a new warning when the
linked pack is archived or empty.

### 5. Prompt wiring (scenario sessions only)
A single helper `knowledgeBlockFor(scenario, audience, lang, topics?)` in
`src/lib/knowledge-pack.ts`'s sibling file loads the pack, runs `selectForPrompt`
and `renderPromptBlock`, and returns `''` when the flag is off, no pack is
linked, or the pack is not approved.
- Doctor (`src/agents/doctor/prompt.ts`): audience `doctor`. The doctor may
  challenge with approved facts, never volunteers messaging or coaching notes,
  and must not state facts outside the block.
- Report (`src/lib/report/buildReportPrompt.ts`, route
  `src/app/api/reports/generate/route.ts`): audiences `analyst` for the
  observation parts, `coach` for the coaching part. `NO_CLAIMS_RULE` stays; it
  gains one sentence: wording may use an approved fact by id, citing it, and
  may not go beyond it.
- Prohibited claims: `findProhibitedClaimHits` over the rep's turns, passed to
  the report as a deterministic "review signal" line. Never a score, never a
  verdict.
- Text simulation coach (`src/agents/coach/prompt.ts`): audience `coach`, same
  helper.

### 6. Failure behavior
Pack missing, archived, invalid or load error -> block is `''` and the session
runs exactly as today (generic). A load error is logged by reason only, never
the pack text. The prompt's "NOT AVAILABLE" line handles requested kinds that
have no approved item.

## Rollout (three PRs, each shippable alone)

1. Library, routes, manager panel, tests. Flag on locally only.
2. Scenario picker and `knowledgePackId` handling.
3. Prompt wiring and prohibited-claim signal.
Then enable `KNOWLEDGE_PACKS_ENABLED` in production and verify with the QA
manager (create a pack, approve, link, run a scenario as the QA rep, check the
doctor challenges with a fact and the report cites it).

## Testing

- Schema/API: approved fact without source rejected; unknown kind rejected;
  rep and other-company manager get 404/403; flag off returns 404; approving an
  empty pack rejected.
- Prompt tests: doctor block contains only `approved_fact` items; messaging and
  coaching notes absent from the doctor prompt; coach block includes all three
  tiers; draft/retired items and items without text in the session language are
  absent; empty selection yields `''`.
- Report: prohibited-claim hit appears as a signal line; no hit, no line.
- Live check on production with the QA accounts after rollout.

## Open points for review

- Is "manager approves their own facts" enough, or does a second person need to
  approve clinical facts? (Current design: one manager, no second approver.)
- Should the doctor be allowed to cite fact ids to the rep, or only use the
  content? (Current design: content only; ids appear in the coach/report.)

## Changes made while planning

- No separate `/api/knowledge-packs/approved` route: the scenario picker filters the list response for `status === 'approved'` (manager-only data either way).
- Coaching notes (`coaching_note`, tier `coaching_interpretation`) are not snapshotted onto the session because the rep can read their own session record. The coach therefore sees approved facts and company messaging only. Wiring coaching notes needs a server-side lookup at report time and is deferred.
- The doctor prompt includes item ids in the block but is told never to read them aloud.
- Editing an approved pack returns it to draft (clears the approval); the version rises on every save.
- The prompt block is capped at 6000 characters, dropping messaging before facts.
- A rep can read the snapshot in their own `agent_sessions` row through RLS: approved facts, approved messaging and the prohibited-claim phrase list for scenarios they ran. Nothing else from the pack is stored there.
