# Pilot execution guide

For the pilot administrator. Read `behavioral-validation-protocol.md` first. Steps marked **(needs build)** depend on software that does not exist yet (validation tables, rater workflow, statistics, dashboard: later pull requests). Until then, do those steps with a spreadsheet exported to the same column names, and move the data in once the tooling exists.

## 0. Before anything starts

1. Phase A is applied and the signed-in walk-through (rep and manager) is done. Production security gate is not "FAIL".
2. A baseline snapshot of the production schema is committed (Phase B tables depend on it).
3. The approved facts pack for the product is supplied and source-controlled. No pack means scenarios use only the neutral statements in the protocol.
4. The rubric, methodology and protocol versions are committed. Do not change them once ratings begin.

## 1. Set up

1. Decide the number of representatives (12 to 20) and assessors (2 to 3). Assign each representative a participant code. Keep the name-to-code list in one place, restricted to the administrator.
2. Collect written consent from every representative, and from every participant in any recording. Record the date and consent version.
3. Assign the baseline scenario type for each representative by the Latin square (rotate A, B, C, D across representatives so each type is the baseline for about a quarter). Write the plan down before the first session. **(needs build: pilot and assignment tables)**
4. Pick, for half the representatives if the setting allows, the delayed-coaching group. Record how it was chosen.

## 2. Train and calibrate assessors

1. Give each assessor the rubric and the calibration library.
2. Each rates the six calibration conversations alone, then they discuss differences.
3. Compute weighted kappa against the calibration reference. An assessor starts at 0.60 or above; otherwise retrain on new cases.
4. Record each assessor's calibration result and date.

## 3. Run sessions

For each representative:

1. **Baseline** (rated): scenario P v1. Record the seen-before flag (no).
2. The AI roadmap picks the targeted behavior from the baseline (the administrator does not choose it, and assessors do not see it).
3. **Coached practice**: the targeted drill and a repeat of P v1. Record the coaching activities completed.
4. **Follow-up** (rated): P v2 and Q v1. Record the seen-before flags (P v2: no, because it is an alternate; Q v1: no).
5. Record missed or withdrawn sessions with the reason on the same day.

Every session stores the scenario version, AI model, prompt version, scoring configuration and transcript version. **(needs build to capture automatically)**

## 4. Rate, blind and adjudicate

1. Export each rated session de-identified: transcript, and audio where it exists. Remove names and any identifying detail. Do not include any AI score or report.
2. Assign each session to two assessors. Where practical, hide whether it is baseline or follow-up.
3. Each assessor submits all nine domains with turn references and a one-line reason. They cannot see the other assessor's ratings or any AI output until they submit. **(needs build: assessor workflow)**
4. After both submit, show disagreements of 2 or more points on any domain to a third assessor for adjudication. The adjudication is a separate record linked to the two originals. The originals are never changed.
5. Separately, a blinded adjudicator marks each AI "major claim" as supported, partly supported or unsupported (measurement-methodology, section 5).

## 5. Analyse

Run the pre-specified analysis only. No new statistics may be added after seeing results, and no threshold may change. **(needs build: analysis code)**

1. Rater agreement per domain and pooled; ICC for the session mean.
2. AI-human agreement per domain, mean absolute error, and the sensitivity checks.
3. Unsupported-claim rate and evidence-validity rate with intervals.
4. Coaching change: targeted versus untargeted domains, same-scenario versus alternate-scenario, dose, and delayed-coaching comparison if used.
5. For each indicator, state the status (MET, MET UNCERTAIN, NOT MET, NOT ENOUGH DATA) and the numbers behind it.
6. State the recommendation by the rules in measurement-methodology, section 8. If a threshold is not met, name the causes and propose corrective actions; do not tune the threshold.

## 6. Arabic benchmark (runs alongside)

Follow `iraqi-arabic-benchmark.md`. Collect consented simulated clips, produce and adjudicate reference transcripts, then compare providers on the same dataset.

## 7. If something goes wrong

- **Privacy or security incident:** stop, record what happened, tell the project owner the same day. Critical incidents are counted in the report.
- **Assessor disagreement stays low:** recalibrate (protocol, section 7).
- **A representative withdraws:** delete their data on request and note it in the report as a withdrawal, without their details.
- **The AI states something unsupported that a manager acted on:** record it as a major error with the session code.

## 8. What the final report must contain

Dataset counts and denominators; status of each indicator; the interval for each number; error categories (major, moderate, minor); every limitation; and a data-source label on every chart (`synthetic`, `staging` or `pilot`). `ceo-readiness-report.md` is the template.
