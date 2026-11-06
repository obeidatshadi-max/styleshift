# StyleShift: coaching effectiveness and validation readiness

**Data source: none yet. No pilot has been run.** This page records what is known today. Every "not measured" below means exactly that. Replace each line with measured results only from real pilot data, with its denominator and period.

Prepared 2026-11-06. Methods: `measurement-methodology.md` (mm-1.0.0). Protocol: `behavioral-validation-protocol.md` (bvp-1.0.0).

## Page 1: executive decision sheet

**Recommendation: INSUFFICIENT EVIDENCE.** The minimum sample (12 representatives with baseline and follow-up, 30 double-rated sessions, 100 adjudicated AI claims, 150 reviewed Arabic utterances) has not been reached because no pilot data exists.

| Question | Verdict today | Basis |
|---|---|---|
| Is the platform safe and operationally ready? | **CONDITIONAL** | Phase A audit. Security hardening applied to production and checked in the database catalog. Not yet confirmed: a signed-in rep and manager walk-through, Auth and Netlify settings, the Health360 tables that share the project. The migration files do not fully match production (a baseline snapshot is still to be committed) |
| Can its behavioral evaluations be trusted? | **INSUFFICIENT EVIDENCE** | The evaluator and report cite real transcript lines, so evidence cannot be invented. Whether their scores agree with trained human assessors has not been measured. |
| Does it understand the target market's language? | **INSUFFICIENT EVIDENCE** | Transcription is Whisper with the language pinned. No Iraqi Arabic benchmark has been run. |
| Are representatives actually improving? | **INSUFFICIENT EVIDENCE** | The engine reports within-simulation change from a rep's own history. It has not been compared with blinded human ratings, and no field outcome exists. |
| Is there enough evidence to expand commercially? | **No** | Nothing above is demonstrated yet. |

**Major risks**
1. The AI's scores may disagree with expert judgement in ways nobody has measured. A manager could act on a wrong score.
2. Arabic transcription errors that flip meaning (for example a negation) could produce a wrong coaching conclusion.
3. The database in production no longer matches the migration files, so a rebuild or a staging copy would not behave like production.

**Three priority management actions**
1. Approve the pilot: recruit 12 to 20 representatives and 2 to 3 expert assessors, and supply the approved product facts pack. Nothing else produces evidence.
2. Commit a baseline snapshot of the production database schema, then complete the signed-in rep and manager walk-through, so the security gate can move from CONDITIONAL toward PASS.
3. Arrange consented recordings and Iraqi pharmaceutical reviewers for the Arabic benchmark.

## Page 2: technical appendix

### Indicators (initial targets, see methodology section 4)

| Indicator | Target | Result | n (denominator) | Period | Status |
|---|---|---|---|---|---|
| Rater agreement (weighted kappa or ICC) | at least 0.70 | not measured | 0 sessions | n/a | NOT ENOUGH DATA |
| AI-human agreement (weighted kappa) | at least 0.65 | not measured | 0 sessions | n/a | NOT ENOUGH DATA |
| Unsupported major AI claims | at most 2% | not measured | 0 claims | n/a | NOT ENOUGH DATA |
| Evidence-reference validity | at least 95% | not measured | 0 references | n/a | NOT ENOUGH DATA |
| Critical negation meaning preserved | at least 98% | not measured | 0 utterances | n/a | NOT ENOUGH DATA |
| Planned sessions completed | at least 85% | not measured | 0 planned | n/a | NOT ENOUGH DATA |
| Targeted behavior change | positive, survives sensitivity checks | not measured | 0 representatives | n/a | NOT ENOUGH DATA |
| Critical privacy or security incidents | 0 | none known to the author; not independently audited | n/a | n/a | not assessed |

### Methods and versions
Rubric `hrr-1.0.0`; methodology `mm-1.0.0`; protocol `bvp-1.0.0`; Arabic benchmark `iab-1.0.0`; AI model, prompt and scoring configuration: recorded per session when the pilot runs (not applicable today).

### Deployment evidence
Phase A: production catalog read on 2026-11-06 and re-read after the hardening; 45 database attack tests passing on a test database. Production access was the Supabase dashboard (read-only queries, plus one SQL run by the project owner). Deployed commit not independently confirmed.

### Test evidence
Full automated test suite passing at the time of writing; these tests check software behavior and say nothing about measurement validity.

### Limitations
No participants, no recordings, no expert ratings, no field outcomes. Simulated physician state (trust, skepticism, engagement, time pressure) is produced by a language model and is not a measurement of any real person. A simulation score is not evidence of field-sales effectiveness. A before-and-after comparison cannot show cause.
