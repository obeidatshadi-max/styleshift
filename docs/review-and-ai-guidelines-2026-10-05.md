# StyleShift: product review and AI guidelines from the 3P workshop (2026-10-05)

Sources: the app at `pharma/styleshift-app` (code read, 625 tests passing), `notesnotes.docx` (workshop notes) and `BUSINESS PSYCHOLOGY CENTER.pptx` (147 slides, text only; images were not examined).

---

## Part 1. Review

### What is strong (keep)

- **Evidence-grounded scoring.** The Behavior Analyst's observations are checked against the transcript. A quote that is not in the transcript is dropped (`agents/behaviorAnalyst/ground.ts`). Scores come from a validated config (`scoring/scoring.config.json`: 7 competencies, 24 behaviors, repeat decay, confidence floor), not from the model's opinion.
- **Honest separation of roles.** The Doctor never coaches or grades. The Coach never scores. The post-call AI Coach says outright that it only has the rep's account. This is the right trust model.
- **Doctor realism.** A weighted style blend, a hidden concern, a physician state (trust, skepticism, engagement) and reactions to talk-too-long and open questions. Iraqi dialect handling is already hardened.
- **Closed loop in the Coach.** Debrief, then a practice focus, then a simulation with the same doctor, then the debrief shown in the doctor's Visit History.
- **Single dominant call to action** on Home (`NextActionCard`), an optional quiz and Level 1, offline shell, rate limits and owner-only RLS on debriefs.

### Functional and technical findings (ranked by effect on adherence)

| # | Finding | Evidence | Recommendation |
|---|---|---|---|
| 1 | **The post-call debrief asks for 7 required inputs.** "Get coaching" stays disabled until doctor, objective, success measure, an account of at least 20 characters and all 3 reflections are filled. A rep in a car after a visit will skip this. | `AICoach.tsx` button `disabled` condition | Make the account (voice or text) the only required input. Let the AI draft the objective and success measure from Visit Prep. Make the reflections optional. Offer a 60-second "quick debrief" mode. Voice on the three questions (done, below) lowers the cost but not the count. |
| 2 | **The Plan stage of the 3P cycle is missing from the app.** The workshop's loop is Collect, Plan, Execute, Evaluate. The Coach asks for the call objective after the visit. Visit Prep only displays an old objective in history, so no pre-visit SMART objective is set. | `grep objective VisitPrep.tsx` shows only the history display | Capture a strategic and an incremental objective (with product, indication, number of Rx, time frame) in Visit Prep. Pre-fill the debrief from it. Then "did you achieve it, with what evidence" becomes a real closed loop. |
| 3 | **No re-engagement mechanism.** A streak is computed (`lib/daily.ts`) but only feeds the daily leaderboard. `public/sw.js` is an offline shell with no push handler. There are no reminders and no spaced re-practice. | grep for streak, reminder and pushManager | Add a post-visit nudge ("you visited Dr X 2 hours ago, 60-second debrief?") and a next-morning "your one next action" card. Re-queue a skill 2 and 7 days after a weak result. The workshop's own thesis is that confidence comes from repetition, and the app should schedule it. |
| 4 | **The "next action" is never followed up.** The Coach returns `nextAction` and the doctor's history shows it, but the next debrief for the same doctor does not ask whether it was done. | `AICoach.tsx` and `useDoctorCoachDebriefs` | Open the next debrief for that doctor with "Last time you planned: X. Did you do it?" This is the cheapest strong adherence feature available. |
| 5 | **Transcription has no server-side size or duration limit.** The client caps at 3 minutes but `/api/transcribe` forwards any blob to Whisper. There is no rate limit on it (the debrief route has one). It sends no language hint, which hurts Iraqi Arabic accuracy. | `api/transcribe/route.ts` | Add a byte limit and a per-user rate limit. Pass `language` (`ar` or `en`) and a short vocabulary prompt (drug-class terms, "CLEAR"). |
| 6 | **Three disconnected scorecards.** The AI Doctor path scores text only. The colleague Live Roleplay path has the acoustic engine (WPM, pitch, silence, talk ratio). The post-call Coach has no scoring by design. The gap analysis already named this. | `docs/ai-doctor-gap-analysis.md`, `roleplay-core.ts` | Define one shared "call report" schema (Part 3) that all three surfaces fill, so progress is comparable across surfaces. |
| 7 | **Mixed UI paradigm and size.** `i18n.tsx` (1,842 lines) and `VisitPrep.tsx` (1,014 lines) are large. `AICoach.tsx` uses inline `copy(en, ar)` strings while the rest of the app uses `t()` keys, and the i18n integrity test cannot see inline strings. | file sizes, `i18n.integrity.test.ts` | Move Coach strings to `t()` keys over time so the key-integrity test covers Arabic. |
| 8 | **Legacy upload component.** `VoiceRecorder.tsx` (Visit Prep) has no 3-minute cap and no unmount cleanup, so the mic stays live if the user navigates away mid-recording. `useAudioRecorder` handles this correctly. | both files | Migrate `VoiceRecorder` to `useAudioRecorder`. |

