# Iraqi Arabic and code-switching benchmark (version iab-1.0.0)

Status: **protocol only. There is no audio, no reference transcript and no result yet.** Nothing here may be reported as a benchmark finding until real, consented recordings have been transcribed and reviewed by people who know Iraqi pharmaceutical conversation.

## 1. What is evaluated today

Transcription uses OpenAI Whisper (`whisper-1`) with the language pinned to `ar` or `en`. Speaker separation for recorded role-plays uses AssemblyAI. A reviewed phrase library (IHIA) exists behind a flag. None of these has been measured for Iraqi Arabic accuracy.

## 2. Dataset design

Collect short clips (5 to 40 seconds) of simulated pharmaceutical conversations, recorded by consenting participants. No real doctor or customer audio.

Cover each of these, with enough clips in each to read an error rate:

- Iraqi colloquial Arabic
- Modern Standard Arabic
- English pharmaceutical terms inside Arabic sentences, and mixed Arabic and English sentences
- Specialty terms and product or molecule names from an approved test dictionary
- Numbers, percentages and dosing-like numbers
- **Clinically important negation** (for example "I did not promise", "it is not recommended", "no side effects reported")
- Objection expressions and hesitation
- Fast speech, pauses, interrupted speech
- Noisy but usable audio (clinic, phone)

Minimum for any statement about readiness: 150 reviewed utterances, at least 40 with clinically important negation (measurement-methodology, section 7).

## 3. Reference transcripts

1. A first reviewer who knows Iraqi pharmaceutical communication transcribes each clip.
2. A second reviewer independently checks it; differences go to a third adjudication.
3. The reference keeps what was said, including colloquial forms, plus a marked normalised form (below). Names and any identifying detail are replaced by labels.
4. Every reference records who produced it, the date and the dataset revision.

## 4. Normalisation (stated, so results can be reproduced)

Applied only to build the **normalised** comparison; the **raw** comparison uses text as written. Both are reported.

- Remove short vowel marks and tatweel; fold alef with hamza or madda to bare alef; fold ta marbuta to ha at word end and alef maqsura to ya; unify Arabic-Indic and Western digits; remove punctuation; collapse whitespace.
- English text lower-cased; Latin letters inside Arabic sentences kept as written.
- Spelling variants of the same colloquial word listed in a reviewed variant table are treated as equal in the normalised comparison only.

## 5. Metrics

**Transcription.** Word error rate and character error rate (raw and normalised); terminology accuracy (share of dictionary terms transcribed correctly); negation accuracy (share of negation-bearing utterances where the negation is intact); speaker attribution accuracy where speakers are labelled.

**Meaning preservation** (judged by a reviewer on the transcript and on the AI's interpretation of it, per utterance, yes or no):
- A question stayed a question.
- Uncertainty or hedging was kept.
- Agreement or disagreement was kept.
- Clinical negation was intact.
- The objection meaning did not change.
- The interpretation added nothing the speaker did not say.

**Weighting.** Errors that change a coaching conclusion count separately from harmless ones. "I did not promise" becoming "I promised" is a **critical meaning error**; a spelling variant is not. The report gives the number of critical meaning errors and the share of reviewed cases, never only a combined error rate.

## 6. Provider comparison

Run each configuration on the same dataset at the same time. Do not switch provider on published generic benchmarks alone.

| Provider and configuration | WER raw | WER normalised | CER | Terms | Negation | Critical meaning errors | Latency | Cost per analysed minute | Data handling | Failure behavior |
|---|---|---|---|---|---|---|---|---|---|---|
| Whisper (current), language pinned | not measured | not measured | not measured | not measured | not measured | not measured | not measured | not measured | audio sent to OpenAI | not measured |
| Others to test | | | | | | | | | | |

Record data-handling terms (retention, deletion, training use) from each provider's own documentation, with the date read.

## 7. Targets (initial, from the pilot brief)

Critical negation meaning preserved in at least 98% of reviewed cases. Statuses follow measurement-methodology, section 4 (MET, MET UNCERTAIN, NOT MET, NOT ENOUGH DATA). The interval matters: with 40 negation cases, a result of 40 of 40 still has a wide lower bound, and is reported as such.

## 8. What needs people

Recordings from consenting participants, reviewers with Iraqi pharmaceutical experience, an approved terminology dictionary, and provider terms. The tooling (alignment, error rates, normalisation, comparison table, export) can be built and tested on clearly labelled synthetic fixtures meanwhile.
