'use client'
import { useCallback, useState } from 'react'
import type { QuestionType, ListeningCue } from '@/lib/voice-partner-questioning'
import { isQuestionType, isListeningCue } from '@/lib/voice-partner-questioning'
import { logVoiceEvent } from '@/lib/voice-events'
import type { VoiceErrorKind } from '@/lib/voice-events'
import { speak, playBase64Audio } from '@/lib/voice-tts'
import { useAudioRecorder } from './useAudioRecorder'

export type QuestionDrillPhase =
  | 'idle' | 'recording' | 'review' | 'sending' | 'playing' | 'notconfigured' | 'error' | 'ratelimited'

export type QuestionDrillTurn1 = { questionText: string; doctorAnswer: string; questionType: QuestionType }
export type QuestionDrillResult = { doctorText: string; listeningCuesHit: ListeningCue[] }

export function useQuestionDrill(doctorId: string, lang: 'en' | 'ar') {
  const [phase, setPhase] = useState<QuestionDrillPhase>('idle')
  const [errorKind, setErrorKind] = useState<VoiceErrorKind | null>(null)
  const [turn1, setTurn1] = useState<QuestionDrillTurn1 | null>(null)
  const [result, setResult] = useState<QuestionDrillResult | null>(null)
  const recorder = useAudioRecorder('question', lang, () => setPhase('review'))

  const startRecording = useCallback(async () => {
    const ok = await recorder.start()
    if (ok) { setPhase('recording'); setErrorKind(null) }
    else { setPhase('error'); setErrorKind('mic') }
  }, [recorder])

  const saveSessionResult = useCallback(async (questionType: QuestionType, listeningCuesHit: ListeningCue[]) => {
    try {
      const res = await fetch('/api/voice-partner/question-drill/session-result', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doctorId, questionType, listeningCuesHit }),
      })
      // Best-effort — the rep still sees their result either way. Warn
      // (not error) so a systematically-failing save is still discoverable
      // without looking like an app-breaking error in prod logs.
      if (!res.ok) console.warn('question drill session-result save failed:', res.status)
    } catch (err) {
      console.warn('question drill session-result save failed:', err)
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

    try {
      if (!turn1) {
        // Turn 1: the rep is asking the question.
        const form = new FormData()
        form.append('doctorId', doctorId)
        form.append('lang', lang)
        form.append('audio', blob, 'question.webm')

        const res = await fetch('/api/voice-partner/question-drill/ask', { method: 'POST', body: form })
        if (res.status === 503) { setPhase('notconfigured'); logVoiceEvent('question', lang, 'not_configured', { turn: 1 }); return }
        if (res.status === 429) { setPhase('ratelimited'); logVoiceEvent('question', lang, 'rate_limited', { turn: 1 }); return }
        if (!res.ok) { setPhase('error'); setErrorKind('api'); logVoiceEvent('question', lang, 'api_error', { turn: 1, status: res.status }); return }
        const data = await res.json().catch(() => null) as {
          questionText?: string; doctorText?: string; questionType?: unknown
        } | null
        if (!data?.questionText || !data.doctorText || !isQuestionType(data.questionType)) { setPhase('error'); setErrorKind('bad_response'); logVoiceEvent('question', lang, 'bad_response', { turn: 1 }); return }

        setTurn1({ questionText: data.questionText, doctorAnswer: data.doctorText, questionType: data.questionType })
        logVoiceEvent('question', lang, 'turn_complete', { turn: 1, questionType: data.questionType })

        const audio = await speak(data.doctorText, lang)
        if (!audio) logVoiceEvent('question', lang, 'tts_failed', { turn: 1 })
        setPhase('playing')
        if (audio) await playBase64Audio(audio)
        setPhase('idle')
      } else {
        // Turn 2: the rep is responding to the doctor's answer.
        const form = new FormData()
        form.append('doctorId', doctorId)
        form.append('lang', lang)
        form.append('audio', blob, 'response.webm')
        form.append('questionText', turn1.questionText)
        form.append('doctorAnswer', turn1.doctorAnswer)
        form.append('questionType', turn1.questionType)

        const res = await fetch('/api/voice-partner/question-drill/respond', { method: 'POST', body: form })
        if (res.status === 503) { setPhase('notconfigured'); logVoiceEvent('question', lang, 'not_configured', { turn: 2 }); return }
        if (res.status === 429) { setPhase('ratelimited'); logVoiceEvent('question', lang, 'rate_limited', { turn: 2 }); return }
        if (!res.ok) { setPhase('error'); setErrorKind('api'); logVoiceEvent('question', lang, 'api_error', { turn: 2, status: res.status }); return }
        const data = await res.json().catch(() => null) as {
          repResponseText?: string; doctorText?: string; listeningCuesHit?: unknown
        } | null
        if (!data?.doctorText) { setPhase('error'); setErrorKind('bad_response'); logVoiceEvent('question', lang, 'bad_response', { turn: 2 }); return }

        const listeningCuesHit = Array.isArray(data.listeningCuesHit) ? data.listeningCuesHit.filter(isListeningCue) : []
        setResult({ doctorText: data.doctorText, listeningCuesHit })
        void saveSessionResult(turn1.questionType, listeningCuesHit)
        logVoiceEvent('question', lang, 'session_complete', { listeningCuesHit: listeningCuesHit.length })

        const audio = await speak(data.doctorText, lang)
        if (!audio) logVoiceEvent('question', lang, 'tts_failed', { turn: 2 })
        setPhase('playing')
        if (audio) await playBase64Audio(audio)
        setPhase('idle')
      }
    } catch {
      setPhase('error')
      setErrorKind('network')
      logVoiceEvent('question', lang, 'network_error')
    }
  }, [doctorId, lang, turn1, saveSessionResult, recorder])

  const reset = useCallback(() => {
    recorder.abort()
    setPhase('idle')
    setErrorKind(null)
    setTurn1(null)
    setResult(null)
  }, [recorder])

  return { phase, errorKind, turn1, result, previewUrl: recorder.previewUrl, startRecording, stopRecording, confirmRecording, rerecord, reset }
}