### Workflow and adherence design

What makes a rep come back, mapped to this app:

1. **Reduce the cost of the first action** (finding 1). Voice first, typing optional.
2. **Make the next step obvious and small.** Home already does this. Extend it: after a debrief, the dominant card becomes "Practice this moment (3 min)", then "Your next visit objective".
3. **Close loops visibly.** Show last time's planned action (finding 4) and a "your skill moved from X to Y over N sessions" line. The behavioral-trends code exists; surface a single sentence on Home.
4. **Schedule repetition** (finding 3). Fits the workshop's "experience is events, not days".
5. **Social proof without exposure.** Leagues and standings exist. Keep private by default; show team practice counts, not scores, in the first weeks.
6. **Protect psychological safety.** Debrief history is private to the rep, which is right. State this at the point of entry, not only in the fine print.

### Change made in this session (item 2 of the request)

The three reflection questions in the AI Coach debrief now each have an **Answer by voice** button (`AICoach.tsx`). Behavior:

- One tap starts recording, a second tap stops it, and the audio is transcribed straight into that question's text box (appended, still editable). No listen-back step, because these answers are short.
- Only one microphone can be active at a time. Other mic buttons are disabled while recording or transcribing.
- The 3-minute auto-stop also transcribes, so a long answer is not lost.
- The existing "Record my recollection" flow for the main account is unchanged (it keeps the listen-back and manual transcribe steps).
- The mic is released when the user leaves the section (the existing `recorder.abort()` cleanup).
- A new test covers a spoken answer going into one field only. Full suite: 625 passed, `tsc` clean. **Not yet checked in a real browser, and not committed.** Real mic and transcription need `TRANSCRIPTION_ENABLED=true` and `OPENAI_API_KEY` on the deployment; without them the button reports "transcription unavailable" and the text box still works.

---

## Part 3. Guidelines extracted from the workshop notes and deck

### 3.1 The model the AI must be faithful to

**3P cycle: Collect, Plan, Execute, Evaluate.** Execute has five call steps:

