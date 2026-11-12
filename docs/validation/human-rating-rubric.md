# Human rating rubric (version hrr-1.0.0)

For trained assessors rating a de-identified pharmaceutical sales conversation. Rate only what the transcript and audio let you observe. This rubric does not ask you to infer hidden feelings, motives or personality, and you should not.

Do not look at any AI score or AI report before you submit your own ratings.

## 1. The scale

Each domain gets one rating from 1 to 5, or **NO** (not observable).

| Rating | Meaning |
|---|---|
| 1 | Clearly ineffective observable behavior. The representative did something that works against the aim of the domain. |
| 2 | Weak. Some attempt, but mostly ineffective or inappropriate. |
| 3 | Adequate. Reasonable, with clear gaps or inconsistency. |
| 4 | Good. Effective and appropriate in most of the conversation. |
| 5 | Strong. Repeated, clearly effective, context-appropriate performance, shown more than once. |

Rules:
- **NO is not a low score.** Use NO when the conversation gave no opportunity or no evidence for the domain (for example, closing in a conversation the doctor ended after one minute). Do not use 1 for "nothing happened".
- A 5 needs at least two separate pieces of evidence. A single good moment is a 4 at most.
- A 1 needs evidence of a problem, not just absence.
- Rate the representative's behavior, not the doctor's reaction. A good approach can fail with a difficult doctor and a poor one can succeed.
- If you are unsure between two ratings, give the lower one and say why in the note.

For every rating, cite at least one turn number (two for a 5, one or more for a 1 or 2). Add an **uncertainty** flag when the audio or transcript quality made the rating less reliable.

## 2. The nine domains

Each maps to existing StyleShift measures so the AI can be compared where a counterpart exists.

| # | Domain | Observable behavior | Existing StyleShift counterpart |
|---|---|---|---|
| 1 | Opening and purpose | States who they are and why they are here, clearly and appropriately for the time available | report: `opening`; evaluator: `opening` |
| 2 | Questioning | Asks relevant exploratory and follow-up questions; uses open questions to learn something | report: `questioning`; evaluator: `questioning` + `discovery`; metric `open_question_ratio` |
| 3 | Active listening | Responds accurately to what the doctor said; checks understanding; does not talk over | report: `listening`; evaluator: `listening`; metrics `paraphrase_score`, `active_listening` |
| 4 | Clinical communication | Gives only information supported by the approved material; links it to this doctor's concern; no invented claims | report: `evidence_use` + `value_linking`; evaluator: `evidence_use`, `value_communication`, `relevance` |
| 5 | Objection handling | Finds out the real concern before answering; answers that concern | report: `objection_handling`; evaluator: `objection_handling` |
| 6 | Style adaptation | Adjusts pace, detail, directness and structure to what this doctor visibly prefers | report: `adaptation`; evaluator adaptation dimensions (pace, detail, evidence_orientation, questioning, structure, directness, warmth); metric `adaptation_score` |
| 7 | State adaptation | Notices an observable change in the doctor's situation during the conversation and responds to it | **none** (see 4) |
| 8 | Composure | Stays constructive and clear when the conversation becomes difficult | **none** (see 4) |
| 9 | Closing | Establishes a specific next step that both people understand | report: `closing`; evaluator: `closing` |

## 3. Behavioral anchors

Positive and negative examples are for orientation. Use your own judgment on the whole conversation.

