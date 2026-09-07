'use client'
import { useCallback, useRef, useState } from 'react'
import type { QuestionType, ListeningCue } from '@/lib/voice-partner-questioning'
import { isQuestionType, isListeningCue } from '@/lib/voice-partner-questioning'

export type QuestionDrillPhase =
  | 'idle' | 'recording' | 'sending' | 'playing' | 'notconfigured' | 'error' | 'ratelimited'

export type QuestionDrillTurn1 = { questionText: string; doctorAnswer: string; questionType: QuestionType }
export type QuestionDrillResult = { doctorText: string; listeningCuesHit: ListeningCue[] }

async function speak(text: string, lang: 'en' | 'ar'): Promise<string | null> {
  const res = await fetch('/api/voice-partner/speak', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, lang }),
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => null) as { audio?: string } | null
  return data?.audio ?? null
}

function playBase64Audio(base64: string): Promise<void> {
  return new Promise(resolve => {
    const audio = new Audio(`data:audio/mp3;base64,${base64}`)
    audio.onended = () => resolve()
    audio.onerror = () => resolve()
    void audio.play().catch(() => resolve())
  })
}

export function useQuestionDrill(doctorId: string, lang: 'en' | 'ar') {
  const [phase, setPhase] = useState<QuestionDrillPhase>('idle')
  const [turn1, setTurn1] = useState<QuestionDrillTurn1 | null>(null)
  const [result, setResult] = useState<QuestionDrillResult | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const rec = new MediaRecorder(stream)
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mediaRecRef.current = rec
      rec.start()
      setPhase('recording')
    } catch {
      setPhase('error')
    }
  }, [])

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

  const stopRecording = useCallback(async () => {
    const rec = mediaRecRef.current
    if (!rec) return
    setPhase('sending')

    const blob: Blob = await new Promise(resolve => {
      rec.onstop = () => resolve(new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' }))
      rec.stop()
    })
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null

    try {
      if (!turn1) {
        // Turn 1: the rep is asking the question.
        const form = new FormData()
        form.append('doctorId', doctorId)
        form.append('lang', lang)
        form.append('audio', blob, 'question.webm')

        const res = await fetch('/api/voice-partner/question-drill/ask', { method: 'POST', body: form })
        if (res.status === 503) { setPhase('notconfigured'); return }
        if (res.status === 429) { setPhase('ratelimited'); return }
        if (!res.ok) { setPhase('error'); return }
        const data = await res.json().catch(() => null) as {
          questionText?: string; doctorText?: string; questionType?: unknown
        } | null
        if (!data?.questionText || !data.doctorText || !isQuestionType(data.questionType)) { setPhase('error'); return }

        setTurn1({ questionText: data.questionText, doctorAnswer: data.doctorText, questionType: data.questionType })

        const audio = await speak(data.doctorText, lang)
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
        if (res.status === 503) { setPhase('notconfigured'); return }
        if (res.status === 429) { setPhase('ratelimited'); return }
        if (!res.ok) { setPhase('error'); return }
        const data = await res.json().catch(() => null) as {
          repResponseText?: string; doctorText?: string; listeningCuesHit?: unknown
        } | null
        if (!data?.doctorText) { setPhase('error'); return }

        const listeningCuesHit = Array.isArray(data.listeningCuesHit) ? data.listeningCuesHit.filter(isListeningCue) : []
        setResult({ doctorText: data.doctorText, listeningCuesHit })
        void saveSessionResult(turn1.questionType, listeningCuesHit)

        const audio = await speak(data.doctorText, lang)
        setPhase('playing')
        if (audio) await playBase64Audio(audio)
        setPhase('idle')
      }
    } catch {
      setPhase('error')
    }
  }, [doctorId, lang, turn1, saveSessionResult])

  const reset = useCallback(() => {
    // Stop the recorder before its source tracks — some browsers only fire
    // onstop reliably when told directly, rather than inferring it from the
    // stream going away, which left a leaving-mid-recording tap with a live
    // mic (indicator stays lit until the tab reloads).
    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
      try { mediaRecRef.current.stop() } catch { /* already stopping */ }
    }
    mediaRecRef.current = null
    chunksRef.current = []
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setPhase('idle')
    setTurn1(null)
    setResult(null)
  }, [])

  return { phase, turn1, result, startRecording, stopRecording, reset }
}
