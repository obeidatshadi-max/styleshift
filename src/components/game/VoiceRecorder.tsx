'use client'
import { useEffect, useRef, useState } from 'react'
import { useLang, useT } from '@/lib/i18n'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'

export default function VoiceRecorder({ onTranscript }: { onTranscript: (text: string) => void }) {
  const t = useT()
  const { lang } = useLang()
  const [state, setState] = useState<'idle' | 'starting' | 'recording' | 'transcribing' | 'error'>('idle')
  const mounted = useRef(true)
  const request = useRef<AbortController | null>(null)
  const inFlight = useRef(false)
  const recorder = useAudioRecorder(null, lang, () => { void upload() })
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; request.current?.abort(); recorder.abort() }
  // Recorder cleanup is stable; callbacks read the current take through refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  async function upload() {
    const take = recorder.take(true)
    if (!take || inFlight.current) return
    inFlight.current = true; setState('transcribing')
    const controller = new AbortController(); request.current = controller
    const form = new FormData(); form.append('audio', take.blob); form.append('lang', lang)
    try {
      const res = await fetch('/api/transcribe', { method: 'POST', body: form, signal: controller.signal })
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (typeof data.text !== 'string' || !data.text.trim()) throw new Error()
      if (!mounted.current) return
      onTranscript(data.text); recorder.discard(); setState('idle')
    } catch { if (mounted.current) setState('error') }
    finally { inFlight.current = false }
  }
  async function start() {
    setState('starting')
    const ok = await recorder.start()
    if (mounted.current) setState(ok ? 'recording' : 'error')
    else recorder.abort()
  }
  async function stop() { await recorder.stop(); if (mounted.current) await upload() }
  const busy = state === 'starting' || state === 'transcribing'
  const ar = lang === 'ar'
  const label = state === 'recording' ? t('visit.recording') : busy ? t('visit.transcribing')
    : state === 'error' ? (ar ? 'إعادة المحاولة' : 'Retry recording / transcription') : '🎙️'
  return <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
    <button type="button" disabled={busy} title={label} aria-label={label}
      onClick={() => void (state === 'recording' ? stop() : recorder.previewUrl ? upload() : start())}
      style={{ cursor: busy ? 'not-allowed' : 'pointer', border: '1px solid var(--line)', color: state === 'error' ? 'var(--red)' : 'var(--ink-dim)', background: 'transparent', borderRadius: 8, padding: '8px 10px' }}>{label}</button>
    {state === 'error' && <span role="alert" style={{ fontSize: 12 }}>{t('visit.transcribeError')}</span>}
    {recorder.previewUrl && !busy && <button type="button" onClick={() => { recorder.discard(); setState('idle') }}>{ar ? 'إلغاء التسجيل' : 'Discard recording'}</button>}
  </span>
}
