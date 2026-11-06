# Measurement methodology (version mm-1.0.0)

Everything in this document is fixed **before** any pilot data exists. The git history of this file is the record. A number may not be changed after results are seen unless the change is recorded as a new version with the reason, and results under the old and new rule are both reported.

All values below are design choices for an exploratory pilot, not validated industry standards. Where a choice is arbitrary, it says so.

## 1. What is measured

1. **Rater agreement.** Do two trained assessors rate the same conversation alike? (`human-rating-rubric.md`, 1 to 5 ordinal scale, nine domains.)
2. **AI-human agreement.** Does the AI's score agree with each assessor?
3. **AI claim accuracy.** Are the AI's statements about what happened supported by the transcript?
4. **Evidence validity.** Does each cited line exist, belong to the right speaker, and support the claim?
5. **Arabic understanding.** Does transcription and interpretation keep the meaning? (`iraqi-arabic-benchmark.md`)
6. **Coaching change.** Does targeted practice go with measurable change? (section 6)
7. **Manager usefulness.** Do managers make different coaching decisions with the report? (a short structured questionnaire, descriptive only)

Model confidence is not validity. The conversation report states certainty in words (`stated`, `inferred`, `not_established`), not numbers; it is judged by comparing each certainty level with human adjudication (section 5), not by its own claim.

## 2. Data handling rules

- **Not observable is not zero.** NO ratings and null AI scores are excluded from the pair they affect, and the count excluded is always reported next to every statistic. They are never converted to a value.
- **Same session, same version.** Every rating records the rubric version, scenario version, AI model, prompt version, scoring configuration and transcript version. Results pooled across versions say so.
- **Independence.** Raters never see each other's ratings or any AI output before submitting. Raters are not told whether a session is baseline or follow-up where this is practical.
- **Disagreements are kept.** Original ratings are never overwritten. An adjudication is a separate record linked to the originals.
- **Real versus synthetic.** Every table, chart and export carries a data-source label: `synthetic`, `staging` or `pilot`. Synthetic data never appears in a pilot figure.

## 3. Statistics

| Question | Statistic | Notes |
|---|---|---|
| Rater agreement, per domain | Weighted Cohen's kappa, quadratic weights, two raters | One value per domain; also pooled across domains with a cluster bootstrap by session (domains within a session are not independent) |
| Rater agreement, session average | ICC(2,1), two-way random effects, absolute agreement, on each rater's mean of observed domains | Needs at least 2 observed domains per session |
| AI vs human, per domain | Weighted kappa (quadratic) between the AI's 1 to 5 conversion (rubric section 6) and each rater; report both raters and their mean | Sensitivity: cut points shifted by plus or minus 5; Spearman rank correlation with no cut points |
| AI vs human, size of error | Mean absolute error in rubric points, per domain | Reported next to the share of errors of 2 or more points |
| Unsupported claims | Proportion with Wilson 95% interval | Section 5 |
| Evidence validity | Proportion with Wilson 95% interval | Section 5 |
| Arabic | Word error rate and character error rate (raw and normalised), term accuracy, negation accuracy, meaning-preservation rate | `iraqi-arabic-benchmark.md` |
| Coaching change | Paired difference baseline to follow-up, Wilcoxon signed-rank test, bootstrap 95% interval of the mean difference (2000 resamples, fixed seed) | Section 6 |

Intervals for kappa and ICC use a percentile bootstrap over sessions (2000 resamples, fixed seed). With a pilot of 12 to 20 representatives and 3 rated sessions each (36 to 60 sessions), intervals will be wide; the report shows them and does not hide them.

## 4. Pre-specified targets and status rules

Targets (initial, from the pilot brief):

| Indicator | Target |
|---|---|
| Rater agreement | weighted kappa or ICC at least 0.70 |
| AI-human agreement | weighted kappa at least 0.65 |
| Unsupported major AI claims | at most 2% of evaluated major claims |
| Evidence-reference validity | at least 95% |
| Critical negation meaning preserved | at least 98% of reviewed cases |
| Planned sessions completed | at least 85% |
| Targeted behavior change | positive change in human ratings that survives the sensitivity checks |
| Critical privacy or security incidents | 0 |

Each indicator gets one of four statuses, decided by these rules:

- **MET**: the point estimate meets the target **and** the interval is not wide. For kappa and ICC: lower 95% bound above 0.50. For a proportion target: the nearer 95% Wilson bound is within 5 percentage points of the target. (The 0.50 floor and the 5-point tolerance are arbitrary design choices, stated here in advance.)
- **MET, UNCERTAIN**: the point estimate meets the target but the interval is wider than above.
- **NOT MET**: the point estimate is below the target.
- **NOT ENOUGH DATA**: the minimum sample in section 7 is not reached.

## 5. Claim and evidence adjudication

