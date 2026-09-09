'use client'
import { useCallback, useState } from 'react'
import type { ClosingCriterion } from '@/lib/voice-partner-closing'
import { isClosingCriterion } from '@/lib/voice-partner-closing'
import { logVoiceEvent } from '@/lib/voice-events'
import type { VoiceErrorKind } from '@/lib/voice-events'
import { isConciseDuration } from '@/lib/voice-duration'
import { speak, playBase64Audio } from '@/lib/voice-tts'
import { useAudioRecorder } from './useAudioRecorder'

export type VoicePartnerClosingPhase =
  | 'idle' | 'recording' | 'review' | 'sending' | 'playing' | 'notconfigured' | 'error' | 'ratelimited'

export type VoicePartnerClosingResult = { doctorText: string; criteriaHit: ClosingCriterion[]; durationSec: number }

export function useVoicePartnerClosing(doctorId: string, lang: 'en' | 'ar') {
  const [phase, setPhase] = useState<VoicePartnerClosingPhase>('idle')
  const [errorKind, setErrorKind] = useState<VoiceErrorKind | null>(null)
  const [result, setResult] = useState<VoicePartnerClosingResult | null>(null)
  const recorder = useAudioRecorder('closing', lang)

  const startRecording = useCallback(async () => {
    const ok = await recorder.start()
    if (ok) { setPhase('recording'); setErrorKind(null) }
    else { setPhase('error'); setErrorKind('mic') }
  }, [recorder])

  const saveSessionResult = useCallback(async (criteriaHit: ClosingCriterion[]) => {
    try {
      const res = await fetch('/api/voice-partner/closing-session-result', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doctorId, criteriaHit }),
      })
      // Best-effort — the rep still sees their checklist either way. Warn
      // (not error) so a systematically-failing save is still discoverable
      // without looking like an app-breaking error in prod logs.
      if (!res.ok) console.warn('voice partner closing session-result save failed:', res.status)
    } catch (err) {
      console.warn('voice partner closing session-result save failed:', err)
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
    const { blob, durationSec } = taken
    setPhase('sending')

    try {
      const form = new FormData()
      form.append('doctorId', doctorId)
      form.append('lang', lang)
      form.append('audio', blob, 'closing.webm')

      const res = await fetch('/api/voice-partner/closing-statement', { method: 'POST', body: form })
      if (res.status === 503) { setPhase('notconfigured'); logVoiceEvent('closing', lang, 'not_configured'); return }
      if (res.status === 429) { setPhase('ratelimited'); logVoiceEvent('closing', lang, 'rate_limited'); return }
      if (!res.ok) { setPhase('error'); setErrorKind('api'); logVoiceEvent('closing', lang, 'api_error', { status: res.status }); return }
      const data = await res.json().catch(() => null) as { doctorText?: string; criteriaHit?: unknown } | null
      if (!data?.doctorText) { setPhase('error'); setErrorKind('bad_response'); logVoiceEvent('closing', lang, 'bad_response'); return }

      // The judge model only sees the transcript, so it can't reliably time the
      // statement — it guesses "concise" from wording alone. Override that one
      // criterion with the actually-measured recording duration instead.
      const judgedCriteria = Array.isArray(data.criteriaHit) ? data.criteriaHit.filter(isClosingCriterion) : []
      const concise = isConciseDuration(durationSec)
      const criteriaHit = concise
        ? Array.from(new Set([...judgedCriteria, 'concise' as ClosingCriterion]))
        : judgedCriteria.filter(c => c !== 'concise')
      setResult({ doctorText: data.doctorText, criteriaHit, durationSec })
      void saveSessionResult(criteriaHit)
      logVoiceEvent('closing', lang, 'session_complete', { criteriaHit: criteriaHit.length, durationSec })

      const audio = await speak(data.doctorText, lang)
      if (!audio) logVoiceEvent('closing', lang, 'tts_failed')
      setPhase('playing')
      if (audio) await playBase64Audio(audio)
      setPhase('idle')
    } catch {
      setPhase('error')
      setErrorKind('network')
      logVoiceEvent('closing', lang, 'network_error')
    }
  }, [doctorId, lang, saveSessionResult, recorder])

  const reset = useCallback(() => {
    recorder.abort()
    setPhase('idle')
    setErrorKind(null)
    setResult(null)
  }, [recorder])

  return { phase, errorKind, result, previewUrl: recorder.previewUrl, startRecording, stopRecording, confirmRecording, rerecord, reset }
}
