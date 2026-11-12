# AI Doctor — Setup

## Text-based path (already shippable)

Requires, in `.env.local` / Netlify:

```
AI_VOICE_PARTNER_ENABLED=true
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...      # Whisper transcription
```

No other setup — this path has no external deploy step, it's just Next.js API routes.

## Realtime voice path — deploy runbook

The realtime bot (`pipecat-bot/`) only runs on **Pipecat Cloud** (Linux containers).
`daily-python` ships no Windows wheels, so it cannot run locally on a Windows dev
machine — not even for testing — only in Pipecat Cloud itself or a Linux/WSL/Docker
environment. Verified in this session: `uv sync` on Windows fails immediately with
`Distribution daily-python==0.32.0 ... doesn't have a source distribution or wheel for
the current platform`. This is expected, not a bug to fix.

Every step below is external account/credential provisioning — **there is no
remaining code gap** blocking deploy; `bot.py` and every supporting Next.js route are
already implemented and committed on `feat/ai-voice-partner-realtime`.

1. **Install the Pipecat CLI**

   ```
   uv tool install "pipecat-ai[cli]"
   ```

2. **Authenticate** (requires a Pipecat Cloud account — sign up at their dashboard if
   you don't have one yet; this is the one genuinely manual, non-scriptable step)

   ```
   pipecat cloud auth login
   ```

3. **Create the bot's secret set.** Create `pipecat-bot/.env` (gitignored — never
   `.env.example`) with real values:

   ```
   DEEPGRAM_API_KEY=...
   ELEVENLABS_API_KEY=...
   ELEVENLABS_VOICE_ID=...
   ```

   Then:

   ```
   cd pipecat-bot && pipecat cloud secrets set styleshift-voice-partner-secrets --file .env
   ```

4. **Deploy**

   ```
   cd pipecat-bot && pipecat cloud deploy
   ```

   Verify: `pipecat cloud agent status styleshift-voice-partner` shows the agent healthy.

5. **Get a public API key and wire it into the Next.js app.** From
   `pipecat cloud agent list` or the dashboard, get the agent's public API key. Set in
   both `.env.local` and Netlify's environment variables:

   ```
   PIPECAT_CLOUD_API_KEY=...
   VOICE_PARTNER_BOT_TOKEN_SECRET=...   # any long random string, e.g. `openssl rand -hex 32`
   PIPECAT_AGENT_NAME=styleshift-voice-partner   # optional, this is the default
   ```

6. **Smoke test** — once deployed, follow the manual checklist in
   `docs/AI_DOCTOR_TEST_PLAN.md`'s "Realtime timing capture" section before trusting
   `conversation_turns.started_at`/`ended_at` in production.

## Local development (text-based path only)

```
npm run dev
npx vitest run     # all TypeScript logic (judge, evaluator, timing signals) is
                    # fully unit-testable without any external voice vendor
```

There is currently no way to run the realtime bot locally on Windows. If local
realtime testing becomes necessary, the next step is a Linux dev container or WSL2
with `uv sync` run inside it — not attempted in this pass, since Pipecat Cloud deploy
is the actual target environment anyway.
