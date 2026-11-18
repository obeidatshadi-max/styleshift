# Conversation coach (recorded rep–doctor conversations)

Helps a rep answer: *what did the doctor communicate, how did I respond, and what should I practise?*
It is built on top of the existing recorded-conversation flow. It adds no new table, no new AI provider and no overall score.

## Where it appears

Visit Prep (doctor) or Colleagues → record a conversation → pick your voice → results screen →
**AI conversation analysis**. The coach is shown first; the existing full report is behind **Show the full analysis**.

Order on the phone screen:

1. **Conversation snapshot** – recording quality and limits, uncertain words to check, main topic, what the doctor said matters, your approach, agreed next step (or "not observed").
2. **One thing to practise** – one behaviour, why it matters here, one success criterion.
3. **Key moments** – up to 3 cards: doctor cue → your reply → what the doctor said next, observed vs interpretation, evidence strength, a suggested reply, a practice task, ▶ replay of that part of the audio.
4. **Replay practice** – replay the moment, read the cue, say or type a better reply, get feedback against the stored criterion. Labelled as practice, not a real doctor.
5. **Communication patterns** (collapsed) – talk share, turns, longest turn, overlaps, question shapes, opportunity counts, delivery, structure stages, language patterns, evidence claims (accuracy "not verified").
6. **Across your recordings** – opportunity counts over time with numerator, denominator and definition.

A rep can also **upload an existing recording** (same 4 MB limit as live recordings) from the consent screen.

## Evidence rules (enforced in code, `src/lib/conversation-coach/`)

| Kind | Source | Code |
|---|---|---|
| Observed content | transcript segments; quotes are always the stored segment text | `ground.ts` (`resolver`) |
| Measured | segment times, device pitch/pause capture, provider word confidence | `interaction.ts`, `quality.ts` |
| Interpretation | model, tentative, with evidence + confidence label + optional alternative | `ground.ts` |

- The model only cites `segmentIndex`. Cue must be a doctor segment, reply a rep segment after it (≤4 segments). Mis-paired moments are dropped.
- Timestamps come from the segment, and are dropped if outside the recording.
- Confidence labels (`high|medium|low|insufficient`) are evidence strength, not probabilities. They are capped at `low` when a quoted segment holds a provider-uncertain word or speaker separation looks unreliable.
- No moments, no priority = a valid "insufficient evidence" result. The deterministic parts still show.
- Delivery: speaking rate, pauses/fillers and pitch range only when the device measured them (live recordings). Loudness is never compared between speakers. Uploaded files have no pitch/pause data.
- Language patterns are word counts (EN + Arabic lists in `language.ts`, **not reviewed by a native Iraqi speaker**). Sensory words never classify a person.
- Evidence claims are listed with accuracy **not verified**; no approved reference source is checked in this flow.
- The transcript is fenced as untrusted data in every prompt; the shared report `SYSTEM` prompt now says to ignore instructions inside it.

## Transcript quality

AssemblyAI already returns per-word confidence and language. They are now stored in
`roleplay_sessions.rep_metrics.transcriptQuality` (existing JSONB column, no migration): word count, mean
confidence, up to 30 words below 0.6 (numbers and Latin-script terms first). If the provider sends no confidence,
the report says "not reported" and flags nothing. A flagged word disappears once the rep corrects it.
Recordings outside 2–4 minutes are analysed with a note, never rejected.

## Progress (`/api/reports/coach-progress`)

Opportunity measures per recording: concerns clarified before answering (n of replied), follow-up questions (n of all questions),
listening summaries (count), next step agreed. "Not applicable" when there was no opportunity.
A comparison is only shown with ≥2 earlier full recordings, ≥3 earlier and ≥2 latest opportunities, and is worded
"higher/lower share", never "improved". Partial recordings are excluded from comparisons.

## Replay practice (`/api/reports/replay-practice`)

Criterion and cue are read server-side from the rep's own saved report. The attempt text is not stored;
the result goes to `drill_attempts` (`drill_id = replay:<sessionId>`, `score = null`). Replay rows are excluded from
the improvement engine and from drill progress (which ignores `score = null`).

## Privacy

- Consent screen unchanged; analysis consent now names the configured AI service (OpenAI or Anthropic).
- Audio is never stored. Replay works only on the device that recorded it, until the screen is left.
- "Delete my practice history" now also deletes practice `transcript_segments` and `conversation_reports` (previously left behind). Customer visits keep their own retention rules.
- Logs contain reasons and counts only, never transcript or attempt text.

## Configuration

Nothing new. Uses what is already set:

- Report generation: `ANTHROPIC_API_KEY`, or `OPENAI_API_KEY` when `IHIA_ENABLED=true` (existing rule).
- Replay feedback: `ANTHROPIC_API_KEY`, else `OPENAI_API_KEY`.
- Spoken practice replies: `TRANSCRIPTION_ENABLED=true` + `OPENAI_API_KEY` (existing `/api/transcribe`); typing works without it.

## Development fixtures

`/dev/conversation-coach` (development builds only; a production build serves 404) renders the coach from synthetic
English, Iraqi Arabic and mixed Arabic–English examples in `fixtures.ts`, labelled SYNTHETIC on every card.
They are hand-written examples, not real conversations, and not evidence of Iraqi Arabic accuracy.

## Not validated

Thresholds (0.6 confidence, 90% dominant voice, 300 ms overlap, 20% rate change), the question-shape and language
word lists, and Arabic/Iraqi transcription quality are unvalidated starting points.
