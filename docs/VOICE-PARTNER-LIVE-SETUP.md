# Live Voice Partner in StyleShift

The 6th VisitPrep practice mode: a real-time spoken call (Daily/Pipecat) against the AI doctor, scored the same way as the 5 turn-based modes.

## Activate

Set on Netlify (production context) and locally in `.env.local`:

```
AI_VOICE_PARTNER_LIVE_ENABLED=true
```

Already set in Netlify production as of 2026-09-18: `PIPECAT_AGENT_NAME`, `PIPECAT_CLOUD_PUBLIC_KEY`. Already set on the Pipecat Cloud agent's secret set (`styleshift-voice-partner-secrets`): `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `LIVE_PROVIDER`. `ANTHROPIC_API_KEY` (for the post-call judge) is already set in Netlify production from the existing turn-based Voice Partner activation.

Restart the local server or redeploy after setting the flag.

## Manual QA (cannot be automated — no mic access in headless browser)

1. Open a doctor's detail view in VisitPrep, tap "Live Voice Practice".
2. Accept consent, pick a difficulty, confirm the call connects (state moves connecting → live).
3. Speak a few lines, confirm the AI doctor responds in character with audio.
4. Tap "End Call" — confirm it reaches a scored result (win or escalate) and XP/visit history reflects it (check the doctor's Visit History panel for a new `voice_partner_live` entry).
5. Repeat once in Arabic (`lang: 'ar'`) if Arabic live-call support matters for this rollout — verify the bot speaks Arabic (Gemini/GPT-Live language capability in this mode is otherwise unverified).
6. Force a disconnect mid-call (e.g. kill network) — confirm no broken/half-saved state, the UI returns to the doctor detail view.
