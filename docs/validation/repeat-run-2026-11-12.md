> Saved from `tools/benchmark/out/repeat-1/REPEAT-REPORT.md` (run on main 6922fbd + the repeat harness, 2026-11-12, Haiku 4.5, 400 scorings).
>
> **Decisions taken from it:** the Behavior Analyst now runs at temperature 0 in production (`ANALYST_REQUEST`).
> **Evaluator result is not usable:** 85 of 100 evaluator runs failed in both settings. A probe showed the cause: the response hits `max_tokens` 2000 and the JSON is cut off (every Iraqi and code-switched fixture, and 4 of 7 English ones). So production Deep Analysis currently fails on most sessions, Arabic almost always. Fixed in the evaluator-repair change (audit item 5), then re-measured.

# Repeat-run reliability: repeat-1

Each fixture was scored several times with identical input. Spread is the sample standard deviation of one
fixture's scores across repeats, in score points (0-100). The improvement engine counts a move of 5 points as
real change. The concern is disproved when mean spread is under 2 points on every dimension and the
90th-percentile fixture stays under 5.

Fixtures are synthetic. This measures repeatability only, not whether any score is right.

## Behavior Analyst + scoring engine: claude-haiku-4-5-20251001

Verdict: **UNSTABLE**. 20 fixtures x 5 repeats, 0 failed runs (excluded).

- First coaching point differs between repeats: 85% of fixtures.
- Behavior sets found, mean pairwise overlap (Jaccard): 63%.

| Dimension | Fixtures | Mean spread | P90 spread | Max spread | Range > 5 pts | Null vs number flips |
|---|---|---|---|---|---|---|
| objection_handling | 12 | 3.2 | 5.8 | 7.7 | 58% | 10% |
| discovery | 19 | 2.8 | 5.0 | 9.9 | 53% | 25% |
| active_listening | 16 | 2.1 | 4.1 | 7.8 | 38% | 25% |
| questioning | 17 | 1.9 | 3.4 | 3.9 | 35% | 15% |
| closing | 20 | 1.3 | 2.9 | 7.1 | 20% | 5% |
| value_communication | 20 | 1.1 | 2.5 | 6.2 | 10% | 15% |
| overall | 20 | 1.1 | 1.9 | 2.1 | 0% | 0% |
| adaptation | 15 | 0.9 | 3.8 | 6.0 | 13% | 60% |

## Session evaluator (Deep Analysis): claude-haiku-4-5-20251001

Verdict: **INSUFFICIENT**. 4 fixtures x 5 repeats, 85 failed runs (excluded).

| Dimension | Fixtures | Mean spread | P90 spread | Max spread | Range > 5 pts | Null vs number flips |
|---|---|---|---|---|---|---|
| adapt.pace | 3 | 12.8 | 29.0 | 35.9 | 33% | 0% |
| adapt.directness | 3 | 10.5 | 21.1 | 25.6 | 100% | 0% |
| adapt.detail | 3 | 7.0 | 7.7 | 7.8 | 100% | 0% |
| adaptation_mean | 3 | 6.7 | 10.2 | 11.4 | 100% | 0% |
| listening | 3 | 4.2 | 7.4 | 8.7 | 33% | 0% |
| objection_handling | 1 | 4.1 | 4.1 | 4.1 | 100% | 0% |
| adapt.structure | 3 | 3.1 | 4.4 | 4.8 | 67% | 0% |
| adapt.warmth | 2 | 2.9 | 5.2 | 5.8 | 50% | 100% |
| relevance | 3 | 2.8 | 4.4 | 5.0 | 33% | 0% |
| questioning | 3 | 2.6 | 4.3 | 4.6 | 67% | 0% |
| adapt.questioning | 3 | 2.5 | 3.9 | 4.0 | 67% | 0% |
| discovery | 3 | 2.1 | 3.3 | 3.5 | 67% | 0% |
| closing | 3 | 1.9 | 3.6 | 4.1 | 33% | 33% |
| value_communication | 2 | 1.4 | 1.7 | 1.7 | 0% | 33% |
| opening | 2 | 0.8 | 1.5 | 1.6 | 0% | 0% |
| evidence_use | 1 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| adapt.evidence_orientation | 1 | 0.0 | 0.0 | 0.0 | 0% | 0% |

## Behavior Analyst + scoring engine: claude-haiku-4-5-20251001@t=0

Verdict: **STABLE**. 20 fixtures x 5 repeats, 0 failed runs (excluded).

- First coaching point differs between repeats: 5% of fixtures.
- Behavior sets found, mean pairwise overlap (Jaccard): 98%.

| Dimension | Fixtures | Mean spread | P90 spread | Max spread | Range > 5 pts | Null vs number flips |
|---|---|---|---|---|---|---|
| questioning | 14 | 0.2 | 0.0 | 3.3 | 7% | 0% |
| discovery | 16 | 0.2 | 0.0 | 3.5 | 6% | 5% |
| overall | 20 | 0.1 | 0.0 | 1.3 | 0% | 0% |
| objection_handling | 11 | 0.0 | 0.0 | 0.5 | 0% | 0% |
| active_listening | 12 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| adaptation | 11 | 0.0 | 0.0 | 0.0 | 0% | 5% |
| value_communication | 19 | 0.0 | 0.0 | 0.0 | 0% | 5% |
| closing | 20 | 0.0 | 0.0 | 0.0 | 0% | 0% |

## Session evaluator (Deep Analysis): claude-haiku-4-5-20251001@t=0

Verdict: **INSUFFICIENT**. 3 fixtures x 5 repeats, 85 failed runs (excluded).

| Dimension | Fixtures | Mean spread | P90 spread | Max spread | Range > 5 pts | Null vs number flips |
|---|---|---|---|---|---|---|
| adaptation_mean | 3 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| opening | 2 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| questioning | 3 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| discovery | 3 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| listening | 3 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| relevance | 3 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| value_communication | 2 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| evidence_use | 1 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| objection_handling | 1 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| closing | 2 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| adapt.pace | 3 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| adapt.detail | 3 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| adapt.evidence_orientation | 1 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| adapt.questioning | 3 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| adapt.structure | 3 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| adapt.directness | 3 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| adapt.warmth | 1 | 0.0 | 0.0 | 0.0 | 0% | 0% |

## What to decide from this

- If UNSTABLE at the provider default, rerun with the same model plus `@t=0` and compare. Setting temperature 0 in production is a one-line change per route.
- If the analyst stays unstable at `@t=0`, the cause is which behaviors are found, not the arithmetic. Then stop multiplying points by the model's own confidence (`scoring/engine.ts`) and raise `minObservations`.
- If the evaluator is unstable, fix it (audit item 5) before the pilot freezes its prompt version.
