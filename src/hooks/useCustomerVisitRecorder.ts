// src/hooks/useCustomerVisitRecorder.ts
'use client'
import { useCallback, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { diarizeAudio, DiarizationError, type DiarizedUtterance } from '@/lib/assemblyai-client'
import { persistTranscriptSegments } from '@/lib/transcript-segments'

export type VisitRecorderPhase = 'idle' | 'recording' | 'processing' | 'pick-speaker' | 'saving' | 'done' | 'error'

export interface RawSpeakerPreview { speaker: string; sample: string }

/** Records, diarizes, and stores the transcript for one consented
 * customer-visit recording (`visitId` = a `customer_visits.id` already
 * created via POST /api/customer-visits). Does not compute acoustic
 * metrics — this session type's social-style read is text-based
 * (extractSocialSignals, Task 8), not acoustic. */
export function useCustomerVisitRecorder(visitId: string) {
  const supabase = createClient()
  const [phase, setPhase] = useState<VisitRecorderPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [speakerPreviews, setSpeakerPreviews] = useState<RawSpeakerPreview[]>([])
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const utterancesRef = useRef<DiarizedUtterance[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, autoGainControl: false } })
      streamRef.current = stream
      const mediaRec = new MediaRecorder(stream)
      mediaRecRef.current = mediaRec
      chunksRef.current = []
      mediaRec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mediaRec.start()
      setPhase('recording')
      setError(null)
    } catch {
      setError('mic')
      setPhase('error')
    }
  }, [])

  const stop = useCallback(async () => {
    const mediaRec = mediaRecRef.current
    if (!mediaRec) return
    setPhase('processing')
    const blob = await new Promise<Blob>(resolve => {
      mediaRec.onstop = () => resolve(new Blob(chunksRef.current, { type: mediaRec.mimeType || 'audio/webm' }))
      mediaRec.stop()
    })
    streamRef.current?.getTracks().forEach(t => t.stop())
    try {
      const utterances = await diarizeAudio(blob)
      utterancesRef.current = utterances
      const bySpeaker = new Map<string, string>()
      for (const u of utterances) if (!bySpeaker.has(u.speaker)) bySpeaker.set(u.speaker, u.text)
      setSpeakerPreviews([...bySpeaker.entries()].map(([speaker, sample]) => ({ speaker, sample })))
      setPhase('pick-speaker')
    } catch (err) {
      setError(err instanceof DiarizationError ? err.code : 'diarize')
      setPhase('error')
    }
  }, [])

  const confirmSpeaker = useCallback(async (repSpeaker: string) => {
    setPhase('saving')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('session'); setPhase('error'); return }

    const otherSpeaker = speakerPreviews.find(p => p.speaker !== repSpeaker)?.speaker ?? null
    const { data: updated, error: updateError } = await supabase.from('customer_visits').update({
      speaker_label_rep: repSpeaker, speaker_label_customer: otherSpeaker, status: 'ready', updated_at: new Date().toISOString(),
    }).eq('id', visitId).select('id')
    if (updateError || !updated?.length) { setError('visit'); setPhase('error'); return }

    const result = await persistTranscriptSegments(supabase, {
      utterances: utterancesRef.current.map(u => ({ speaker: u.speaker, text: u.text, start: u.start, end: u.end })),
      repSpeaker, sessionType: 'customer_visit', sessionId: visitId, repId: user.id, transcriptVersion: 1,
    })
    if (!result.ok) { setError('speakers'); setPhase('error'); return }
    setPhase('done')
  }, [supabase, visitId, speakerPreviews])

  return { phase, error, speakerPreviews, start, stop, confirmSpeaker }
}
