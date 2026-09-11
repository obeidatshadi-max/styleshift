'use client'
import { useEffect, useState } from 'react'
import { useT, useLang, useGameData } from '@/lib/i18n'
import type { Doctor } from '@/types/game'
import { useVoicePartner } from '@/hooks/useVoicePartner'
import { useSessionAnalysis } from '@/hooks/useSessionAnalysis'
import { TURN_CAP, CLEAR_STEPS, DIFFICULTY_LEVELS, DEFAULT_DIFFICULTY, type Difficulty } from '@/lib/voice-partner-core'
import { COMPETENCY_DIMENSIONS } from '@/lib/session-evaluator'
import { Feedback, RecordReviewControls, VoiceStatusAnnouncer } from './helpers'

interface Props {
  doctor: Doctor
  onDone: (won: boolean, meta: { turns: number; openingCrisis: string }) => void
}

const COLOR: Record<string, string> = { driver: 'var(--purple)', expressive: 'var(--green)', amiable: 'var(--pink)', analytical: 'var(--cyan)' }

const primaryBtn: React.CSSProperties = { width: '100%', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: '#04121c', background: 'var(--cyan)', borderRadius: 10, padding: '12px 18px', boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation' }
const ghostBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'transparent', borderRadius: 10, padding: '12px 18px', touchAction: 'manipulation' }
const difficultyChip = (active: boolean): React.CSSProperties => ({
  cursor: 'pointer', textAlign: 'start', fontFamily: 'var(--sans)', fontSize: 12.5, lineHeight: 1.4, borderRadius: 10, padding: '9px 12px',
  border: `1px solid ${active ? 'var(--cyan)' : 'var(--line)'}`, color: active ? 'var(--cyan)' : 'var(--ink-dim)',
  background: active ? 'rgba(56,214,255,.1)' : 'transparent', touchAction: 'manipulation', width: '100%',
})

