'use client'
import { useCallback, useRef, useState } from 'react'
import Daily, { type DailyCall } from '@daily-co/daily-js'
import type { VoicePartnerTurn, TurnOutcome, ObjectionType, ClearStep, PhysicianState, Difficulty } from '@/lib/voice-partner-core'
import { isObjectionType, isClearStep, isPhysicianState, isDifficulty } from '@/lib/voice-partner-core'
import { logVoiceEvent } from '@/lib/voice-events'
import type { VoiceErrorKind } from '@/lib/voice-events'

export type VoicePartnerPhase =
  | 'idle' | 'opening' | 'connecting' | 'live' | 'notconfigured' | 'ratelimited' | 'error'

type AppMessage =
  | { type: 'rep_text'; text: string }
  | { type: 'doctor_text'; text: string; outcome: TurnOutcome; turnCount: number; clearSteps: ClearStep[]; state: PhysicianState }
  | { type: 'outcome'; outcome: 'won' | 'escalated'; state: PhysicianState }
  | { type: 'error'; stage: string; status: number }

export function useVoicePartner(doctorId: string, lang: 'en' | 'ar') {
  const [phase, setPhase] = useState<VoicePartnerPhase>('idle')
  const [errorKind, setErrorKind] = useState<VoiceErrorKind | null>(null)
  const [transcript, setTranscript] = useState<VoicePartnerTurn[]>([])
  const [turnCount, setTurnCount] = useState(0)
  const [outcome, setOutcome] = useState<TurnOutcome | null>(null)
  const [openingText, setOpeningText] = useState('')
  const [objectionType, setObjectionType] = useState<ObjectionType | null>(null)
  const [clearStepsHit, setClearStepsHit] = useState<ClearStep[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [physicianState, setPhysicianState] = useState<PhysicianState | null>(null)
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null)
  const callRef = useRef<DailyCall | null>(null)

  const handleAppMessage = useCallback((msg: AppMessage) => {
    if (msg.type === 'rep_text') {
      setTranscript(prev => [...prev, { role: 'rep', text: msg.text }])
      return
    }
    if (msg.type === 'doctor_text') {
      setTranscript(prev => [...prev, { role: 'doctor', text: msg.text }])
      setTurnCount(msg.turnCount)
      setClearStepsHit(prev => Array.from(new Set([...prev, ...msg.clearSteps.filter(isClearStep)])))
      setPhysicianState(msg.state)
      logVoiceEvent('objection', lang, msg.outcome !== 'continue' ? 'session_complete' : 'turn_complete', { turnCount: msg.turnCount })
      return
    }
    if (msg.type === 'outcome') {
      setOutcome(msg.outcome)
      setPhysicianState(msg.state)
      return
    }
    if (msg.type === 'error') {
      setErrorKind('api')
      logVoiceEvent('objection', lang, 'api_error', { endpoint: msg.stage, status: msg.status })
    }
  }, [lang])

  const startVoicePartner = useCallback(async (
    difficultyChoice?: Difficulty,
    // Replay-This-Moment: when provided, skips /open's fresh-scenario pick
    // and re-seeds from a past detected moment instead (see
    // /api/voice-partner/replay-context, whose response shape mirrors
    // /open's on purpose so the rest of this flow needs no branching below).
    replaySeed?: { sourceSessionId: string; turnIndex: number },
  ) => {
    setPhase('opening')
    setErrorKind(null)
    setTranscript([])
    setTurnCount(0)
    setOutcome(null)
    setObjectionType(null)
    setClearStepsHit([])
    setSessionId(null)
    setPhysicianState(null)
    setDifficulty(null)

    try {
      const openEndpoint = replaySeed ? 'replay-context' : 'open'
      const openRes = await fetch(`/api/voice-partner/${openEndpoint}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          replaySeed
            ? { sourceSessionId: replaySeed.sourceSessionId, turnIndex: replaySeed.turnIndex }
            : { doctorId, lang, ...(difficultyChoice ? { difficulty: difficultyChoice } : {}) },
        ),
      })
      if (openRes.status === 503) { setPhase('notconfigured'); logVoiceEvent('objection', lang, 'not_configured', { endpoint: openEndpoint }); return }
      if (openRes.status === 429) { setPhase('ratelimited'); logVoiceEvent('objection', lang, 'rate_limited', { endpoint: openEndpoint }); return }
      if (!openRes.ok) { setPhase('error'); setErrorKind('api'); logVoiceEvent('objection', lang, 'api_error', { endpoint: openEndpoint, status: openRes.status }); return }
      const openData = await openRes.json().catch(() => null) as {
        doctorText?: string; objectionType?: string; sessionId?: string; state?: PhysicianState; difficulty?: string
      } | null
      if (!openData?.doctorText || !isObjectionType(openData.objectionType) || !openData.sessionId || !isPhysicianState(openData.state)) {
        setPhase('error'); setErrorKind('bad_response'); logVoiceEvent('objection', lang, 'bad_response', { endpoint: openEndpoint }); return
      }

      setPhase('connecting')
      const sessionRes = await fetch('/api/voice-partner/pipecat-session', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          doctorId, lang, sessionId: openData.sessionId, openingText: openData.doctorText,
          objectionType: openData.objectionType, state: openData.state,
          ...(isDifficulty(openData.difficulty) ? { difficulty: openData.difficulty } : {}),
        }),
      })
      if (sessionRes.status === 503) { setPhase('notconfigured'); logVoiceEvent('objection', lang, 'not_configured', { endpoint: 'pipecat-session' }); return }
      if (sessionRes.status === 429) { setPhase('ratelimited'); logVoiceEvent('objection', lang, 'rate_limited', { endpoint: 'pipecat-session' }); return }
      if (!sessionRes.ok) { setPhase('error'); setErrorKind('api'); logVoiceEvent('objection', lang, 'api_error', { endpoint: 'pipecat-session', status: sessionRes.status }); return }
      const sessionData = await sessionRes.json().catch(() => null) as { roomUrl?: string; roomToken?: string } | null
      if (!sessionData?.roomUrl || !sessionData.roomToken) {
        setPhase('error'); setErrorKind('bad_response'); logVoiceEvent('objection', lang, 'bad_response', { endpoint: 'pipecat-session' }); return
      }

      setOpeningText(openData.doctorText)
      setObjectionType(openData.objectionType)
      setSessionId(openData.sessionId)
      setPhysicianState(openData.state)
      setDifficulty(isDifficulty(openData.difficulty) ? openData.difficulty : null)
      setTranscript([{ role: 'doctor', text: openData.doctorText }])

      const call = Daily.createCallObject()
      callRef.current = call
      call.on('app-message', (ev: { data: AppMessage }) => handleAppMessage(ev.data))
      call.on('left-meeting', () => { setPhase('idle') })

      try {
        await call.join({ url: sessionData.roomUrl, token: sessionData.roomToken })
      } catch (joinErr) {
        // Daily's join() requests mic access internally; a denied
        // getUserMedia prompt surfaces as a DOMException named
        // NotAllowedError — distinguish that from a real connection
        // failure so the UI shows the right guidance (matches the
        // 'mic' error state the old MediaRecorder path used).
        const isMicDenied = joinErr instanceof DOMException && joinErr.name === 'NotAllowedError'
        setPhase('error')
        setErrorKind(isMicDenied ? 'mic' : 'network')
        logVoiceEvent('objection', lang, isMicDenied ? 'mic_denied' : 'network_error', { endpoint: 'daily_join' })
        call.destroy()
        callRef.current = null
        return
      }
      setPhase('live')
    } catch {
      setPhase('error')
      setErrorKind('network')
      logVoiceEvent('objection', lang, 'network_error', { endpoint: 'open' })
    }
  }, [doctorId, lang, handleAppMessage])

  const reset = useCallback(() => {
    callRef.current?.leave()
    callRef.current?.destroy()
    callRef.current = null
    setPhase('idle')
    setErrorKind(null)
    setTranscript([])
    setTurnCount(0)
    setOutcome(null)
    setOpeningText('')
    setObjectionType(null)
    setClearStepsHit([])
    setSessionId(null)
    setPhysicianState(null)
    setDifficulty(null)
  }, [])

  return {
    phase, errorKind, transcript, turnCount, outcome, openingText, objectionType, clearStepsHit,
    sessionId, physicianState,
    startVoicePartner, reset,
  }
}
