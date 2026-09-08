'use client'
import { useCallback, useRef, useState } from 'react'
import type { FabCriterion } from '@/lib/voice-partner-fab'
import { isFabCriterion } from '@/lib/voice-partner-fab'

export type VoicePartnerFabPhase =
  | 'idle' | 'recording' | 'sending' | 'playing' | 'notconfigured' | 'error' | 'ratelimited'

export type VoicePartnerFabResult = { doctorText: string; criteriaHit: FabCriterion[] }

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

export function useVoicePartnerFab(doctorId: string, lang: 'en' | 'ar') {
  const [phase, setPhase] = useState<VoicePartnerFabPhase>('idle')
  const [result, setResult] = useState<VoicePartnerFabResult | null>(null)

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
      const form = new FormData()
      form.append('doctorId', doctorId)
      form.append('lang', lang)
      form.append('audio', blob, 'fab.webm')

      const res = await fetch('/api/voice-partner/fab-statement', { method: 'POST', body: form })
      if (res.status === 503) { setPhase('notconfigured'); return }
      if (res.status === 429) { setPhase('ratelimited'); return }
      if (!res.ok) { setPhase('error'); return }
      const data = await res.json().catch(() => null) as { doctorText?: string; criteriaHit?: unknown } | null
      if (!data?.doctorText) { setPhase('error'); return }

      const criteriaHit = Array.isArray(data.criteriaHit) ? data.criteriaHit.filter(isFabCriterion) : []
      setResult({ doctorText: data.doctorText, criteriaHit })
      void saveSessionResult(criteriaHit)

      const audio = await speak(data.doctorText, lang)
      setPhase('playing')
      if (audio) await playBase64Audio(audio)
      setPhase('idle')
    } catch {
      setPhase('error')
    }
  }, [doctorId, lang, saveSessionResult])

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
    setResult(null)
  }, [])

  return { phase, result, startRecording, stopRecording, reset }
}
