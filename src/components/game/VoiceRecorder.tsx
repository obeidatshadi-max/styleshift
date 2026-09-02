'use client'
import { useRef, useState } from 'react'
import { useT } from '@/lib/i18n'

type State = 'idle' | 'recording' | 'transcribing' | 'error' | 'notconfigured'

/** Mic button: records a short clip, uploads to /api/transcribe, hands the
 * transcript back to the caller. Degrades to a disabled "coming soon" state
 * when transcription isn't configured server-side. */
export default function VoiceRecorder({ onTranscript }: { onTranscript: (text: string) => void }) {
  const t = useT()
  const [state, setState] = useState<State>('idle')
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  async function upload() {
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    const form = new FormData()
    form.append('audio', blob)
    try {
      const res = await fetch('/api/transcribe', { method: 'POST', body: form })
      if (res.status === 503) { setState('notconfigured'); return }
      if (!res.ok) { setState('error'); return }
      const data = await res.json().catch(() => null) as { text?: string } | null
      if (data?.text) { onTranscript(data.text); setState('idle') }
      else setState('error')
    } catch {
      setState('error')
    }
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = () => { stream.getTracks().forEach(tr => tr.stop()); void upload() }
      mediaRef.current = rec
      rec.start()
      setState('recording')
    } catch {
      setState('error')
    }
  }

  function stop() {
    mediaRef.current?.stop()
    setState('transcribing')
  }

  const busy = state === 'transcribing' || state === 'notconfigured'
  const danger = state === 'recording' || state === 'error'
  const label =
    state === 'recording' ? t('visit.recording') :
    state === 'transcribing' ? t('visit.transcribing') :
    state === 'notconfigured' ? t('visit.micNotConfigured') :
    state === 'error' ? t('visit.transcribeError') : '🎙️'

  return (
    <button
      type="button"
      onClick={state === 'recording' ? stop : start}
      disabled={busy}
      title={label}
      style={{
        cursor: busy ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.03em',
        border: `1px solid ${danger ? 'var(--red)' : 'var(--line)'}`,
        color: danger ? 'var(--red)' : 'var(--ink-dim)',
        background: state === 'recording' ? 'rgba(255,80,80,.08)' : 'transparent',
        borderRadius: 8, padding: '8px 10px', flexShrink: 0, touchAction: 'manipulation',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}
