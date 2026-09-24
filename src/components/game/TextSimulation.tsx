'use client'
import { useEffect, useRef, useState } from 'react'
import { useT, useLang, useGameData } from '@/lib/i18n'
import type { Doctor } from '@/types/game'
import { useTextSimulation } from '@/hooks/useTextSimulation'
import { ConversationReport } from '@/components/report/ConversationReport'
import type { ConversationReport as ConversationReportType } from '@/schemas/conversationReport'

export const fs = (px: number) => `max(${px}px, var(--voice-min-font, 0px))`
export const card: React.CSSProperties = { background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,.45)' }
export const primaryBtn: React.CSSProperties = { width: '100%', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: fs(12), letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: '#04121c', background: 'var(--cyan)', borderRadius: 10, padding: '12px 18px', boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation' }
export const ghostBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: fs(12), letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'transparent', borderRadius: 10, padding: '12px 18px', touchAction: 'manipulation' }
export const sectionLabel: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: fs(11), letterSpacing: '.3em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 10 }
export const smallLabel: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: fs(10), letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 4 }
export const bodyText: React.CSSProperties = { fontSize: fs(13.5), lineHeight: 1.55, color: 'var(--ink)' }

interface Props {
  doctor: Doctor
  onDone: () => void
}

const COLOR: Record<string, string> = { driver: 'var(--purple)', expressive: 'var(--green)', amiable: 'var(--pink)', analytical: 'var(--cyan)' }

const shell = (children: React.ReactNode) => (
  <div className="voice-practice" style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14 }}>{children}</div>
)

/** Text role-play against the AI Doctor, then the multi-agent report. The
 * conversation and analysis are driven server-side by the orchestrator; this
 * component only collects input and shows results. */