export default function VoicePartner({ doctor, onDone }: Props) {
  const t = useT()
  const { lang } = useLang()
  const { STYLES } = useGameData()
  const { phase, errorKind, transcript, turnCount, outcome, openingText, objectionType, clearStepsHit, previewUrl, sessionId, startVoicePartner, startRecording, stopRecording, confirmRecording, rerecord, reset } = useVoicePartner(doctor.id, lang)
  const { status: analysisStatus, data: analysis, fetchAnalysis } = useSessionAnalysis()
  const [consentChecked, setConsentChecked] = useState(false)
  const [consented, setConsented] = useState(false)
  // Defaults to 'realistic' so a rep who never touches this picker gets
  // today's exact unchanged behavior — the picker is optional polish, not a
  // forced extra step for returning users' muscle memory.
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY)

  useEffect(() => { if (consented) void startVoicePartner(difficulty) }, [consented, startVoicePartner, difficulty])

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
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 8 }}>{t('voice.difficultyTitle')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {DIFFICULTY_LEVELS.map(level => (
                <button key={level} onClick={() => setDifficulty(level)} style={difficultyChip(difficulty === level)}>
                  {t(`voice.difficulty.${level}`)}
                </button>
              ))}
            </div>
          </div>
          <button
            style={{ ...primaryBtn, opacity: consentChecked ? 1 : 0.5, cursor: consentChecked ? 'pointer' : 'not-allowed' }}
            disabled={!consentChecked}
            onClick={() => setConsented(true)}
          >
            {t('voice.consentAgree')}
          </button>
          <button style={{ ...ghostBtn, width: '100%', marginTop: 10 }} onClick={() => onDone(false, { turns: 0, openingCrisis: '' })}>
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
        <div style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink)', marginBottom: 10 }}>{t('voice.teaser', { name: doctor.name })}</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-dim)', marginBottom: 14 }}>{t('voice.notConfigured')}</div>
        <button onClick={() => onDone(false, { turns: 0, openingCrisis: '' })} style={ghostBtn}>{t('voice.back')}</button>
      </div>
    )
  }

  const errorLabel =
    errorKind === 'mic' ? t('voice.errorMic') :
    errorKind === 'network' ? t('voice.errorNetwork') :
    errorKind === 'api' ? t('voice.errorApi') :
    errorKind === 'bad_response' ? t('voice.errorBadResponse') :
    t('voice.error')

  const label =
    phase === 'opening' ? t('voice.connecting') :
    phase === 'recording' ? t('voice.listening') :
    phase === 'sending' ? t('voice.thinking') :
    phase === 'playing' ? t('voice.speaking') :
    phase === 'ratelimited' ? t('voice.rateLimited') :
    phase === 'error' ? errorLabel :
    t('voice.tapToSpeak')

  const clearSummaryHtml = objectionType
    ? `<div>${t('voice.objectionFaced', { type: t(`voice.objType.${objectionType}`) })}</div>` +
      `<ul style="margin:8px 0 0;padding-inline-start:18px;list-style:none">` +
      CLEAR_STEPS.map(step => `<li>${clearStepsHit.includes(step) ? '✓' : '—'} ${t(`voice.clear.${step}`)}</li>`).join('') +
      `</ul>`
    : ''

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
            <div key={i} aria-label={`${turn.role === 'doctor' ? t('voice.speakerDoctor') : t('voice.speakerYou')}: ${turn.text}`} style={{
              alignSelf: turn.role === 'doctor' ? 'flex-start' : 'flex-end',
              maxWidth: '85%', borderRadius: 12, padding: '9px 12px', fontSize: 13.5, lineHeight: 1.5,
              background: turn.role === 'doctor' ? 'rgba(0,0,0,.25)' : 'rgba(62,224,143,.1)',
              border: `1px solid ${turn.role === 'doctor' ? 'var(--line)' : 'var(--green)'}`,
            }}>
              <span aria-hidden="true" style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 2 }}>
                {turn.role === 'doctor' ? t('voice.speakerDoctor') : t('voice.speakerYou')}
              </span>
              {turn.text}
            </div>
          ))}
        </div>

        {!outcome && phase === 'review' && previewUrl && (
          <RecordReviewControls previewUrl={previewUrl} onConfirm={confirmRecording} onRerecord={rerecord} />
        )}

        {!outcome && phase !== 'review' && (
          <>
            <VoiceStatusAnnouncer text={label} />
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
            <Feedback ok={outcome === 'won'} title={outcome === 'won' ? t('voice.won') : t('voice.escalated')} body={clearSummaryHtml} />

            {sessionId && analysisStatus === 'idle' && (
              <button onClick={() => fetchAnalysis(sessionId, lang)} style={{ ...ghostBtn, width: '100%', marginTop: 10 }}>
                {t('voice.deepAnalysis.button')}
              </button>
            )}
            {analysisStatus === 'loading' && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink-dim)', fontFamily: 'var(--mono)' }}>{t('voice.deepAnalysis.loading')}</div>
            )}
            {(analysisStatus === 'error' || analysisStatus === 'ratelimited' || analysisStatus === 'notconfigured') && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink-dim)' }}>{t('voice.deepAnalysis.error')}</div>
            )}
            {analysisStatus === 'ready' && analysis && (
              <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 8 }}>
                  {t('voice.deepAnalysis.scorecardTitle')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                  {COMPETENCY_DIMENSIONS.map(dim => {
                    const c = analysis.competencies[dim]
                    return (
                      <div key={dim} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                        <span style={{ color: 'var(--ink-dim)' }}>{t(`voice.competency.${dim}`)}</span>
                        <span style={{ fontFamily: 'var(--mono)', color: c.score == null ? 'var(--ink-dim)' : 'var(--cyan)' }}>
                          {c.score == null ? t('voice.deepAnalysis.insufficientData') : `${c.score}`}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {analysis.criticalMoments.length > 0 && (
                  <>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 8 }}>
                      {t('voice.deepAnalysis.momentsTitle')}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {analysis.criticalMoments.map(m => (
                        <div key={m.turnIndex} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.5 }}>
                          <div style={{ fontStyle: 'italic', color: 'var(--ink)', marginBottom: 4 }}>
                            {m.role === 'doctor' ? t('voice.speakerDoctor') : t('voice.speakerYou')}: &ldquo;{m.quote}&rdquo;
                          </div>
                          <div style={{ color: 'var(--ink-dim)' }}>{t('voice.deepAnalysis.observed')}: {m.observedBehavior}</div>
                          {m.missedOpportunity && <div style={{ color: 'var(--ink-dim)' }}>{t('voice.deepAnalysis.missed')}: {m.missedOpportunity}</div>}
                          {m.alternative && <div style={{ color: 'var(--ink-dim)' }}>{t('voice.deepAnalysis.alternative')}: {m.alternative}</div>}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

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
