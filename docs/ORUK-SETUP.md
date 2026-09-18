# Oruk in StyleShift

English AI voice partner objection practice now optionally shows vocal emotion and speaking-style feedback under each submitted rep reply. Open the Vocal delivery disclosure in the transcript. Scores are independent acoustic model signals, not psychological assessments or Social Style classifications. Feedback is transient for the current session and is not saved in history or used for grading.

## Activate

Create an API key in https://oruk.ai/account with an active plan/trial. In the server environment (local .env.local or the hosting project's environment variables), set:

```
ORUK_API_KEY=<your secret key>
ORUK_ANALYSIS_ENABLED=true
```

Never use a NEXT_PUBLIC prefix for the key. Restart the local server or redeploy after setting variables. Existing OpenAI/Anthropic keys and AI_VOICE_PARTNER_ENABLED remain required. This integration does not purchase or activate a subscription.

## Scope and verification

The request uses POST https://speech-api.oruk.ai/v1/audio/analysis with model oruk-resonance. It runs alongside existing transcription after authentication, rate limiting, upload validation, and doctor access checks. Oruk may add up to 12 seconds of waiting; errors, malformed results, quota failures, and missing configuration leave normal practice available without vocal feedback. Arabic recordings are never sent to this English-only endpoint. Other drills, colleague recordings, and live WebSocket streaming are not integrated.

After activation, submit an English objection-practice recording and check its Vocal delivery disclosure. Verify Arabic practice still works without this disclosure. To disable, set ORUK_ANALYSIS_ENABLED=false. No database migration is needed.

API reference: https://oruk.ai/docs (checked September 16, 2026).
Live paid API verification requires a configured account key; mocked tests do not establish model accuracy.
