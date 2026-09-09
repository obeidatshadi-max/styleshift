'use client'
import { useCallback, useState } from 'react'
import type { FabCriterion } from '@/lib/voice-partner-fab'
import { isFabCriterion } from '@/lib/voice-partner-fab'
import { logVoiceEvent } from '@/lib/voice-events'
import type { VoiceErrorKind } from '@/lib/voice-events'
import { speak, playBase64Audio } from '@/lib/voice-tts'
import { useAudioRecorder } from './useAudioRecorder'

export type VoicePartnerFabPhase =
  | 'idle' | 'recording' | 'review' | 'sending' | 'playing' | 'notconfigured' | 'error' | 'ratelimited'

export type VoicePartnerFabResult = { doctorText: string; criteriaHit: FabCriterion[]; durationSec: number }

export function useVoicePartnerFab(doctorId: string, lang: 'en' | 'ar') {
  const [phase, setPhase] = useState<VoicePartnerFabPhase>('idle')
  const [errorKind, setErrorKind] = useState<VoiceErrorKind | null>(null)
  const [result, setResult] = useState<VoicePartnerFabResult | null>(null)
  const recorder = useAudioRecorder('fab', lang)

  const startRecording = useCallback(async () => {
    const ok = await recorder.start()
    if (ok) { setPhase('recording'); setErrorKind(null) }
    else { setPhase('error'); setErrorKind('mic') }
  }, [recorder])

  const saveSessionResult = useCallback(async (criteriaHit: FabCriterion[]) => {
    try {
      const res = await fetch('/api/voice-partner/fab-session-result', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doctorId, criteriaHit }),
      })
      // Best-effort — the rep still sees their checklist either way. Warn
      // (not error) so a systematically-failing save is still discoverable
      // without looking like an app-breaking error in prod logs.
      if (!res.ok) console.warn('voice partner FAB session-result save failed:', res.status)
    } catch (err) {
      console.warn('voice partner FAB session-result save failed:', err)
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
      form.append('audio', blob, 'fab.webm')

      const res = await fetch('/api/voice-partner/fab-statement', { method: 'POST', body: form })
      if (res.status === 503) { setPhase('notconfigured'); logVoiceEvent('fab', lang, 'not_configured'); return }
      if (res.status === 429) { setPhase('ratelimited'); logVoiceEvent('fab', lang, 'rate_limited'); return }
      if (!res.ok) { setPhase('error'); setErrorKind('api'); logVoiceEvent('fab', lang, 'api_error', { status: res.status }); return }
      const data = await res.json().catch(() => null) as { doctorText?: string; criteriaHit?: unknown } | null
      if (!data?.doctorText) { setPhase('error'); setErrorKind('bad_response'); logVoiceEvent('fab', lang, 'bad_response'); return }

      const criteriaHit = Array.isArray(data.criteriaHit) ? data.criteriaHit.filter(isFabCriterion) : []
      setResult({ doctorText: data.doctorText, criteriaHit, durationSec })
      void saveSessionResult(criteriaHit)
      logVoiceEvent('fab', lang, 'session_complete', { criteriaHit: criteriaHit.length, durationSec })

      const audio = await speak(data.doctorText, lang)
      if (!audio) logVoiceEvent('fab', lang, 'tts_failed')
      setPhase('playing')
      if (audio) await playBase64Audio(audio)
      setPhase('idle')
    } catch {
      setPhase('error')
      setErrorKind('network')
      logVoiceEvent('fab', lang, 'network_error')
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