1. **Engage** (capture attention with a statement about the customer's own problem).
2. **Gain insights** (strategic questions plus active listening).
3. **Offer solutions** (features turned into benefits for this doctor's patients).
4. **Address concerns** (five objection types, then CLEAR).
5. **Gain commitment** (agreement, then commitment).

The notes add two cross-cutting rules: *to take information, give information first*, and *start from the customer's position and bring them gradually to yours* (common ground is the patient).

### 3.2 Observable rubric (what a transcript can show)

| Call step | Good (reward) | Poor (flag) | Source |
|---|---|---|---|
| Opening | Declaration about a specific patient type or problem, about 40 seconds, ties to the call objective | "Today I want to talk about [product]", "I'm here to remind you why to prescribe", a closed demographic question | Notes; slides 45-52 |
| Questions | "What challenges do these patients face?" and "What criteria do you look for in these patients?" Open for needs, closed for a precise decision | **Forbidden:** "Why do you prescribe X?" and "What do you prescribe in this indication?" Leading questions, a statement where a question would do | Notes; slides 57-60 |
| Listening | Paraphrase, summary, repeating the last three words, validating the feeling | Interrupting, jumping to pitch after a concern | Notes; slide 61 |
| Solutions | Feature stated, then benefit tied to a need the doctor named; approved claims only | Generic claims, unsupported numbers | Slides 63-65 |
| Objections | Correct type diagnosed, matched response, CLEAR followed, "and/however" instead of "but", re-check at the end | Arguing, ignoring, discounting before understanding | Notes; slides 120-128 |
| Commitment | Summary, then an agreement question ("does this make sense for your patients?"), then a specific commitment, then silence | Asking before needs are covered and concerns resolved; a vague "think about it" | Slides 130-141 |
| After the call | The four "coach yourself" questions, sharing learnings, next call plan | No reflection | Slides 143-146 |

**Objection type → response** (matches the app's `ObjectionType`: `wrong_info`, `doubt`, `true_objection`, `indifference`, `false_objection`):

| Type | Response |
|---|---|
| Misunderstanding (`wrong_info`) | Clarify and correct |
| Skepticism (`doubt`) | Third-party evidence |
| Explicit / true (`true_objection`) | Normalize, generalize, minimize |
| Indifference (`indifference`) | Gain insight, discover the need |
| False (`false_objection`) | Explore patiently; the price objection often hides the real one |

**Style adaptation** (for Doctor behavior and for the Coach's advice):

| Style | Wants | Avoid |
|---|---|---|
| Driver | Direct, brief, final results, options, decides alone | Detail, small talk |
| Analytical | Preparation, proof, third-party support, step by step, time to decide | Pressure, vagueness |
| Amiable | Sincerity, personal relationship, safety, slow pace, simple | Rushing, confrontation |
| Expressive | Enthusiasm, recognition, practical ideas, quick action, asking for advice | Heavy detail, coldness |

### 3.3 AI Coach (post-call, self-reported)

The Coach cannot see the call, so it may only judge the rep's *account* and must say so. Guidelines:

1. **Step coverage, not a score.** From the account, list which of the 5 call steps are mentioned and which are absent. Phrase absence as "not mentioned in your account" and not as "you did not do it".
2. **Classify the objection reported** into the five types, state the matching response, and ask whether the rep used it. If the rep reports a price objection, ask what lay behind it (workshop: it often hides the real one).
3. **Agreement versus commitment.** Detect whether the rep asked for agreement, then commitment, and whether the commitment was specific (product, patient type, dose, date). If not, the practice focus is "linked question close" or "action close".
4. **Close the loop on the objective.** Compare the stated objective and success measure with the evidence reported. Where evidence is thin, say so (already in the prompt).
5. **Extend the reflection questions** with the workshop's "coach yourself" set, as optional prompts: *what will I do differently with this doctor and others*, *what knowledge or technique do I need to improve*, *what result do I want*, *what support do I need*. Add *who should hear this learning* (team leader, KAM, medical, marketing, per slide 145).
6. **Collect-stage updates.** Ask 1 or 2 optional questions that feed the doctor profile: patient type seen in the waiting room, the doctor's stated selection criteria, signals of style. Save these as *hypotheses with a confidence label*, never as facts.
7. **Output one SMART incremental objective** for the next visit (number, product, indication, time frame), consistent with the long-term strategic objective. This ties Evaluate back to Plan.
8. **Language rules** for the AI's own suggested phrases: use "and" or "however" instead of "but"; empathy by *labeling* ("It sounds like...", "It seems like...") rather than "I understand" or "I agree"; suggested lines must never contain invented data (already enforced).
9. **Tone:** warm, one improvement and one next action. This matches the workshop trainer's style (concise rule, then the reason, then practice).

### 3.4 AI Doctor (simulated customer)

1. **Style-specific behavior, not labels.** Encode the table in 3.2 as speaking cues (pace, what they ask for, what they tolerate). The Doctor already blends styles; add explicit "reacts well to / reacts badly to" cues per style.
2. **React to the opening.** A problem-first declaration about the doctor's own patients should raise engagement; "today I want to talk about my product" should keep it flat or shorten patience. This is the single most teachable behavior in the workshop. Today the Doctor reacts to length and open questions only (`agents/doctor/behavior.ts`).
3. **Punish the two forbidden questions realistically.** "Why do you prescribe X?" gets a guarded or vague reply. "What do you prescribe in this indication?" gets "that is my business". The two effective questions get the doctor's real criteria and patient challenges, and release part of the hidden concern.
4. **Reward matching and labeling.** A paraphrase, a repeated last-three-words, or an emotion label ("it seems you worry about...") should trigger a "that's right" moment and more disclosure. A "but" that contradicts the doctor's last statement should reduce trust.
5. **All five objection types, including false.** The types exist. Make sure `false_objection` always carries a hidden concern and that price is usable as the mask. Make `indifference` resolvable only by gaining insight, not by arguing.
6. **Commitment realism.** If the rep closes before covering the stated needs or before resolving the objection, the doctor pushes back. If the rep uses a linked question or summary, then asks and goes quiet, the doctor answers. Accept the commitment forms listed on slide 136 (try for a specific patient type, expand indication, increase dose, schedule another meeting).
7. **Pharmacist persona.** The 3P model is Patient, Physician, **Pharmacist**. The deck's negotiation section (slides 78-87) is pharmacist-specific: shelf space, cash flow, slow turnover, stockouts, anchoring on volume not price, invite a "No", calibrated What/How questions, "no concession without new information". A pharmacy persona with these behaviors is not in the app's Doctor agent today.
8. **Compliance guardrails stay.** No invented data, no branded drug names, no revealing style or CLEAR. Do not reproduce the deck's branded examples (LIPITOR, LYRICA and others) in prompts.
9. **Scoring catalog additions** (new behaviors for `scoring.config.json`, each needing a competency and a points value that you should set):

   | Behavior key | Direction | Competency |
   |---|---|---|
   | `problem_first_opening` | positive | value_communication or discovery |
   | `product_first_opening` | negative | discovery |
   | `forbidden_question` | negative | questioning |
   | `criteria_question` | positive | questioning |
   | `mirrored_last_words` | positive | active_listening |
   | `labeled_emotion` | positive | active_listening |
   | `accusation_audit` | positive | objection_handling |
   | `used_but_contradiction` | negative | objection_handling |
   | `concession_without_new_info` | negative | closing |
   | `premature_close` | negative | closing |
   | `agreement_then_commitment` | positive | closing |

   The existing scoring rules still apply: every observation needs a verbatim quote from the transcript.

### 3.5 Live Roleplay (rep with colleague, voice)

The acoustic engine already measures WPM, pitch range, hesitations, silence periods, talk ratio, question breakdown, paraphrase, vocabulary convergence and warmth (`roleplay-core.ts`). Guidelines for turning that into the workshop's lessons:

1. **Vocal congruence, not body language.** Words, tone and body should agree. The app has audio only, so report *vocal* congruence (does pace, pitch variation and volume fit the message; do hesitations spike on the hard moments such as price). Do not claim anything about gestures or eye contact.
2. **Mirroring and similarity.** Use the existing vocabulary-convergence and pace-matching signals. Report whether the rep's pace moved toward the colleague's pace over the call, and whether the rep reused the other person's key words. This is the "match first, then lead" lesson.
3. **Silence as a tool.** Measure the pause after a closing question and after stating a price. A pause of a few seconds is the target in the deck ("speak clearly, keep eye contact, keep silent"). Treat the exact threshold as a tunable heuristic that needs calibration with real recordings. It is not from the workshop.
4. **Talk ratio and turn length.** The success measures are two-way communication and insights gained. Flag long uninterrupted rep turns and a low customer share of talk. Reuse the thresholds the Doctor path already uses (70 and 130 words).
5. **Role cards for the colleague.** The colleague playing the doctor should receive a short card (style, hidden concern, objection type, what they like and dislike), generated by the same persona builder as the AI Doctor. Without it, colleague role-plays drift into friendly agreement and the objection practice is lost.
6. **Roles and debrief order.** Rep, customer, observer. Debrief order follows the trainer's method: the rep answers the four "coach yourself" questions first, then the observer gives evidence, then the AI adds data. Peers should start with a strength.
7. **Emotion and expression.** Oruk emotion and style scores are already attached to rep turns as `vocalFeedback`. Use them as *weak signals* alongside words, as the live judge already does. Facial expression analysis would need video and explicit consent, and is not recommended now.
8. **Do not use "93% of communication is body language and tone".** The notes (92%) and slide 69 (93%) quote the Mehrabian figure, which came from studies of single ambiguous words about feelings and does not apply to a sales conversation in general. Teach the real point (congruence and tone matter) and keep the number out of any AI output or scorecard.

### 3.6 Post-call insights (shared "call report" schema)

All three surfaces should fill the same fields, each tagged with its evidence tier (`reported` by the rep, `transcribed` from audio or text, `observed` by the analyst with a quote):

- Objective (strategic, incremental) and whether it was met, with the evidence.
- Step coverage across the 5 call steps.
- Opening type (problem-first or product-first).
- Question profile (open and closed counts, forbidden questions, criteria questions).
- Objections: type, response used, resolved or not, re-check done or not.
- Commitment: none, agreement, or specific commitment (and what).
- Doctor data updates (patient type, selection criteria), as hypotheses with confidence.
- Style hypothesis with confidence and the evidence behind it.
- One strength, one improvement, one SMART next-visit objective, who to share the learning with.

Cross-session pattern work (Observation, Evidence, Pattern, Impact, Alternative, Experiment) already exists in `mastermind-coach.ts` and should consume this schema.

### 3.7 Inconsistencies in the source material (decide before encoding)

1. **Empathy phrasing.** The notes say "don't say *I agree*, say *I can feel what you feel*". Slide 81 says *no "I understand"*, use labeling ("it seems like..."). I recommend labeling for the AI, since it is more specific and testable.
2. **92% (notes) versus 93% (slide 69)**, and see 3.5 point 8.
3. **Objection types.** Slides 122-123 say "four types" and then list five. The app uses five.
4. **Question-type slides** list overlapping style preferences for open and closed questions (slides 59-60), so do not hard-code a style-to-question-type rule from them.
5. The deck is pharma-generic with branded examples from another company's portfolio. Rewrite examples for your own portfolio and for Iraqi context before they enter prompts.
6. Slide images (46 MB of file size) were not read. Diagrams may contain content not listed here.

### 3.8 Suggested build order

1. Optional-fields debrief with voice-first input, and the "did you do last time's action" follow-up (findings 1 and 4).
2. Plan stage in Visit Prep: SMART objectives, pre-filling the debrief (finding 2).
3. The shared call-report schema, then the new scoring behaviors (3.4 point 9).
4. Doctor reactions to opening type, forbidden questions and labeling (3.4 points 2 to 4).
5. Pharmacist persona (3.4 point 7).
6. Re-engagement nudges and spaced re-practice (finding 3).
7. Transcription hardening: size limit, rate limit, language hint (finding 5).
