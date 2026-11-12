> Saved from `tools/benchmark/out/repeat-2-evaluator/REPEAT-REPORT.md` (2026-11-12, after the eval-2.0.0 repair and max_tokens 6000). 0 of 200 runs failed (before: 85 of 100). Decision: evaluator runs at temperature 0. Score bands at t=0 (one repeat, 231 scores): 1=42, 2=31, 3=37, 4=112, 5=9 — leans on band 4; watch in the pilot.

# Repeat-run reliability: repeat-2-evaluator

Each fixture was scored several times with identical input. Spread is the sample standard deviation of one
fixture's scores across repeats, in score points (0-100). The improvement engine counts a move of 5 points as
real change. The concern is disproved when mean spread is under 2 points on every dimension and the
90th-percentile fixture stays under 5.

Fixtures are synthetic. This measures repeatability only, not whether any score is right.

## Session evaluator (Deep Analysis): claude-haiku-4-5-20251001

Verdict: **UNSTABLE**. 20 fixtures x 5 repeats, 0 failed runs (excluded).

| Dimension | Fixtures | Mean spread | P90 spread | Max spread | Range > 5 pts | Null vs number flips |
|---|---|---|---|---|---|---|
| objection_handling | 15 | 5.3 | 9.3 | 10.8 | 73% | 15% |
| adapt.directness | 20 | 5.3 | 10.5 | 17.9 | 65% | 5% |
| value_communication | 19 | 5.0 | 7.8 | 9.5 | 79% | 30% |
| adapt.evidence_orientation | 12 | 4.9 | 7.4 | 14.8 | 75% | 20% |
| relevance | 20 | 4.9 | 10.8 | 11.6 | 70% | 10% |
| adapt.detail | 20 | 4.6 | 8.8 | 9.8 | 75% | 0% |
| adapt.structure | 20 | 4.3 | 6.8 | 10.6 | 75% | 10% |
| discovery | 19 | 4.0 | 9.0 | 10.8 | 63% | 10% |
| closing | 13 | 3.8 | 7.2 | 11.7 | 69% | 0% |
| adaptation_mean | 20 | 3.6 | 6.5 | 7.2 | 75% | 0% |
| evidence_use | 11 | 3.5 | 9.3 | 10.0 | 46% | 5% |
| adapt.questioning | 20 | 3.5 | 6.7 | 10.9 | 45% | 10% |
| listening | 20 | 3.0 | 5.2 | 10.9 | 35% | 0% |
| questioning | 19 | 2.0 | 4.2 | 8.2 | 21% | 10% |
| opening | 10 | 1.4 | 3.6 | 6.5 | 20% | 0% |
| adapt.pace | 0 | n/a | n/a | n/a | n/a | 0% |
| adapt.warmth | 0 | n/a | n/a | n/a | n/a | 0% |

## Session evaluator (Deep Analysis): claude-haiku-4-5-20251001@t=0

Verdict: **STABLE**. 20 fixtures x 5 repeats, 0 failed runs (excluded).

| Dimension | Fixtures | Mean spread | P90 spread | Max spread | Range > 5 pts | Null vs number flips |
|---|---|---|---|---|---|---|
| adaptation_mean | 20 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| opening | 10 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| questioning | 19 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| discovery | 19 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| listening | 20 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| relevance | 20 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| value_communication | 16 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| evidence_use | 10 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| objection_handling | 13 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| closing | 13 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| adapt.detail | 20 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| adapt.evidence_orientation | 12 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| adapt.questioning | 19 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| adapt.structure | 20 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| adapt.directness | 20 | 0.0 | 0.0 | 0.0 | 0% | 0% |
| adapt.pace | 0 | n/a | n/a | n/a | n/a | 0% |
| adapt.warmth | 0 | n/a | n/a | n/a | n/a | 0% |

## What to decide from this

- If UNSTABLE at the provider default, rerun with the same model plus `@t=0` and compare. Setting temperature 0 in production is a one-line change per route.
- If the analyst stays unstable at `@t=0`, the cause is which behaviors are found, not the arithmetic. Then stop multiplying points by the model's own confidence (`scoring/engine.ts`) and raise `minObservations`.
- If the evaluator is unstable, fix it (audit item 5) before the pilot freezes its prompt version.
