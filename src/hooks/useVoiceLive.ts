'use client'
import { useCallback, useRef, useState } from 'react'
import { PipecatClient, type TranscriptData, type BotLLMTextData } from '@pipecat-ai/client-js'
import { DailyTransport } from '@pipecat-ai/daily-transport'
import type { Difficulty } from '@/lib/voice-partner-core'
import type { LiveTranscriptTurn } from '@/lib/voice-live-core'

export type VoiceLiveState = 'idle' | 'connecting' | 'live' | 'ended' | 'error' | 'notconfigured'
export type VoiceLiveErrorKind = 'mic' | 'network' | null

/**
 * Wraps `@pipecat-ai/client-js` (v1.13.1) + `@pipecat-ai/daily-transport`
 * (v1.6.9) for a single realtime voice-partner call. API surface verified
 * against the installed packages' own `.d.ts` files (not remembered/trained
 * knowledge — see task-5-report.md for the full inspection notes):
 *
 * - `PipecatClient` extends an internal `RTVIEventEmitter` (a `TypedEmitter`
 *   from the `typed-emitter` package), so it has a plain `.on(event, cb)` —
 *   not a bespoke callbacks-only API.
 * - `client.connect(connectParams)` resolves to `BotReadyData` (not void)
 *   and rejects (throws) on transport/device failure — that's the only
 *   signal Pipecat gives for "mic/connect failed"; there's no separate
 *   mic-permission exception type to catch specifically.
 * - For `DailyTransport`, `connectParams` is Daily's own `DailyCallOptions`
 *   shape: `{ url, token, ... }`.
 * - `'userTranscript'` fires with `TranscriptData = { text, final, ... }`
 *   for BOTH interim and final chunks — only `final: true` chunks are
 *   appended, or every partial word would land as its own transcript turn.
 * - `'botTranscript'` fires with `BotLLMTextData = { text }` once per
 *   completed bot utterance. It's marked `@deprecated` in favour of the
 *   richer `'botOutput'` event, but is still shipped, unchanged in shape,
 *   and is the simplest one-turn-per-utterance signal available (the
 *   `'botOutput'`/`'botTtsText'` events carry streaming/aggregation
 *   semantics not needed here) — kept deliberately, not by oversight.
 * - `'deviceError'` (mic/cam acquisition failure) and `'error'` (general
 *   RTVI/transport error) are separate events; only `deviceError` is
 *   mic-specific, so it maps to `errorKind: 'mic'` while a live-session
 *   `'error'` maps to `errorKind: 'network'`.
 *
 * The `/api/pipecat/session` response shape read here (`dailyRoom` /
 * `dailyToken`) matches that route's own already-committed implementation
 * and test (`src/app/api/pipecat/session/route.ts` — a pass-through of
 * Pipecat Cloud's `dailyRoom`/`dailyToken` fields), not the `room_url`/
 * `token` names guessed in the task-5 plan draft.
 */
export function useVoiceLive(doctorId: string, lang: 'en' | 'ar') {
  const [state, setState] = useState<VoiceLiveState>('idle')
  const [errorKind, setErrorKind] = useState<VoiceLiveErrorKind>(null)
  const [transcript, setTranscript] = useState<LiveTranscriptTurn[]>([])
  const clientRef = useRef<InstanceType<typeof PipecatClient> | null>(null)

  const connect = useCallback(async (difficulty: Difficulty) => {
    setState('connecting'); setErrorKind(null); setTranscript([])
    let res: Response
    try {
      res = await fetch('/api/pipecat/session', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doctorId, lang, difficulty }),
      })
    } catch { setState('error'); setErrorKind('network'); return }
    if (res.status === 503) { setState('notconfigured'); return }
    if (!res.ok) { setState('error'); setErrorKind('network'); return }
    const room = await res.json().catch(() => null) as { dailyRoom?: string; dailyToken?: string } | null
    if (!room?.dailyRoom || !room?.dailyToken) { setState('error'); setErrorKind('network'); return }

    const client = new PipecatClient({ transport: new DailyTransport() })
    clientRef.current = client
    client.on('userTranscript', (data: TranscriptData) => {
      if (data.final) setTranscript(t => [...t, { role: 'rep', text: data.text }])
    })
    client.on('botTranscript', (data: BotLLMTextData) => {
      setTranscript(t => [...t, { role: 'doctor', text: data.text }])
    })
    client.on('deviceError', () => { setState('error'); setErrorKind('mic') })
    client.on('error', () => { setState('error'); setErrorKind('network') })
    try {
      await client.connect({ url: room.dailyRoom, token: room.dailyToken })
      setState('live')
    } catch { setState('error'); setErrorKind('mic') }
  }, [doctorId, lang])

  const disconnect = useCallback(async () => {
    if (clientRef.current) { await clientRef.current.disconnect().catch(() => {}) }
    setState('ended')
  }, [])

  return { state, errorKind, transcript, connect, disconnect }
}
