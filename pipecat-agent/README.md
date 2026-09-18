# Shared Live provider interface

Both providers use `bot.py`, the same Daily/WebRTC transport, scenario prompt,
context, greeting, ten-minute deadline, and disconnect cleanup.

`POST /api/pipecat/session` accepts the existing `doctorId`, `lang`, and
`difficulty` plus optional `provider: "gemini" | "openai"`. The authenticated
endpoint verifies doctor ownership and forwards only scenario fields to the
same Pipecat Cloud agent. Room credentials retain the same response shape.
No model credentials are sent to the browser.

When provider is omitted, the agent uses `LIVE_PROVIDER` (default `gemini`).
Provider selection applies to a new session; reconnect to switch providers.
Unknown providers fail explicitly; no silent fallback.

## Agent secrets

Copy variable names from `.env.example` into the Pipecat Cloud secret set:

- Gemini: `GOOGLE_API_KEY`; default model `gemini-3.8-live`.
- OpenAI: `OPENAI_API_KEY`; default model `gpt-live-1`.
- Optional model overrides: `GEMINI_LIVE_MODEL`, `OPENAI_LIVE_MODEL`.
- Optional voices: `GEMINI_VOICE` (Charon), `OPENAI_LIVE_VOICE` (API default).
- Optional `OPENAI_LIVE_BACKEND_MODEL`: a Responses model for delegated
  reasoning. Omitted means delegated requests are declined; ordinary voice
  conversation remains available. Backend usage is billed separately.

Remove any old `GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview` override to use
Gemini 3.8. The selected provider alone needs its API key.

GPT-Live uses Pipecat's dedicated `OpenAILiveLLMService`, with external turn
strategies and interruption broadcasts disabled because the model handles
full-duplex speech itself. Gemini retains its service-managed turn behavior.

## Validation and deployment

Run `uv sync --locked`, then `uv run python -m unittest discover -s tests`.
Build and redeploy the agent image and the Next.js app to activate changes.
The existing app voice-partner UI currently uses its separate turn-based
endpoints; this change exposes both providers through the Pipecat session API,
not a new browser voice screen.

After deployment, start one session per provider with the same doctor/language/
difficulty. Check greeting, Iraqi Arabic and English, speaking over the bot,
transcript continuity, disconnect, and timeout. Unit tests do not verify actual
model access, audio quality, or Cloud deployment.

References:
- https://docs.pipecat.ai/api-reference/server/services/s2s/openai-live
- https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live
