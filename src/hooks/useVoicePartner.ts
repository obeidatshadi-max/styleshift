'use client'
import { useCallback, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { XP_VALUES } from '@/lib/game-data'
import type { VoicePartnerTurn, TurnOutcome } from '@/lib/voice-partner-core'

export type VoicePartnerPhase =
  | 'idle' | 'opening' | 'recording' | 'sending' | 'playing' | 'notconfigured' | 'error'

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

export function useVoicePartner(doctorId: string, lang: 'en' | 'ar') {
  const supabase = createClient()
  const [phase, setPhase] = useState<VoicePartnerPhase>('idle')
  const [transcript, setTranscript] = useState<VoicePartnerTurn[]>([])
  const [turnCount, setTurnCount] = useState(0)
  const [outcome, setOutcome] = useState<TurnOutcome | null>(null)
  const [openingText, setOpeningText] = useState('')

  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startVoicePartner = useCallback(async () => {
    setPhase('opening')
    setTranscript([])
    setTurnCount(0)
    setOutcome(null)
    try {
      const res = await fetch('/api/voice-partner/open', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doctorId, lang }),
      })
      if (res.status === 503) { setPhase('notconfigured'); return }
      if (!res.ok) { setPhase('error'); return }
      const data = await res.json().catch(() => null) as { doctorText?: string } | null
      if (!data?.doctorText) { setPhase('error'); return }
      setOpeningText(data.doctorText)
      setTranscript([{ role: 'doctor', text: data.doctorText }])

      const audio = await speak(data.doctorText, lang)
      setPhase('playing')
      if (audio) await playBase64Audio(audio)
      setPhase('idle')
    } catch {
      setPhase('error')
    }
  }, [doctorId, lang])

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

  const awardXpOnWin = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile, error: profileError } = await supabase.from('profiles').select('xp').eq('id', user.id).single()
    if (profileError || !profile) return
    const { error: xpError } = await supabase.from('profiles').update({ xp: profile.xp + XP_VALUES.voicePartnerWin }).eq('id', user.id)
    if (xpError) console.error('voice partner xp update failed:', xpError.message)
  }, [supabase])

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
      form.append('history', JSON.stringify(transcript))
      form.append('audio', blob, 'turn.webm')

      const res = await fetch('/api/voice-partner/turn', { method: 'POST', body: form })
      if (res.status === 503) { setPhase('notconfigured'); return }
      if (!res.ok) { setPhase('error'); return }
      const data = await res.json().catch(() => null) as {
        repText?: string; doctorText?: string; outcome?: TurnOutcome; turnCount?: number
      } | null
      if (!data?.repText || !data.doctorText || !data.outcome) { setPhase('error'); return }

      const nextTranscript: VoicePartnerTurn[] = [
        ...transcript, { role: 'rep', text: data.repText }, { role: 'doctor', text: data.doctorText },
      ]
      setTranscript(nextTranscript)
      setTurnCount(data.turnCount ?? turnCount + 1)
      // `outcome` means "the session has resolved" everywhere it's read — a
      // non-terminal 'continue' must leave it null so the mic stays available.
      if (data.outcome !== 'continue') setOutcome(data.outcome)

      const audio = await speak(data.doctorText, lang)
      setPhase('playing')
      if (audio) await playBase64Audio(audio)

      if (data.outcome === 'won') await awardXpOnWin()
      setPhase('idle')
    } catch {
      setPhase('error')
    }
  }, [doctorId, lang, transcript, turnCount, awardXpOnWin])

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
    setTranscript([])
    setTurnCount(0)
    setOutcome(null)
    setOpeningText('')
  }, [])

  return { phase, transcript, turnCount, outcome, openingText, startVoicePartner, startRecording, stopRecording, reset }
}
