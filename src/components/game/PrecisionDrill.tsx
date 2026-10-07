'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useT, useLang } from '@/lib/i18n'
import type { Doctor } from '@/types/game'
import {
  GOOD_VERDICTS, MAX_REP_QUESTION_CHARS, PRECISION_ROUNDS, isPrecisionVerdict, type PrecisionVerdict,
} from '@/lib/precision-drill'
import { isVaguePattern, type VaguePattern } from '@/lib/precision-language'

interface Props { doctor: Doctor; onDone: () => void }

type Phase = 'loading' | 'asking' | 'judging' | 'answered' | 'done' | 'notconfigured' | 'ratelimited' | 'error'
interface Round { pattern: VaguePattern; doctorLine: string; repQuestion?: string; verdict?: PrecisionVerdict; doctorText?: string }

const card: React.CSSProperties = { background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,.45)' }
const primaryBtn: React.CSSProperties = { width: '100%', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: '#04121c', background: 'var(--cyan)', borderRadius: 10, padding: '12px 18px', boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation' }
const ghostBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'transparent', borderRadius: 10, padding: '12px 18px', touchAction: 'manipulation' }
const bubble: React.CSSProperties = { borderRadius: 12, padding: '9px 12px', fontSize: 13.5, lineHeight: 1.5, background: 'rgba(0,0,0,.25)', border: '1px solid var(--line)' }
const label: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 6 }

/** Typed drill: the doctor says one vague line, the rep asks one follow-up that makes it specific.
 * Based on The Structure of Magic I (Bandler & Grinder 1975), Ch. 3-4. Nothing is saved. */
