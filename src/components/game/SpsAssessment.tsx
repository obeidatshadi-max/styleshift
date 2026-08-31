'use client'
import { useState } from 'react'
import { useLang, useT, useSpsData } from '@/lib/i18n'
import { SPS_QUESTIONS, SPS_OPPOSITE, scoreSps, type SpsResult, type SpsKey } from '@/lib/sps-core'
import LangToggle from '@/components/LangToggle'

interface Props { onComplete: (result: SpsResult) => void }

const LETTERS = ['A', 'B', 'C', 'D']

export default function SpsAssessment({ onComplete }: Props) {
  const t = useT()
  const { dir } = useLang()
  const { SPS_QUESTIONS_TEXT, SPS_PROFILES_TEXT } = useSpsData()
  const fwd = dir === 'rtl' ? '←' : '→'

  const [phase, setPhase] = useState<'intro' | 'quiz' | 'result'>('intro')
  const [answers, setAnswers] = useState<number[]>([])
  const [result, setResult] = useState<SpsResult | null>(null)

  const qIndex = answers.length
  const total = SPS_QUESTIONS.length

  function pick(optionIndex: number) {
    const next = [...answers, optionIndex]
    setAnswers(next)
    if (next.length === total) {
      setResult(scoreSps(next))
      setPhase('result')
    }
  }

  const card: React.CSSProperties = {
    width: '100%', maxWidth: 480,
    background: 'linear-gradient(180deg,var(--panel),#0a1430)',
    border: '1px solid var(--line)', borderRadius: 18,
    padding: '18px 20px 20px', boxShadow: '0 16px 50px rgba(0,0,0,.55)',
  }
  const eyebrow = (text: string) => (
    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.4em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 10 }}>{text}</div>
  )
  const btnPrimary: React.CSSProperties = {
    width: '100%', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12,
    letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)',
    color: '#04121c', background: 'var(--cyan)', borderRadius: 10, padding: '12px 18px',
    boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation',
  }

  if (phase === 'intro') {
    return (
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}><LangToggle /></div>
          {eyebrow(t('sps.eyebrow'))}
          <h2 style={{ fontSize: 'clamp(20px,5vw,28px)', fontWeight: 800, marginBottom: 12, lineHeight: 1.15 }}>{t('sps.title')}</h2>
          <p style={{ color: 'var(--ink-dim)', fontSize: 14.5, lineHeight: 1.6, marginBottom: 20 }}>{t('sps.intro')}</p>
          <button style={btnPrimary} onClick={() => setPhase('quiz')}>{t('sps.start')}</button>
        </div>
      </div>
    )
  }

  if (phase === 'quiz') {
    const q = SPS_QUESTIONS_TEXT[qIndex]
    return (
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em', color: 'var(--ink-dim)' }}>{t('sps.progress', { n: qIndex + 1, total })}</span>
            <LangToggle />
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--line)', marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(qIndex / total) * 100}%`, background: 'var(--cyan)', transition: 'width .25s' }} />
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 8 }}>{q.category}</div>
          <p style={{ fontSize: 15.5, lineHeight: 1.5, marginBottom: 18 }}>{q.text}</p>
          {q.options.map((opt, i) => (
            <button key={i} onClick={() => pick(i)} style={{ textAlign: 'start', width: '100%', cursor: 'pointer', color: 'var(--ink)', fontFamily: 'var(--sans)', fontSize: 14, lineHeight: 1.4, border: '1px solid var(--line)', borderRadius: 12, padding: '13px 14px', background: 'rgba(0,0,0,.18)', marginBottom: 10, touchAction: 'manipulation', display: 'flex', gap: 10 }}>
              <b style={{ color: 'var(--cyan)', flexShrink: 0 }}>{LETTERS[i]}</b>
              <span>{opt}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // phase === 'result'
  const r = result!
  const p = SPS_PROFILES_TEXT[r.topKey]
  const opp = SPS_PROFILES_TEXT[SPS_OPPOSITE[r.topKey]]
  const order: SpsKey[] = ['go', 'connect', 'plan', 'support']

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ ...card, maxWidth: 520 }}>
        {eyebrow(t('sps.resultEyebrow'))}
        <div style={{ background: p.gradient, borderRadius: 14, padding: '18px 18px 16px', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', opacity: .85 }}>{t('sps.resultTitle')}</div>
          <div style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 2px' }}>{p.name}</div>
          <div style={{ fontSize: 12.5, opacity: .85, marginBottom: 10 }}>{p.orient}</div>
          <p style={{ fontSize: 13.5, lineHeight: 1.5 }}>{p.desc}</p>
        </div>

        {r.balanced && (
          <p style={{ fontSize: 13, color: 'var(--ink-dim)', lineHeight: 1.5, marginBottom: 14 }}>{t('sps.balancedNote')}</p>
        )}

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 8 }}>{t('sps.scoresTitle')}</div>
          {order.map(key => {
            const pct = Math.round((r.scores[key] / r.styleTotal) * 100)
            return (
              <div key={key} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                  <span>{SPS_PROFILES_TEXT[key].name}{key === r.topKey ? ' ✦' : ''}</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{r.scores[key]}/{r.styleTotal}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: SPS_PROFILES_TEXT[key].color }} />
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '13px 14px', marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: p.color, marginBottom: 6 }}>{t('sps.strengths')}</div>
          {p.strengths.map((s, i) => <div key={i} style={{ fontSize: 13, lineHeight: 1.5 }}>• {s}</div>)}
        </div>

        <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '13px 14px', marginBottom: 12 }}>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 6 }}><b>{t('sps.growthLabel')}</b> {p.growth}</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5 }}><b>{t('sps.tipLabel')}</b> {p.tip}</div>
        </div>

        <div style={{ border: `1px solid ${opp.color}`, borderRadius: 12, padding: '13px 14px', marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: opp.color, marginBottom: 6 }}>{t('sps.oppEyebrow')} · {t('sps.oppTitle')}</div>
          <span style={{ fontSize: 13.5, lineHeight: 1.5, display: 'block', marginBottom: 8 }}
            dangerouslySetInnerHTML={{ __html: t('sps.oppIntro', { score: r.scores[SPS_OPPOSITE[r.topKey]], total: r.styleTotal, name: opp.name }) }} />
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>{t('sps.oppBorrow')}</div>
          {opp.strengths.slice(0, 3).map((s, i) => <div key={i} style={{ fontSize: 13, lineHeight: 1.5 }}>• {s}</div>)}
        </div>

        {r.complianceMax > 0 && (
          <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '13px 14px', marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 6 }}>{t('sps.complianceTitle')}</div>
            <span style={{ fontSize: 13, lineHeight: 1.5 }}
              dangerouslySetInnerHTML={{ __html: t('sps.complianceIntro', { level: t(`sps.complianceLevel.${r.complianceLevel}`), score: r.complianceRisk, max: r.complianceMax }) }} />
          </div>
        )}

        <button style={btnPrimary} onClick={() => onComplete(r)}>{t('sps.continue')} {fwd}</button>
      </div>
    </div>
  )
}
