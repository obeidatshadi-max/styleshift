# Iraq Scenario Pack — Design

**Date:** 2026-06-10
**Status:** Approved (design); implementation pending
**Owner:** Shadi

## Goal

Add an Iraq-localized set of training scenarios to StyleShift so Iraqi medical
reps see doctors, pharmacies, and field pressures that feel like their actual
day — without disrupting the app's cross-market (MSA) strategy or any existing
content. This is the cheapest high-impact win: it improves every level at once
and needs no new game mechanics.

## Decisions (locked)

| Question | Decision |
| --- | --- |
| Placement | **Additive Iraq pack** — append to existing pools; do not replace or fork. |
| Arabic register | **MSA throughout** (Iraqi names + contexts, but all Arabic text stays MSA, consistent with the rest of the app). |
| Scope | **All 4 levels, 8 scenarios each (~32 total)**, style-balanced 2/2/2/2. |

## Approach

Append new entries to the existing exported arrays in
`src/lib/game-data.ts` (`L1`, `L2`, `L3`, `L4`) and mirror them by identical IDs
in `src/lib/game-data-ar.ts`. The scenario engine (`pickScenarios` in
`src/lib/scenario-engine.ts`) already draws from whatever array it is handed, so
the combined pool is picked up automatically. **No engine, component, type, or
DB changes.**

Rejected alternative: a separate Iraq array merged at draw time, or a
selectable "market" mode. Same end result for the user, but more code surface,
more to test, and risk to the daily-challenge / "seen"-tracking logic. YAGNI.

### ID scheme

A `1xxx` block tags the pack and cannot collide with existing IDs
(L1 101–145, L2 201–2xx, L3 3xx, L4 4xx):

- L1 (Style Scan): `1101–1108`
- L2 (Crisis Mode): `1201–1208`
- L3 (Drive): `1301–1308`
- L4 (Boardroom): `1401–1408`

### Style balance

Each level: 2 Driver, 2 Expressive, 2 Amiable, 2 Analytical — so the engine's
`balancedPick` keeps spreading cleanly. (L4 items have no `style` field; balance
there is about scenario variety, not style.)

## Content rules

**Iraqi texture (what differentiates this from the existing pool):**

- Iraqi names — doctors: Haider, Mustafa, Zainab, Ali, Hassan, Noor, Sajjad,
  Duaa; pharmacy/buyers: Abu Ahmed, Um Zaid, Karrar.
- Real Iraqi field pressures: distributor **stockouts / supply gaps**; **price
  sensitivity vs. cheaper generics/imports** (dinar-conscious owner); **public
  formulary (Medical City / Kimadia-style procurement) vs. private clinic**;
  the **gatekeeper secretary**; the **competitor rep who "was here yesterday."**
- Settings: mostly Baghdad (Karrada, Mansour), with a nod to Basra/Erbil.

**Consistency (so it teaches the same framework):**

- The **win-logic is identical** to existing scenarios: Driver → bottom-line +
  options + control; Analytical → evidence/precision; Amiable → security /
  phased, supported path; Expressive → recognition + ideas/visibility. Iraqi
  flavor changes the *situation*, never the *correct answer's reasoning*.
- **Format matches exactly:**
  - L1 `L1Item`: `id, style, name, persona, cues[3]`.
  - L2 `L2Item`: `id, style, name, crisis, q, opts[3]` — exactly one `r:'win'`.
  - L3 `L3Item`: `id, multi, style?, name, persona, situation, q, opts[]` —
    exactly one `correct:true` (per existing pattern).
  - L4 `L4Item`: `id, q, opts[3]` each with `quota/morale/risk/why`; the "best"
    option is derived by `bestL4Index` (highest balanced score), matching
    existing L4 items.
- English authored first; MSA mirror keyed by the same ID in `game-data-ar.ts`.

## Files touched

- `src/lib/game-data.ts` — append 32 entries (8 per level).
- `src/lib/game-data-ar.ts` — append the MSA mirror (same 32 IDs).

No other files.

## Verification

1. `npx tsc --noEmit` (or the project's type-check) passes — confirms every
   item matches its interface and IDs are well-formed.
2. Manual invariant scan:
   - All new IDs unique and within the `1xxx` blocks.
   - Every L2 item has exactly one `r:'win'`; every L3 item exactly one
     `correct:true`.
   - Each level's 8 new items are style-balanced 2/2/2/2 (L1–L3).
   - `game-data-ar.ts` has an entry for every new ID in `game-data.ts`.
3. Smoke test in the running app: play L1–L4 and confirm Iraqi scenarios appear
   and render correctly in both EN and AR.

## Out of scope (future)

- Iraqi-dialect voice for L2 crisis lines (deliberately deferred; MSA for now).
- A selectable market mode (Iraq / Gulf / Levant).
- Pulling authentic objection scripts from the Wafi source docs.
