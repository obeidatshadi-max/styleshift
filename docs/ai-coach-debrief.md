# AI Coach: post-call debrief

AI Coach is a fourth main navigation tab, alongside Training, AI Doctor and Live Roleplay. It accepts a typed account or a voice note (up to three minutes), lets the rep review the transcript, asks up to two clarification questions, and returns one focused coaching plan. English and Arabic are supported.

The source is explicitly self-reported recollection. Coaching does not score the rep or infer their actual call delivery from the narration. Suggested interpretations are tentative. The existing AI Doctor text simulation receives the coaching practice focus after the rep selects a saved doctor profile.

## Runtime setup

- Apply `supabase/migrations/20261003120000_coach_debriefs.sql` to the intended Supabase project. This adds an owner-only table, with select/insert/delete RLS and no manager policy.
- Coaching uses the existing `ANTHROPIC_API_KEY` configuration.
- Voice notes use the existing `/api/transcribe` endpoint, requiring `TRANSCRIPTION_ENABLED=true` and `OPENAI_API_KEY`.
- Audio is not saved by this feature. Completed text debriefs and reports are saved to the account. The history displays the latest 30 entries and supports deletion.
- If database saving fails, the generated coaching remains visible with an explicit unsaved notice. If AI or transcription fails, the text input remains available for retry.

## Verification

Focused tests cover request validation, clarification limits, response shape, authentication, ownership filters, persistence failures, the text-to-coaching UI flow, practice-focus handoff and microphone cleanup on leaving the section. Live provider quality and database RLS still need validation in the configured deployment.
