'use client'
import { useCallback, useRef, useState } from 'react'
import { logVoiceEvent, type VoiceMode } from '@/lib/voice-events'

/**
 * The record → listen-back → confirm/re-record mechanics shared by every
 * AI-voice-partner mode (objection, opening, FAB, closing, question) — was
 * near-identical duplicated code in all 5 mode hooks before this extraction.
 * Owns only mic/MediaRecorder/blob/preview-URL lifecycle; the calling hook
 * still owns its own larger phase state machine (recording/review are just
 * two of its phases) and decides what to do with a confirmed take.
 */
export function useAudioRecorder(mode: VoiceMode, lang: 'en' | 'ar') {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingStartRef = useRef<number>(0)
  const durationRef = useRef<number>(0)
  const blobRef = useRef<Blob | null>(null)

  const clearPreview = useCallback(() => {
    setPreviewUrl(url => { if (url) URL.revokeObjectURL(url); return null })
    blobRef.current = null
  }, [])

  /** Requests the mic and starts capture. Returns false on permission denial. */
  const start = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const rec = new MediaRecorder(stream)
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mediaRecRef.current = rec
      rec.start()
      recordingStartRef.current = Date.now()
      logVoiceEvent(mode, lang, 'recording_start')
      return true
    } catch {
      logVoiceEvent(mode, lang, 'mic_denied')
      return false
    }
  }, [mode, lang])

  /** Stops capture, releases the mic, and readies a listen-back preview. */
  const stop = useCallback(async () => {
    const rec = mediaRecRef.current
    if (!rec) return
    const blob: Blob = await new Promise(resolve => {
      rec.onstop = () => resolve(new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' }))
      rec.stop()
    })
    durationRef.current = Math.round((Date.now() - recordingStartRef.current) / 1000)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    blobRef.current = blob
    setPreviewUrl(URL.createObjectURL(blob))
  }, [])

  /** Discards the current take (rep chose "re-record"). */
  const discard = useCallback(() => { clearPreview() }, [clearPreview])

  /** Hands off the confirmed take and clears the preview — call right before uploading. */
  const take = useCallback((): { blob: Blob; durationSec: number } | null => {
    const blob = blobRef.current
    if (!blob) return null
    const durationSec = durationRef.current
    clearPreview()
    return { blob, durationSec }
  }, [clearPreview])

  /** Force-stops any live recorder/stream and clears the preview — for reset(). */
  const abort = useCallback(() => {
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
    clearPreview()
  }, [clearPreview])

  return { previewUrl, start, stop, discard, take, abort }
}
