'use client'
import { useEffect } from 'react'
import { useT, useLang, useGameData } from '@/lib/i18n'
import type { Doctor } from '@/types/game'
import { useVoicePartner } from '@/hooks/useVoicePartner'
import { TURN_CAP } from '@/lib/voice-partner-core'
import { Feedback } from './helpers'

interface Props {
  doctor: Doctor
  onDone: (won: boolean, meta: { turns: number; openingCrisis: string }) => void
}

const COLOR: Record<string, string> = { driver: 'var(--purple)', expressive: 'var(--green)', amiable: 'var(--pink)', analytical: 'var(--cyan)' }

const ghostBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'transparent', borderRadius: 10, padding: '12px 18px', touchAction: 'manipulation' }

export default function VoicePartner({ doctor, onDone }: Props) {
  const t = useT()
  const { lang } = useLang()
  const { STYLES } = useGameData()
  const { phase, transcript, turnCount, outcome, openingText, startVoicePartner, startRecording, stopRecording, reset } = useVoicePartner(doctor.id, lang)

  useEffect(() => { void startVoicePartner() }, [startVoicePartner])

  const style = doctor.style
  const s = style ? STYLES[style] : null
  const c = style ? COLOR[style] : 'var(--ink-dim)'

  if (phase === 'notconfigured') {
    return (
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14 }}>
        <div style={{ display: 'inline-block', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--purple)', border: '1px solid var(--purple)', borderRadius: 20, padding: '4px 11px', marginBottom: 14, background: 'rgba(176,108,255,.08)' }}>{t('voice.premium')}</div>
        <div style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink)', marginBottom: 10 }}>{t('voice.teaser', { name: doctor.name })}</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-dim)', marginBottom: 14 }}>{t('voice.notConfigured')}</div>
        <button onClick={() => onDone(false, { turns: 0, openingCrisis: '' })} style={ghostBtn}>{t('voice.back')}</button>
      </div>
    )
  }

  const label =
    phase === 'opening' ? t('voice.connecting') :
    phase === 'recording' ? t('voice.listening') :
    phase === 'sending' ? t('voice.thinking') :
    phase === 'playing' ? t('voice.speaking') :
    phase === 'error' ? t('voice.error') :
    t('voice.tapToSpeak')

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14 }}>
      <div style={{ background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,.45)' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
          {s && <div style={{ width: 46, height: 46, flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, border: `2px solid ${c}`, boxShadow: `0 0 14px ${c}`, color: c }}>{s.icon}</div>}
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{doctor.name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em', color: 'var(--ink-dim)' }}>{t('voice.turnCounter', { n: turnCount, max: TURN_CAP })}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, maxHeight: 320, overflowY: 'auto' }}>
          {transcript.map((turn, i) => (
            <div key={i} style={{
              alignSelf: turn.role === 'doctor' ? 'flex-start' : 'flex-end',
              maxWidth: '85%', borderRadius: 12, padding: '9px 12px', fontSize: 13.5, lineHeight: 1.5,
              background: turn.role === 'doctor' ? 'rgba(0,0,0,.25)' : 'rgba(62,224,143,.1)',
              border: `1px solid ${turn.role === 'doctor' ? 'var(--line)' : 'var(--green)'}`,
            }}>
              {turn.text}
            </div>
          ))}
        </div>

        {!outcome && (
          <>
            {/* Stays enabled in the 'error' phase on purpose: an upstream failure
                is retried by simply speaking again — the client-held transcript
                and turn count are untouched, per the spec's error contract. */}
            <button
              onClick={phase === 'recording' ? stopRecording : startRecording}
              disabled={phase === 'opening' || phase === 'sending' || phase === 'playing'}
              style={{
                width: '100%', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 13, letterSpacing: '.1em', textTransform: 'uppercase',
                border: `1px solid ${phase === 'recording' ? 'var(--red)' : 'var(--cyan)'}`,
                color: phase === 'recording' ? 'var(--red)' : '#04121c',
                background: phase === 'recording' ? 'rgba(255,80,80,.08)' : 'var(--cyan)',
                borderRadius: 10, padding: '14px 18px', touchAction: 'manipulation',
                opacity: (phase === 'opening' || phase === 'sending' || phase === 'playing') ? 0.6 : 1,
              }}
            >
              🎙️ {label}
            </button>
            {/* Always-available exit from an unresolved session. `reset()`
                releases any live mic stream/recorder first — tapping this
                mid-recording must not strand the microphone. Reports turns: 0
                so the wrapper's `meta.turns > 0` guard skips logging a
                phantom visit. */}
            <button
              onClick={() => { reset(); onDone(false, { turns: 0, openingCrisis: '' }) }}
              style={{ ...ghostBtn, marginTop: 10 }}
            >
              {t('voice.back')}
            </button>
          </>
        )}

        {outcome && outcome !== 'continue' && (
          <>
            <Feedback ok={outcome === 'won'} title={outcome === 'won' ? t('voice.won') : t('voice.escalated')} body="" />
            <div style={{ marginTop: 14 }}>
              <button
                onClick={() => onDone(outcome === 'won', { turns: turnCount, openingCrisis: openingText })}
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