export default function PrecisionDrill({ doctor, onDone }: Props) {
  const t = useT()
  const { lang } = useLang()
  const [phase, setPhase] = useState<Phase>('loading')
  const [rounds, setRounds] = useState<Round[]>([])
  const [question, setQuestion] = useState('')
  const started = useRef(false)

  const call = useCallback(async (body: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
    try {
      const res = await fetch('/api/voice-partner/precision-drill', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doctorId: doctor.id, lang, ...body }),
      })
      if (res.status === 503) { setPhase('notconfigured'); return null }
      if (res.status === 429) { setPhase('ratelimited'); return null }
      if (!res.ok) { setPhase('error'); return null }
      return await res.json().catch(() => null)
    } catch {
      setPhase('error'); return null
    }
  }, [doctor.id, lang])

  const nextLine = useCallback(async (used: VaguePattern[]) => {
    setPhase('loading')
    const data = await call({ action: 'line', usedPatterns: used })
    if (!data) return
    if (!isVaguePattern(data.pattern) || typeof data.doctorLine !== 'string') { setPhase('error'); return }
    setRounds(r => [...r, { pattern: data.pattern as VaguePattern, doctorLine: data.doctorLine as string }])
    setQuestion('')
    setPhase('asking')
  }, [call])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void nextLine([])
  }, [nextLine])

  const current = rounds[rounds.length - 1]

  async function submit() {
    const repQuestion = question.trim()
    if (!current || !repQuestion) return
    setPhase('judging')
    const data = await call({ action: 'judge', pattern: current.pattern, doctorLine: current.doctorLine, repQuestion })
    if (!data) return
    if (!isPrecisionVerdict(data.verdict) || typeof data.doctorText !== 'string') { setPhase('error'); return }
    setRounds(r => r.map((x, i) => i === r.length - 1 ? { ...x, repQuestion, verdict: data.verdict as PrecisionVerdict, doctorText: data.doctorText as string } : x))
    setPhase('answered')
  }

  function next() {
    if (rounds.length >= PRECISION_ROUNDS) { setPhase('done'); return }
    void nextLine(rounds.map(r => r.pattern))
  }

  const wrap = (children: React.ReactNode) => (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14 }}>
      <div style={card}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.3em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 6 }}>{t('precision.title')}</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{doctor.name}</div>
        {children}
        <p style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--ink-dim)', marginTop: 14 }}>{t('precision.source')}</p>
      </div>
    </div>
  )

  if (phase === 'notconfigured' || phase === 'ratelimited' || phase === 'error') {
    const msg = phase === 'notconfigured' ? t('voice.notConfigured') : phase === 'ratelimited' ? t('precision.rateLimited') : t('precision.error')
    return wrap(<>
      <p role="alert" style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-dim)', marginBottom: 14 }}>{msg}</p>
      <div style={{ display: 'flex', gap: 10 }}>
        {phase === 'error' && <button style={ghostBtn} onClick={() => current && !current.verdict ? setPhase('asking') : void nextLine(rounds.map(r => r.pattern))}>{t('precision.retry')}</button>}
        <button style={ghostBtn} onClick={onDone}>{t('voice.back')}</button>
      </div>
    </>)
  }

  if (phase === 'done') {
    const good = rounds.filter(r => r.verdict && GOOD_VERDICTS.includes(r.verdict)).length
    return wrap(<>
      <p style={{ fontSize: 14.5, lineHeight: 1.6, marginBottom: 12 }}>{t('precision.summary', { good, total: rounds.length })}</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rounds.map((r, i) => (
          <li key={i} style={{ fontSize: 13, lineHeight: 1.5 }}>
            {r.verdict && GOOD_VERDICTS.includes(r.verdict) ? '✓' : '—'} {t(`precision.pattern.${r.pattern}`)} · <span style={{ color: 'var(--ink-dim)' }}>{t('precision.tryAsking')}: {t(`precision.example.${r.pattern}`)}</span>
          </li>
        ))}
      </ul>
      <button style={primaryBtn} onClick={onDone}>{t('precision.finish')}</button>
    </>)
  }

  return wrap(<>
    <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-dim)', marginBottom: 12 }}>{t('precision.intro')}</p>
    <div style={{ ...label, color: 'var(--cyan)' }}>{t('precision.round', { n: Math.max(rounds.length, 1), total: PRECISION_ROUNDS })}</div>

    {phase === 'loading' || !current
      ? <p role="status" style={{ fontSize: 13.5, color: 'var(--ink-dim)' }}>{t('precision.loading')}</p>
      : <>
        <div style={label}>{t('precision.doctorSays')}</div>
        <div dir="auto" style={{ ...bubble, marginBottom: 14 }}>{current.doctorLine}</div>

        {(phase === 'asking' || phase === 'judging') && <>
          <label htmlFor="precision-question" style={{ ...label, display: 'block' }}>{t('precision.yourQuestion')}</label>
          <textarea id="precision-question" dir="auto" value={question} maxLength={MAX_REP_QUESTION_CHARS} rows={3}
            onChange={e => setQuestion(e.target.value)} placeholder={t('precision.placeholder')} disabled={phase === 'judging'}
            style={{ width: '100%', background: 'rgba(0,0,0,.3)', border: '1px solid var(--line)', borderRadius: 10, padding: '11px 13px', color: 'var(--ink)', fontFamily: 'var(--sans)', fontSize: 14, outline: 'none', resize: 'vertical', marginBottom: 10 }} />
          <button style={{ ...primaryBtn, opacity: question.trim() && phase === 'asking' ? 1 : 0.5 }} disabled={!question.trim() || phase !== 'asking'} onClick={submit}>
            {phase === 'judging' ? t('precision.thinking') : t('precision.send')}
          </button>
        </>}

        {phase === 'answered' && current.verdict && <>
          <div style={label}>{t('precision.yourQuestion')}</div>
          <div dir="auto" style={{ ...bubble, marginBottom: 10 }}>{current.repQuestion}</div>
          <div style={label}>{t('precision.doctorReplies')}</div>
          <div dir="auto" style={{ ...bubble, marginBottom: 12 }}>{current.doctorText}</div>
          {(() => {
            const good = GOOD_VERDICTS.includes(current.verdict)
            const color = good ? 'var(--green)' : 'var(--amber)'
            return (
              <div role="status" style={{ borderRadius: 12, padding: '11px 13px', border: `1px solid ${color}`, background: 'rgba(0,0,0,.2)', marginBottom: 12 }}>
                <b style={{ display: 'block', fontFamily: 'var(--mono)', letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 11, marginBottom: 5, color }}>{t(`precision.verdict.${current.verdict}`)}</b>
                <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>{t(`precision.verdict.${current.verdict}.desc`)}</span>
                <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, color: 'var(--ink-dim)' }}>
                  {t('precision.pattern')}: {t(`precision.pattern.${current.pattern}`)} · {t('precision.tryAsking')}: {t(`precision.example.${current.pattern}`)}
                </div>
              </div>
            )
          })()}
          <button style={primaryBtn} onClick={next}>{rounds.length >= PRECISION_ROUNDS ? t('precision.seeSummary') : t('precision.next')}</button>
        </>}
      </>}
    <button style={{ ...ghostBtn, marginTop: 10 }} onClick={onDone}>{t('voice.back')}</button>
  </>)
}