export default function TextSimulation({ doctor, onDone }: Props) {
  const t = useT()
  const { lang } = useLang()
  const { STYLES } = useGameData()
  const { phase, errorKind, messages, sessionId, start, send, end } = useTextSimulation(doctor.id, lang)
  const [draft, setDraft] = useState('')
  const startedRef = useRef(false)
  const logRef = useRef<HTMLDivElement>(null)
  const [conversationReport, setConversationReport] = useState<ConversationReportType | null>(null)
  const [reportFailed, setReportFailed] = useState(false)
  const [reportAttempt, setReportAttempt] = useState(0)
  const fetchedForRef = useRef<string | null>(null) // `${sessionId}:${reportAttempt}` already fetched

  useEffect(() => {
    if (startedRef.current) return // React strict mode double-invokes effects
    startedRef.current = true
    void start()
  }, [start])

  useEffect(() => {
    // scrollTop, not scrollTo(): works on the older phones this app targets.
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, phase])

  // Runs the shared conversation-report pipeline once the session reaches
  // phase: 'reported' server-side. Guarded by sessionId so a re-render (or
  // Retry) doesn't re-fetch a report already fetched for this session.
  useEffect(() => {
    if (phase !== 'report' || !sessionId) return
    const key = `${sessionId}:${reportAttempt}`
    if (fetchedForRef.current === key) return
    fetchedForRef.current = key
    setReportFailed(false)
    fetch('/api/reports/generate', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionType: 'ai_doctor_text', sessionId }),
    })
      .then(res => res.json().catch(() => null))
      .then(data => { if (data?.report) setConversationReport(data.report); else setReportFailed(true) })
      .catch(() => setReportFailed(true))
  }, [phase, sessionId, reportAttempt])

  function retryFullSession() {
    setDraft(''); setConversationReport(null); fetchedForRef.current = null; setReportAttempt(0)
    void start()
  }

  function retryReportGeneration() {
    setConversationReport(null); setReportFailed(false)
    setReportAttempt(n => n + 1)
  }

  async function submit() {
    const text = draft
    if (!text.trim() || phase !== 'live') return
    setDraft('')
    const ok = await send(text)
    if (!ok) setDraft(text) // a failed send costs the rep nothing they typed
  }

  if (phase === 'report') {
    return shell(
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={card}>
          <div style={sectionLabel}>{t('sim.report.title')}</div>
          {!conversationReport && !reportFailed && (
            <div role="status" aria-live="polite" style={{ fontFamily: 'var(--mono)', fontSize: fs(12.5), color: 'var(--ink-dim)' }}>{t('sim.ending')}</div>
          )}
          {reportFailed && (
            <div role="alert" style={bodyText}>
              {t('sim.error.generic')}
              <button onClick={retryReportGeneration} style={{ ...ghostBtn, width: '100%', marginTop: 12 }}>{t('sim.retry')}</button>
            </div>
          )}
        </div>
        {conversationReport && <ConversationReport report={conversationReport} outdated={false} />}
        <button onClick={retryFullSession} style={primaryBtn}>{t('sim.report.tryAgain')}</button>
        <button onClick={onDone} style={{ ...ghostBtn, width: '100%' }}>{t('sim.back')}</button>
      </div>,
    )
  }

  if (phase === 'idle' || phase === 'starting' || phase === 'ending') {
    return shell(
      <div style={card} role="status" aria-live="polite">
        <div style={{ fontFamily: 'var(--mono)', fontSize: fs(12.5), color: 'var(--ink-dim)' }}>
          {phase === 'ending' ? t('sim.ending') : t('sim.starting')}
        </div>
      </div>,
    )
  }

  if (phase === 'error') {
    return shell(
      <div style={card}>
        <div role="alert" style={{ ...bodyText, marginBottom: 14 }}>{t(`sim.error.${errorKind ?? 'generic'}`)}</div>
        <button onClick={() => void start()} style={primaryBtn}>{t('sim.retry')}</button>
        <button onClick={onDone} style={{ ...ghostBtn, width: '100%', marginTop: 10 }}>{t('sim.back')}</button>
      </div>,
    )
  }

  const speaker = (role: 'doctor' | 'rep') => (role === 'doctor' ? t('sim.doctor') : t('sim.you'))
  const style = doctor.style
  const s = style ? STYLES[style] : null
  const c = style ? COLOR[style] : 'var(--ink-dim)'
  const busy = phase === 'sending'
  const repTurns = messages.filter(m => m.role === 'rep').length

  return shell(
    <div style={card}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
        {s && <div style={{ width: 46, height: 46, flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, border: `2px solid ${c}`, boxShadow: `0 0 14px ${c}`, color: c }}>{s.icon}</div>}
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{doctor.name}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: fs(11), letterSpacing: '.1em', color: 'var(--ink-dim)' }}>{t('sim.repTurns', { n: repTurns })}</div>
        </div>
      </div>

      <div ref={logRef} role="log" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, maxHeight: 340, overflowY: 'auto' }}>
        {messages.map((m, i) => (
          <div key={i} dir="auto" aria-label={`${speaker(m.role)}: ${m.text}`} style={{
            alignSelf: m.role === 'doctor' ? 'flex-start' : 'flex-end', maxWidth: '85%', borderRadius: 12, padding: '9px 12px',
            fontSize: fs(13.5), lineHeight: 1.5,
            background: m.role === 'doctor' ? 'rgba(0,0,0,.25)' : 'rgba(62,224,143,.1)',
            border: `1px solid ${m.role === 'doctor' ? 'var(--line)' : 'var(--green)'}`,
          }}>
            <span aria-hidden="true" style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: fs(9.5), letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 2 }}>{speaker(m.role)}</span>
            {m.text}
          </div>
        ))}
        {busy && <div style={{ alignSelf: 'flex-start', fontFamily: 'var(--mono)', fontSize: fs(11.5), color: 'var(--ink-dim)' }}>{t('sim.sending')}</div>}
      </div>

      {errorKind && <div role="alert" style={{ ...bodyText, color: 'var(--red)', marginBottom: 10 }}>{t(`sim.error.${errorKind}`)}</div>}

      <label htmlFor="sim-input" style={{ ...smallLabel, display: 'block' }}>{t('sim.inputLabel')}</label>
      <textarea
        id="sim-input" dir="auto" rows={3} value={draft} disabled={busy} maxLength={2000}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit() } }}
        placeholder={t('sim.inputPlaceholder')}
        style={{ width: '100%', background: 'rgba(0,0,0,.3)', border: '1px solid var(--line)', borderRadius: 10, padding: '11px 13px', color: 'var(--ink)', fontFamily: 'var(--sans)', fontSize: fs(14), outline: 'none', resize: 'vertical', marginBottom: 10 }}
      />
      <button onClick={() => void submit()} disabled={busy || !draft.trim()} style={{ ...primaryBtn, opacity: busy || !draft.trim() ? 0.6 : 1 }}>{t('sim.send')}</button>
      <button onClick={() => void end()} disabled={busy} style={{ ...ghostBtn, width: '100%', marginTop: 10, opacity: busy ? 0.6 : 1 }}>{t('sim.end')}</button>
      <button onClick={onDone} style={{ ...ghostBtn, width: '100%', marginTop: 10, borderColor: 'var(--line)', color: 'var(--ink-dim)' }}>{t('sim.back')}</button>
    </div>,
  )
}
