'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PipecatClient, type TranscriptData, type BotLLMTextData } from '@pipecat-ai/client-js'
import { DailyTransport } from '@pipecat-ai/daily-transport'
import type { LiveDifficulty, LiveTranscriptTurn } from '@/lib/voice-live-core'

export type VoiceLiveState = 'idle' | 'connecting' | 'live' | 'ended' | 'error' | 'notconfigured'
export type VoiceLiveErrorKind = 'mic' | 'network' | null
export type VoiceLiveActivity = 'listening' | 'speaking' | 'thinking' | 'youSpeaking'

export function useVoiceLive(doctorId: string, lang: 'en' | 'ar') {
  const [state, setState] = useState<VoiceLiveState>('idle')
  const [errorKind, setErrorKind] = useState<VoiceLiveErrorKind>(null)
  const [transcript, setTranscript] = useState<LiveTranscriptTurn[]>([])
  const [activity, setActivity] = useState<VoiceLiveActivity>('listening')
  const [muted, setMuted] = useState(false)
  const transcriptRef = useRef<LiveTranscriptTurn[]>([])
  const clientRef = useRef<InstanceType<typeof PipecatClient> | null>(null)
  const generation = useRef(0)
  const requestRef = useRef<AbortController | null>(null)

  const release = useCallback(() => {
    generation.current += 1
    requestRef.current?.abort()
    requestRef.current = null
    const client = clientRef.current
    clientRef.current = null
    try { void client?.disconnect()?.catch(() => {}) } catch { /* already disconnected */ }
  }, [])
  useEffect(() => release, [release])

  const connect = useCallback(async (difficulty: LiveDifficulty) => {
    release()
    const id = generation.current
    const current = () => generation.current === id
    setState('connecting'); setErrorKind(null); setTranscript([]); setMuted(false); setActivity('listening')
    transcriptRef.current = []
    const controller = new AbortController()
    requestRef.current = controller
    const fail = (kind: 'mic' | 'network') => {
      if (!current()) return
      release(); setState('error'); setErrorKind(kind)
    }
    const timeout = setTimeout(() => fail('network'), 30000)
    try {
      const res = await fetch('/api/pipecat/session', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doctorId, lang, difficulty }), signal: controller.signal,
      })
      if (!current()) return
      if (res.status === 503) { setState('notconfigured'); return }
      if (!res.ok) { fail('network'); return }
      const room = await res.json().catch(() => null) as { dailyRoom?: string; dailyToken?: string } | null
      if (!current()) return
      if (!room?.dailyRoom || !room?.dailyToken) { fail('network'); return }
      const client = new PipecatClient({ transport: new DailyTransport() })
      clientRef.current = client
      const append = (role: 'rep' | 'doctor', text: string) => {
        if (!current() || !text.trim()) return
        transcriptRef.current = [...transcriptRef.current, { role, text }]
        setTranscript(transcriptRef.current)
      }
      client.on('userTranscript', (data: TranscriptData) => { if (data.final) append('rep', data.text) })
      client.on('botTranscript', (data: BotLLMTextData) => append('doctor', data.text))
      client.on('userStartedSpeaking', () => { if (current()) setActivity('youSpeaking') })
      client.on('userStoppedSpeaking', () => { if (current()) setActivity('thinking') })
      client.on('botLlmStarted', () => { if (current()) setActivity('thinking') })
      client.on('botStartedSpeaking', () => { if (current()) setActivity('speaking') })
      client.on('botStoppedSpeaking', () => { if (current()) setActivity('listening') })
      client.on('deviceError', () => fail('mic'))
      client.on('error', () => fail('network'))
      client.on('disconnected', () => fail('network'))
      try {
        await client.connect({ url: room.dailyRoom, token: room.dailyToken })
        if (current()) setState('live')
        else { try { void client.disconnect()?.catch(() => {}) } catch { /* already closed */ } }
      } catch { fail('mic') }
    } catch { fail('network') }
    finally { clearTimeout(timeout) }
  }, [doctorId, lang, release])

  const disconnect = useCallback(async () => {
    const captured = [...transcriptRef.current]
    release(); setState('ended')
    return captured
  }, [release])
  const toggleMute = useCallback(() => {
    const next = !muted
    clientRef.current?.enableMic(!next)
    setMuted(next)
  }, [muted])
  return { state, errorKind, transcript, activity, muted, toggleMute, connect, disconnect }
}
