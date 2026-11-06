# Behavioral validation protocol (version bvp-1.0.0)

An exploratory pilot to find out whether StyleShift's behavioral coaching can be trusted. It is not a proof of field effectiveness. Statistics and decision rules are in `measurement-methodology.md`; rating instructions are in `human-rating-rubric.md`.

## 1. Questions

1. Does StyleShift observe representative behavior accurately?
2. Do its scores agree reasonably with trained human assessors?
3. Does it understand Iraqi Arabic and pharmaceutical terms?
4. Does repeated coaching go with measurable improvement?
5. Is the result useful enough for a manager to coach better?

Higher simulation scores are not proof of better field selling. This pilot cannot show that.

## 2. Participants (targets, not recruited people)

- 12 to 20 pharmaceutical representatives, each with written consent.
- 2 to 3 independent expert assessors, trained and calibrated (section 7).
- 1 pilot administrator who sets up and monitors, and does not rate.
- Optional: managers who record field observations through the existing manager follow-up (reported as manager-confirmed, never as independently verified).

## 3. Scenarios

Four scenario types, each with a first version (v1) and an alternate (v2) that changes the specialty, the objection topic and the surface wording but keeps the same underlying challenge. The product is **synthetic** ("Cardivex", a placeholder). Clinical content comes only from an approved, source-controlled facts pack supplied by the company. If none is supplied, scenarios use only these neutral statements: it is a tablet, taken once daily, and no efficacy, safety or dosing claim beyond the facts pack is available. A doctor character may ask for evidence the pack does not contain; the correct representative behavior is to say so, not to invent it.

| ID | Doctor's usual tendency | Situation | What good behavior looks like |
|---|---|---|---|
| A | Analytical: wants evidence and a clear comparison | A specialist asks how the product differs from a standard option | Gives only pack-supported points; says plainly when evidence is not available; offers to bring it |
| B | Directive: short and to the point | Two minutes available, wants one clear message | Short opening, one relevant message, a specific next step |
| C | Relationship-oriented | Raises a concern from a previous patient experience and expects attention | Listens, reflects the concern accurately, does not rush to the pitch |
| D | Starts welcoming | Becomes skeptical after a vague or unsupported claim from the representative | Notices the change and responds to it (repair: clarify, source, or withdraw the claim) |

These describe a **simulated doctor's configured tendency**, not a finding about any real doctor.

## 4. Trait and state, kept apart

A **tendency** is the doctor's usual interaction preference. A **state** is the observable condition right now. A **trigger** is an event that may change it. The aim is to test whether StyleShift rewards **genuine adaptation** rather than copying a style label.

Observable state variables (all simulated, none psychological measurements):

| Variable | Values |
|---|---|
| time_available | long (10 min or more), short (about 2 min) |
| engagement | high, medium, low |
| skepticism | low, medium, high |
| evidence_sufficient | yes, no (from the doctor's point of view, given what the representative has said) |
| next_step_open | yes, no |

Transition rules (deterministic, so repeated runs can be compared):

| Scenario | Start state | Trigger | New state | Repair that reverses it |
|---|---|---|---|---|
| A | skepticism medium, evidence_sufficient no | Representative gives a claim with a source from the facts pack | evidence_sufficient yes, skepticism low | none needed |
| A | same | Representative gives a claim not in the facts pack | skepticism high, next_step_open no | Representative says it is not in the approved material and offers to bring it |
| B | time_available short, engagement medium | Representative speaks more than about 40 seconds without a question or a point | engagement low | Representative shortens and asks for the decision point |
| C | engagement medium, skepticism low | Representative moves to the pitch before reflecting the concern | skepticism medium, engagement low | Representative returns to the concern and reflects it |
| D | engagement high, skepticism low | Representative makes a vague claim ("most doctors prefer it", "it is the best") with no number or source | skepticism high, engagement medium | Representative clarifies or withdraws the claim and gives a sourced point |

Implementation requirement for a later pull request: scenario definitions are stored as versioned data (including these rules); every run records the scenario version and each state change with the turn it happened on. **Consistency check:** over repeated runs of the same scenario with a scripted representative, the share of runs where the state changed on or after the trigger turn and never before it is reported with its denominator. If a language model drives the transitions, this check is what shows whether it follows the rules.

Existing code already stores per-turn physician-state snapshots (trust, skepticism, engagement, time pressure) from the AI judge. They are reused as logged signals, not as ground truth, and they are not shown to representatives as measurements of a real person.

## 5. Design and safeguards

Each representative has at least three rated sessions:

1. **Baseline** on scenario P v1 (P rotates across representatives in a Latin square so each scenario type is the baseline for about a quarter of them).
2. **Coached practice**: the targeted drill (chosen from the AI roadmap at baseline) and a repeat of P v1. Optionally rated.
3. **Follow-up**: P v2 (alternate version of the baseline scenario) and Q v1 (a scenario type the representative has not seen). Both rated.

Safeguards:
- Scenario order counterbalanced by the Latin square; alternates v2 kept comparable.
- Every session records whether the representative had seen the scenario before ("seen before" flag) and which coaching activities were completed.
- Assessors are blind to AI scores and, where practical, to baseline or follow-up.
- Missing sessions and withdrawals are recorded with the reason and reported.
- A delayed-coaching group is used if the setting allows (measurement-methodology, section 6).

## 6. Data, consent and privacy

- Written consent from every representative and, for any recording, every participant. No real doctor or customer audio is used in the pilot; the doctor is simulated or a trained colleague.
- Assessors see de-identified transcripts and audio only for the sessions assigned to them. They have no manager or administrator access.
- Recordings and names are kept out of logs, exports and the executive report. Public reports contain aggregates only.
- Synthetic fixtures are used for all software testing, and marked as such.

## 7. Assessor training and calibration

1. Read `human-rating-rubric.md` and the calibration library (to be built from synthetic or consented, de-identified conversations).
2. Rate six calibration conversations independently, then discuss differences.
3. An assessor may begin when their weighted kappa with the calibration reference is at least 0.60 on the calibration set. This is a design choice. If not met, retrain on new calibration cases.
4. Recalibrate if two assessors' agreement falls below 0.50 on any ten consecutive sessions.

## 8. Roles and who can see what

| Role | Can see |
|---|---|
| Representative | Own sessions, coaching assignments, own progress |
| Assessor | Only assigned de-identified cases and their own ratings, until they submit |
| Manager | Authorized team progress and appropriately shared evidence |
| Pilot administrator | Coordination and aggregate results; never an individual's ratings before submission |
| Platform administrator | Operations and security review |

## 9. Versioning

Recorded with every result: rubric (`hrr-1.0.0`), methodology (`mm-1.0.0`), protocol (`bvp-1.0.0`), scenario set version, AI model, prompt version, scoring configuration, transcript processing configuration, benchmark dataset revision. A change to any of them is a new version; historical results stay readable under the version that produced them.

## 10. Stop rules

Pause the pilot and report if: any privacy or security incident occurs; an assessor or representative withdraws consent; more than 25% of planned sessions are missed in the first two weeks; or the AI produces a major error that would have misled a manager and the cause is not understood.