A **major claim** is an AI statement that (a) says the representative made a clinical, safety or comparative claim, (b) says an agreement or next step was reached, or (c) says the representative showed an important behavior (a performance finding rated as strength or priority). For each major claim a human adjudicator, blind to the AI score, marks it:

- **Supported**: the transcript shows it.
- **Partly supported**: part of it, or it overstates.
- **Unsupported**: the transcript does not show it, or contradicts it. This is the **major error**.

Evidence-reference validity is checked in two steps: the cited segment exists and has the right speaker (automatic, already tested), and a human judges that it supports the claim. The human step is what the 95% target measures.

For each certainty word, the unsupported rate is reported separately, so a report that says `stated` can be held to a stricter standard than one that says `inferred`.

## 6. Coaching change

**Primary outcome.** For each representative, the human-rated change (mean of the two raters) from baseline to the follow-up on an **alternate version of the baseline scenario** (transfer, not repetition).

**Which behavior is targeted.** The target is chosen at baseline from the **AI's** roadmap, not from the human ratings. The outcome is then measured by blinded human raters. Choosing the target from the same ratings that measure the outcome would build in regression to the mean: the lowest score tends to rise on its own.

**Controls inside the design.**
- Change in **untargeted** domains is reported beside change in the targeted domain. A general practice or familiarity effect shows up in both; the difference is the better estimate of targeted change.
- **Same-scenario repeat versus alternate scenario** are reported separately, so test familiarity is not read as coaching effect.
- **Dose** (completed coaching activities) is reported against change, descriptively.
- **Delayed-coaching comparison** when the pilot setting allows: half the representatives start coaching after the follow-up. If it is not used, the report says no comparison group existed.

**Four levels, never combined into one score:** practice improvement (inside simulations), behavioral transfer (alternate scenarios), field transfer (manager-confirmed or independently supported real visits), and business outcomes. Sales or prescription changes are not attributed to coaching, and are only reported with the external factors that could explain them and within compliance rules.

**Language.** A before-and-after comparison supports "changed", not "caused". Results are called exploratory unless a comparison group existed.

## 7. Minimum data before any recommendation

Below these, the status is NOT ENOUGH DATA and the recommendation can only be INSUFFICIENT EVIDENCE:

- 12 representatives with a baseline and a follow-up rating.
- 30 sessions rated by two independent assessors.
- 100 adjudicated major AI claims.
- 150 human-reviewed Arabic utterances, at least 40 of them containing clinically important negation.

These numbers are design choices.

## 8. Recommendation rules

- **GO**: security gate PASS; every indicator in section 4 MET; the minimum sample reached.
- **CONDITIONAL GO**: no indicator NOT MET; some indicators MET, UNCERTAIN, or the security gate is CONDITIONAL; the conditions are listed by name.
- **NO-GO**: any indicator NOT MET with enough data, or any critical privacy or security incident.
- **INSUFFICIENT EVIDENCE**: the minimum sample is not reached.

There is no weighted readiness score. Each gate is shown separately with its numerator, denominator and period.

## 9. Not allowed

- Changing a threshold, a cut point or an exclusion after seeing results.
- Reporting an overall "accuracy" percentage as a single number.
- Combining practice, transfer, field and business results.
- Describing synthetic data as pilot evidence.
- Treating a simulated physician state (trust, skepticism, engagement, time pressure) as a measurement of a real person.

## 10. Addendum A: choices the first analysis run had to make (2026-11-06, before any pilot data existed)

Writing the analysis (`src/lib/validation/analysis.ts`) showed four places where this document left a choice open. They are fixed here, in advance, so no result can influence them. Changing one later is a new version.

1. **Headline rater-agreement figure.** The target says "kappa or ICC at least 0.70". The status uses the **pooled weighted kappa** across domains (cluster bootstrap by session). The session-average ICC(2,1) is always reported beside it, not instead of it.
2. **Several raters on one case.** All unordered pairs of raters are used for kappa. The ICC uses each case's first two raters, ordered by rater id.
3. **Several adjudicators on one claim.** The claim takes the **majority** verdict. On a tie it takes the **more adverse** tied verdict (unsupported over partly supported over supported). The number of claims where adjudicators disagreed is reported.
4. **Recommendation order (section 8).** A critical incident, a failed security gate, or an indicator that is NOT MET (possible only once its minimum sample exists) is NO-GO. Otherwise, any indicator that is still unmeasured or under its minimum, or any unmet section 7 minimum, gives INSUFFICIENT EVIDENCE. Only then GO or CONDITIONAL GO. Synthetic and staging data never produce a recommendation (section 9).

Indicators the stored data cannot yet measure report NOT ENOUGH DATA with the reason, and so keep the recommendation at INSUFFICIENT EVIDENCE: evidence validity (no human judgement of each cited line is stored), planned sessions completed (no plan is stored), targeted behavior change (the AI-chosen target domain per representative is not stored; only overall change is reported, as exploratory), and Arabic negation (the benchmark has not been run).