**1 Opening and purpose.** 5: states purpose in one or two sentences, fits the doctor's stated time, and is sure to check it works. 3: purpose given but long or generic. 1: starts with a product pitch before saying why they are there, or never says why.
**2 Questioning.** 5: two or more open questions that change what is said next; follows up on an answer. 3: some questions, mostly yes or no, few follow-ups. 1: no questions, or only leading questions.
**3 Active listening.** 5: repeats back the doctor's point accurately more than once and responds to it. 3: acknowledges but often answers a different point. 1: ignores or contradicts what the doctor said, or interrupts repeatedly.
**4 Clinical communication.** 5: statements trace to the approved material and are tied to the doctor's concern, more than once. 3: accurate but generic. 1: states a clinical, safety or comparative claim that is not in the approved material, or avoids a direct safety question. A 1 here also needs a "major error" flag (section 5).
**5 Objection handling.** 5: asks what is behind the objection, restates it, then answers that point. 3: answers the objection as stated without checking. 1: argues, dismisses, or answers a different objection.
**6 Style adaptation.** 5: pace, detail and structure visibly change to fit the doctor (for example shorter and numbers-first for a doctor who is short of time), more than once. 3: some adjustment, inconsistent. 1: same approach regardless of what the doctor asks for.
**7 State adaptation.** 5: names or acts on a visible change (time shortened, doubt raised, mood shifted) and changes approach in response, more than once. 3: notices late or only partly adjusts. 1: continues unchanged after a clear change. **NO** when the doctor's situation did not visibly change.
**8 Composure.** 5: stays clear and constructive through pushback or interruption, more than once. 3: wavers but recovers. 1: becomes defensive, hostile or incoherent under pressure. **NO** when there was no pressure.
**9 Closing.** 5: states a specific next step, confirms the doctor accepts it, and who does what by when. 3: a vague next step. 1: no next step although one was available. **NO** when the doctor ended the conversation first.

## 4. Domains with no AI counterpart

Domains 7 and 8 are rated by humans but compared with no AI score, because the evaluator has no matching dimension. They are reported on their own (rater agreement, change over time) and **excluded from AI-human agreement** until an AI measure exists and is stated in a new rubric version. Do not add AI scoring dimensions that duplicate existing ones.

## 5. Flags to raise

- **Major error (by the AI report, to be adjudicated later):** this is for the adjudication step, not for you. While rating, simply note any representative claim you think is unsupported (domain 4), any agreement you believe was reached, and any moment the doctor changed state.
- **Uncertainty:** poor audio, missing speaker label, or unclear Arabic wording made this rating less reliable.
- **Unscorable:** the whole session cannot be rated (empty, wrong language, not a sales conversation).

## 6. Comparing human ratings with the AI

The AI scores 0 to 100. To compare, the pilot converts those scores to 1 to 5 using fixed cut points set **before** any data: 0 to 19 = 1, 20 to 39 = 2, 40 to 59 = 3, 60 to 79 = 4, 80 to 100 = 5. This is an assumption, not a proven equivalence, so a sensitivity check repeats the comparison with cut points shifted by plus or minus 5 and with a rank-based correlation that needs no cut points. A null AI score stays null and is never turned into 0 or 1.

## 7. Rater instructions

1. Read the whole transcript before rating. Listen to the audio when it exists.
2. Rate one domain at a time. Do not let one strong domain lift the rest.
3. Write a one-sentence reason for each rating.
4. Submit all nine before seeing any other rater's ratings or any AI result.
5. If a conversation is in Iraqi Arabic with English medical terms, rate meaning, not accent or grammar.
6. Report anything that looks like identifying detail. Do not copy it into notes.

## 8. Versioning

This rubric is `hrr-1.0.0`. Any change to the scale, anchors or domains creates a new version. Every rating records the version it used, and results are never pooled across versions without saying so.

**AI evaluator version.** The session evaluator's prompt and grounding carry their own version (`EVALUATOR_PROMPT_VERSION` in `src/lib/session-evaluator.ts`, stored in each scorecard's `signals.evaluatorPromptVersion`). `eval-2.0.0` (2026-11-12) adds the shared context rules, the section 1 and 3 anchors with the section 6 bands, the "80+ needs two separate turns" and "no evidence = null" rules (enforced in code), and returns null for pace and warmth when there is no speech timing. Scorecards without a version predate it (`eval-1`). AI-human agreement is never pooled across evaluator versions.
