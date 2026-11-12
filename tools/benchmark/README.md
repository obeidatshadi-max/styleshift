# Model benchmark: Haiku 4.5 vs Haiku 5.5

Compares models for the Behavior Analyst and the Coach. The scoring engine is not touched, and no production route or model setting changes. Only the model (and optionally its request settings) varies.

## What it runs

60 synthetic sessions, written for this benchmark (`fixtures/`):
20 English, 20 Iraqi Arabic, 20 Iraqi Arabic with English medical terms. `iq-NN` is the Iraqi counterpart of `en-NN`, so the language gap is measured on the same scenario. Each fixture has an answer key: behaviors the Analyst should find (`must`) and tempting wrong ones (`mustNot`, "traps").

Stages, each run once per model variant:

1. **Analyst**: replays the transcript, grounds the output with the production rules, and scores it against the answer key.
2. **Coach**: runs on frozen input (gold observations from the key plus the deterministic scores), so Analyst differences cannot leak in.

A model entry is a model id plus optional settings: `claude-haiku-5-5@effort=low@mt=2` (`effort` sets `output_config.effort`; `mt` multiplies the agents' `max_tokens`). Pricing is looked up by the part before the first `@`.

## Commands

Run from the repo root. Replace `<env>` with a file that holds `ANTHROPIC_API_KEY` (the key is read but never printed).

```
npx vite-node --config vitest.config.ts tools/benchmark/run.ts -- run --dry-run              # offline test, no API calls
npx vite-node --config vitest.config.ts tools/benchmark/run.ts -- run --models "BASE,CAND1,CAND2" --run-id X --env-file <env>
npx vite-node --config vitest.config.ts tools/benchmark/run.ts -- review --run X --candidate CAND1   # blind review form
npx vite-node --config vitest.config.ts tools/benchmark/run.ts -- report --run X [--review scored.csv]
npx vite-node --config vitest.config.ts tools/benchmark/run.ts -- fixtures                    # sheet to check the Arabic fixtures
```

Results go to `tools/benchmark/out/<run>/` (git-ignored). A run resumes if interrupted. The run checks every model id and setting with one tiny request before spending anything.

## Repeat-run reliability

Scores the same fixtures several times with identical input and reports how much each score moves. Two scorers, each called exactly as production calls it: the Behavior Analyst plus the deterministic engine (text simulation), and the session evaluator (Deep Analysis, the AI side of the validation pilot).

```
npx vite-node --config vitest.config.ts tools/benchmark/run.ts -- repeat --dry-run
npx vite-node --config vitest.config.ts tools/benchmark/run.ts -- repeat --models "claude-haiku-4-5-20251001,claude-haiku-4-5-20251001@t=0" --repeats 5 --limit 20 --run-id R --env-file <env>
```

Defaults: 20 fixtures drawn evenly from English, Iraqi and code-switched; 5 repeats; both scorers (`--arm analyst|evaluator` to pick one). `@t=0` sets temperature 0; without it the provider default applies, as in production today. Output: `out/<run>/REPEAT-REPORT.md` and `repeat-summary.json`.

Per dimension it reports mean, 90th-percentile and max spread (sample standard deviation across repeats, in points), the share of fixtures whose range exceeds the improvement engine's 5-point noise floor, and how often a score flips between "not observable" and a number. For the analyst it also reports how often the first coaching point changes and how much the found behavior sets overlap. Verdict STABLE = mean spread under 2 points on every dimension and 90th percentile under 5.

## Blind review

`review` writes `review.html` (no model names inside) and `review-key.json` (keep it back). Give the colleague only `review.html`. They score each output 1-5 on six criteria and press Export CSV. Pass that file to `report --review`, which unblinds by joining with the key.

## Decision rules

In `report.ts` (`THRESHOLDS`): grounding rate may drop at most 3 points, planted-trap hit rate may rise at most 2 points, recall on Arabic fixtures may drop at most 5 points, retry and invalid-JSON rates must not rise, human review scores may trail by at most 0.1, and cost per session must fall 15% (or median latency 20%). Anything not yet measurable (no review scored, price unset) makes the answer INSUFFICIENT EVIDENCE.

## Known limits

- Fixtures are authored, not real. Real Iraqi recordings are still needed before relying on Arabic results.
- Quote matching lower-cases and strips quote marks only. Arabic spelling variants are not normalised.
- The English-only filters in `groundObservations` and `groundCoaching` (advice and score words) do not screen Arabic output.
- All fixtures are far below 100K tokens, so Haiku 5.5's higher long-prompt price tier is not exercised.
- `pricing.json` was checked on 2026-11-07 against the official pricing page. Update it when prices change.
