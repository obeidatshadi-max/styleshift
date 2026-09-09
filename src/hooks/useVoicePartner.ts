'use client'
import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { XP_VALUES } from '@/lib/game-data'
import type { VoicePartnerTurn, TurnOutcome, ObjectionType, ClearStep } from '@/lib/voice-partner-core'
import { isObjectionType, isClearStep } from '@/lib/voice-partner-core'
import { logVoiceEvent } from '@/lib/voice-events'
import type { VoiceErrorKind } from '@/lib/voice-events'
import { speak, playBase64Audio } from '@/lib/voice-tts'
import { useAudioRecorder } from './useAudioRecorder'

export type VoicePartnerPhase =
  | 'idle' | 'opening' | 'recording' | 'review' | 'sending' | 'playing' | 'notconfigured' | 'ratelimited' | 'error'

export function useVoicePartner(doctorId: string, lang: 'en' | 'ar') {
  const supabase = createClient()
  const [phase, setPhase] = useState<VoicePartnerPhase>('idle')
  const [errorKind, setErrorKind] = useState<VoiceErrorKind | null>(null)
  const [transcript, setTranscript] = useState<VoicePartnerTurn[]>([])
  const [turnCount, setTurnCount] = useState(0)
  const [outcome, setOutcome] = useState<TurnOutcome | null>(null)
  const [openingText, setOpeningText] = useState('')
  const [objectionType, setObjectionType] = useState<ObjectionType | null>(null)
  const [clearStepsHit, setClearStepsHit] = useState<ClearStep[]>([])
  const recorder = useAudioRecorder('objection', lang)

  const startVoicePartner = useCallback(async () => {
    setPhase('opening')
    setErrorKind(null)
    setTranscript([])
    setTurnCount(0)
    setOutcome(null)
    setObjectionType(null)
    setClearStepsHit([])
    try {
      const res = await fetch('/api/voice-partner/open', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doctorId, lang }),
      })
      if (res.status === 503) { setPhase('notconfigured'); logVoiceEvent('objection', lang, 'not_configured', { endpoint: 'open' }); return }
      if (res.status === 429) { setPhase('ratelimited'); logVoiceEvent('objection', lang, 'rate_limited', { endpoint: 'open' }); return }
      if (!res.ok) { setPhase('error'); setErrorKind('api'); logVoiceEvent('objection', lang, 'api_error', { endpoint: 'open', status: res.status }); return }
      const data = await res.json().catch(() => null) as { doctorText?: string; objectionType?: string } | null
      if (!data?.doctorText || !isObjectionType(data.objectionType)) { setPhase('error'); setErrorKind('bad_response'); logVoiceEvent('objection', lang, 'bad_response', { endpoint: 'open' }); return }
      setOpeningText(data.doctorText)
      setObjectionType(data.objectionType)
      setTranscript([{ role: 'doctor', text: data.doctorText }])

      const audio = await speak(data.doctorText, lang)
      if (!audio) logVoiceEvent('objection', lang, 'tts_failed', { endpoint: 'open' })
      setPhase('playing')
      if (audio) await playBase64Audio(audio)
      setPhase('idle')
    } catch {
      setPhase('error')
      setErrorKind('network')
      logVoiceEvent('objection', lang, 'network_error', { endpoint: 'open' })
    }
  }, [doctorId, lang])

  const startRecording = useCallback(async () => {
    const ok = await recorder.start()
    if (ok) { setPhase('recording'); setErrorKind(null) }
    else { setPhase('error'); setErrorKind('mic') }
  }, [recorder])

  const awardXpOnWin = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile, error: profileError } = await supabase.from('profiles').select('xp').eq('id', user.id).single()
    if (profileError || !profile) return
    const { error: xpError } = await supabase.from('profiles').update({ xp: profile.xp + XP_VALUES.voicePartnerWin }).eq('id', user.id)
    if (xpError) console.error('voice partner xp update failed:', xpError.message)
  }, [supabase])

  const saveSessionResult = useCallback(async (
    finalOutcome: 'won' | 'escalated', finalTurnCount: number, finalClearSteps: ClearStep[], type: ObjectionType,
  ) => {
    try {
      const res = await fetch('/api/voice-partner/session-result', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doctorId, objectionType: type, outcome: finalOutcome, clearSteps: finalClearSteps, turnCount: finalTurnCount }),
      })
      // Best-effort — the rep still sees their end-of-session summary either
      // way. Warn (not error) so a systematically-failing save is still
      // discoverable without looking like an app-breaking error in prod logs.
      if (!res.ok) console.warn('voice partner session-result save failed:', res.status)
    } catch (err) {
      console.warn('voice partner session-result save failed:', err)
    }
  }, [doctorId])

  // Stops recording and moves to a listen-back checkpoint — nothing uploads
  // yet. The rep hears exactly what was captured before it's sent for
  // transcription, so a bad take can be discarded instead of judged blind.
  const stopRecording = useCallback(async () => {
    await recorder.stop()
    setPhase('review')
  }, [recorder])

  const rerecord = useCallback(() => {
    recorder.discard()
    setPhase('idle')
  }, [recorder])

  const confirmRecording = useCallback(async () => {
    const taken = recorder.take()
    if (!taken) return
    const { blob } = taken
    setPhase('sending')

    if (!objectionType) { setPhase('error'); return }

    try {
      const form = new FormData()
      form.append('doctorId', doctorId)
      form.append('lang', lang)
      form.append('history', JSON.stringify(transcript))
      form.append('audio', blob, 'turn.webm')
      form.append('objectionType', objectionType)

      const res = await fetch('/api/voice-partner/turn', { method: 'POST', body: form })
      if (res.status === 503) { setPhase('notconfigured'); logVoiceEvent('objection', lang, 'not_configured', { endpoint: 'turn' }); return }
      if (res.status === 429) { setPhase('ratelimited'); logVoiceEvent('objection', lang, 'rate_limited', { endpoint: 'turn' }); return }
      if (!res.ok) { setPhase('error'); setErrorKind('api'); logVoiceEvent('objection', lang, 'api_error', { endpoint: 'turn', status: res.status }); return }
      const data = await res.json().catch(() => null) as {
        repText?: string; doctorText?: string; outcome?: TurnOutcome; turnCount?: number; clearSteps?: unknown
      } | null
      if (!data?.repText || !data.doctorText || !data.outcome) { setPhase('error'); setErrorKind('bad_response'); logVoiceEvent('objection', lang, 'bad_response', { endpoint: 'turn' }); return }

      const nextTranscript: VoicePartnerTurn[] = [
        ...transcript, { role: 'rep', text: data.repText }, { role: 'doctor', text: data.doctorText },
      ]
      setTranscript(nextTranscript)
      const nextTurnCount = data.turnCount ?? turnCount + 1
      setTurnCount(nextTurnCount)

      const newSteps = Array.isArray(data.clearSteps) ? data.clearSteps.filter(isClearStep) : []
      const mergedSteps = Array.from(new Set([...clearStepsHit, ...newSteps]))
      setClearStepsHit(mergedSteps)

      // `outcome` means "the session has resolved" everywhere it's read — a
      // non-terminal 'continue' must leave it null so the mic stays available.
      if (data.outcome !== 'continue') {
        setOutcome(data.outcome)
        void saveSessionResult(data.outcome, nextTurnCount, mergedSteps, objectionType)
        logVoiceEvent('objection', lang, 'session_complete', { outcome: data.outcome, turnCount: nextTurnCount })
      } else {
        logVoiceEvent('objection', lang, 'turn_complete', { turnCount: nextTurnCount })
      }

      const audio = await speak(data.doctorText, lang)
      if (!audio) logVoiceEvent('objection', lang, 'tts_failed', { endpoint: 'turn' })
      setPhase('playing')
      if (audio) await playBase64Audio(audio)

      if (data.outcome === 'won') await awardXpOnWin()
      setPhase('idle')
    } catch {
      setPhase('error')
      setErrorKind('network')
      logVoiceEvent('objection', lang, 'network_error', { endpoint: 'turn' })
    }
  }, [doctorId, lang, transcript, turnCount, awardXpOnWin, objectionType, clearStepsHit, saveSessionResult, recorder])

  const reset = useCallback(() => {
    recorder.abort()
    setPhase('idle')
    setErrorKind(null)
    setTranscript([])
    setTurnCount(0)
    setOutcome(null)
    setOpeningText('')
    setObjectionType(null)
    setClearStepsHit([])
  }, [recorder])

  return {
    phase, errorKind, transcript, turnCount, outcome, openingText, objectionType, clearStepsHit, previewUrl: recorder.previewUrl,
    startVoicePartner, startRecording, stopRecording, confirmRecording, rerecord, reset,
  }
}
