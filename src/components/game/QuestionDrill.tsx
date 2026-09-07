'use client'
import { useState } from 'react'
import { useT, useLang, useGameData } from '@/lib/i18n'
import type { Doctor } from '@/types/game'
import { useQuestionDrill } from '@/hooks/useQuestionDrill'
import { LISTENING_CUES, type QuestionType, type ListeningCue } from '@/lib/voice-partner-questioning'
import { Feedback, escapeHtml } from './helpers'

interface Props {
  doctor: Doctor
  onDone: (meta: { completed: boolean; questionType: QuestionType | null; listeningCuesHit: ListeningCue[] }) => void
}

const COLOR: Record<string, string> = { driver: 'var(--purple)', expressive: 'var(--green)', amiable: 'var(--pink)', analytical: 'var(--cyan)' }
const TYPE_COLOR: Record<QuestionType, string> = {
  forbidden_reason: 'var(--red)', forbidden_indication: 'var(--red)',
  effective_challenges: 'var(--green)', effective_criteria: 'var(--green)',
  other: 'var(--amber)',
}

const primaryBtn: React.CSSProperties = { width: '100%', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: '#04121c', background: 'var(--cyan)', borderRadius: 10, padding: '12px 18px', boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation' }
const ghostBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'transparent', borderRadius: 10, padding: '12px 18px', touchAction: 'manipulation' }

export default function QuestionDrill({ doctor, onDone }: Props) {
  const t = useT()
  const { lang } = useLang()
  const { STYLES } = useGameData()
  const { phase, turn1, result, startRecording, stopRecording, reset } = useQuestionDrill(doctor.id, lang)
  const [consentChecked, setConsentChecked] = useState(false)
  const [consented, setConsented] = useState(false)

  const style = doctor.style
  const s = style ? STYLES[style] : null
  const c = style ? COLOR[style] : 'var(--ink-dim)'

  if (!consented) {
    return (
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14 }}>
        <div style={{ background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,.45)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.4em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 10 }}>{t('voice.consentTitle')}</div>
          <p style={{ color: 'var(--ink-dim)', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>{t('voice.consentBody')}</p>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.5, marginBottom: 18, cursor: 'pointer' }}>
            <input type="checkbox" checked={consentChecked} onChange={e => setConsentChecked(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--cyan)' }} />
            {t('voice.consentCheckbox')}
          </label>
          <button
            style={{ ...primaryBtn, opacity: consentChecked ? 1 : 0.5, cursor: consentChecked ? 'pointer' : 'not-allowed' }}
            disabled={!consentChecked}
            onClick={() => setConsented(true)}
          >
            {t('voice.consentAgree')}
          </button>
          <button style={{ ...ghostBtn, width: '100%', marginTop: 10 }} onClick={() => onDone({ completed: false, questionType: null, listeningCuesHit: [] })}>
            {t('voice.consentCancel')}
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'notconfigured') {
    return (
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14 }}>
        <div style={{ display: 'inline-block', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--purple)', border: '1px solid var(--purple)', borderRadius: 20, padding: '4px 11px', marginBottom: 14, background: 'rgba(176,108,255,.08)' }}>{t('voice.premium')}</div>
        <div style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink)', marginBottom: 10 }}>{t('voiceQuestion.teaser', { name: doctor.name })}</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-dim)', marginBottom: 14 }}>{t('voice.notConfigured')}</div>
        <button onClick={() => onDone({ completed: false, questionType: null, listeningCuesHit: [] })} style={ghostBtn}>{t('voice.back')}</button>
      </div>
    )
  }

  const label =
    phase === 'recording' ? t('voice.listening') :
    phase === 'sending' ? t('voice.thinking') :
    phase === 'playing' ? t('voice.speaking') :
    phase === 'ratelimited' ? t('voiceQuestion.rateLimited') :
    phase === 'error' ? t('voice.error') :
    t('voice.tapToSpeak')

  const subtitle = turn1 ? t('voiceQuestion.subtitleRespond') : t('voiceQuestion.subtitleAsk')

  const listeningHtml = result
    ? `<div>${escapeHtml(result.doctorText)}</div>` +
      `<ul style="margin:8px 0 0;padding-inline-start:18px;list-style:none">` +
      LISTENING_CUES.map(cue => `<li>${result.listeningCuesHit.includes(cue) ? '✓' : '—'} ${escapeHtml(t(`voiceQuestion.cue.${cue}`))}</li>`).join('') +
      `</ul>`
    : ''

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14 }}>
      <div style={{ background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,.45)' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
          {s && <div style={{ width: 46, height: 46, flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, border: `2px solid ${c}`, boxShadow: `0 0 14px ${c}`, color: c }}>{s.icon}</div>}
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{doctor.name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em', color: 'var(--ink-dim)' }}>{subtitle}</div>
          </div>
        </div>

        {turn1 && !result && (
          <div style={{ borderRadius: 12, padding: '9px 12px', fontSize: 13.5, lineHeight: 1.5, background: 'rgba(0,0,0,.25)', border: '1px solid var(--line)', marginBottom: 14 }}>
            {turn1.doctorAnswer}
          </div>
        )}

        {!result && (
          <>
            {/* Stays enabled in the 'error' phase on purpose: an upstream
                failure is retried by simply recording again. */}
            <button
              onClick={phase === 'recording' ? stopRecording : startRecording}
              disabled={phase === 'sending' || phase === 'playing'}
              style={{
                width: '100%', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 13, letterSpacing: '.1em', textTransform: 'uppercase',
                border: `1px solid ${phase === 'recording' ? 'var(--red)' : 'var(--cyan)'}`,
                color: phase === 'recording' ? 'var(--red)' : '#04121c',
                background: phase === 'recording' ? 'rgba(255,80,80,.08)' : 'var(--cyan)',
                borderRadius: 10, padding: '14px 18px', touchAction: 'manipulation',
                opacity: (phase === 'sending' || phase === 'playing') ? 0.6 : 1,
              }}
            >
              🎙️ {label}
            </button>
            {/* Always-available exit before a result exists. `reset()`
                releases any live mic stream/recorder first — tapping this
                mid-recording must not strand the microphone. Reports
                completed: false so the wrapper skips logging a phantom visit. */}
            <button
              onClick={() => { reset(); onDone({ completed: false, questionType: null, listeningCuesHit: [] }) }}
              style={{ ...ghostBtn, marginTop: 10 }}
            >
              {t('voice.back')}
            </button>
          </>
        )}

        {result && turn1 && (
          <>
            <div style={{ borderRadius: 12, padding: '11px 13px', border: `1px solid ${TYPE_COLOR[turn1.questionType]}`, background: 'rgba(0,0,0,.2)', marginBottom: 10 }}>
              <b style={{ display: 'block', fontFamily: 'var(--mono)', letterSpacing: '.1em', textTransform: 'uppercase', fontSize: 11, marginBottom: 5, color: TYPE_COLOR[turn1.questionType] }}>{t(`voiceQuestion.type.${turn1.questionType}`)}</b>
              <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>{t(`voiceQuestion.type.${turn1.questionType}.desc`)}</span>
            </div>
            <Feedback ok={result.listeningCuesHit.length >= 2} title={t('voiceQuestion.done')} body={listeningHtml} />
            <div style={{ marginTop: 14 }}>
              <button
                onClick={() => onDone({ completed: true, questionType: turn1.questionType, listeningCuesHit: result.listeningCuesHit })}
                style={{ cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.15em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: '#04121c', background: 'var(--cyan)', borderRadius: 10, padding: '12px 18px', boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation' }}
              >
                {t('result.logContinue')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
