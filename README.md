This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Environment variables

### AI Voice Partner (realtime, Pipecat)

Next.js app env (Netlify):

- `AI_VOICE_PARTNER_ENABLED` — `true` to enable the feature; the "coming soon" teaser renders when unset/false.
- `ANTHROPIC_API_KEY` — powers the doctor-persona judge in `voice-partner-core.ts`.
- `OPENAI_API_KEY` — Whisper transcription fallback for the `audio`-blob path on `/api/voice-partner/turn` (used by non-realtime sibling flows that still send audio instead of `repText`).
- `PIPECAT_CLOUD_API_KEY` — authenticates `/api/voice-partner/pipecat-session`'s call to Pipecat Cloud's `/start` endpoint.
- `VOICE_PARTNER_BOT_TOKEN_SECRET` — signs/verifies the short-lived bearer token the bot uses to call back into `/turn` and `/session-result`.
- `PIPECAT_AGENT_NAME` — optional, defaults to `styleshift-voice-partner`.

Pipecat Cloud bot env (`pipecat-bot/`, its own secret set — **not** Netlify vars, never committed):

- `DEEPGRAM_API_KEY` — STT.
- `ELEVENLABS_API_KEY` — TTS.
- `ELEVENLABS_VOICE_ID` — the ElevenLabs voice the bot speaks with.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
