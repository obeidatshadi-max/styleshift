'use client'
import { useState } from 'react'
import { useT } from '@/lib/i18n'
import { useRoleplayRecorder } from '@/hooks/useRoleplayRecorder'

interface Props { doctorId: string | null; onDone: () => void }

export default function RoleplayRecorder({ doctorId, onDone }: Props) {
  const t = useT()
  const { phase, error, elapsedSec, speakerPreviews, result, start, stop, pickSpeaker, reset } = useRoleplayRecorder(doctorId)
  const [consentChecked, setConsentChecked] = useState(false)
  const [consented, setConsented] = useState(false)

  const card: React.CSSProperties = {
    width: '100%', maxWidth: 480,
    background: 'linear-gradient(180deg,var(--panel),#0a1430)',
    border: '1px solid var(--line)', borderRadius: 18,
    padding: '18px 20px 20px', boxShadow: '0 16px 50px rgba(0,0,0,.55)',
  }
  const wrap: React.CSSProperties = { position: 'relative', zIndex: 1, minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
  const eyebrow = (text: string) => (
    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.4em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 10 }}>{text}</div>
  )
  const btnPrimary: React.CSSProperties = {
    width: '100%', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12,
    letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)',
    color: '#04121c', background: 'var(--cyan)', borderRadius: 10, padding: '12px 18px',
    boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation',
  }
  const btnGhost: React.CSSProperties = {
    width: '100%', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12,
    letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--line)',
    color: 'var(--ink-dim)', background: 'transparent', borderRadius: 10, padding: '12px 18px',
    touchAction: 'manipulation', marginTop: 10,
  }

  if (!consented) {
    return (
      <div style={wrap}>
        <div style={card}>
          {eyebrow(t('roleplay.consentTitle'))}
          <p style={{ color: 'var(--ink-dim)', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>{t('roleplay.consentBody')}</p>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.5, marginBottom: 18, cursor: 'pointer' }}>
            <input type="checkbox" checked={consentChecked} onChange={e => setConsentChecked(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--cyan)' }} />
            {t('roleplay.consentCheckbox')}
          </label>
          <button style={{ ...btnPrimary, opacity: consentChecked ? 1 : 0.5, cursor: consentChecked ? 'pointer' : 'not-allowed' }}
            disabled={!consentChecked}
            onClick={() => { setConsented(true); start() }}>
            {t('roleplay.consentAgree')}
          </button>
          <button style={btnGhost} onClick={onDone}>{t('roleplay.consentCancel')}</button>
        </div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div style={wrap}>
        <div style={card}>
          {eyebrow(t('roleplay.title'))}
          <p style={{ color: 'var(--red)', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
            {error === 'mic' ? t('roleplay.errorMic') : t('roleplay.errorDiarize')}
          </p>
          <button style={btnPrimary} onClick={() => { reset(); setConsented(false); setConsentChecked(false) }}>{t('roleplay.done')}</button>
        </div>
      </div>
    )
  }

  if (phase === 'recording') {
    return (
      <div style={wrap}>
        <div style={card}>
          {eyebrow(t('roleplay.recording'))}
          <div style={{ fontFamily: 'var(--mono)', fontSize: 44, fontWeight: 700, color: 'var(--red)', textAlign: 'center', margin: '10px 0 20px' }}>
            {String(Math.floor(elapsedSec / 60)).padStart(2, '0')}:{String(elapsedSec % 60).padStart(2, '0')}
          </div>
          <button style={{ ...btnPrimary, borderColor: 'var(--red)', background: 'var(--red)', boxShadow: 'none' }} onClick={stop}>{t('roleplay.stop')}</button>
        </div>
      </div>
    )
  }

  if (phase === 'processing') {
    return (
      <div style={wrap}>
        <div style={card}>
          {eyebrow(t('roleplay.processing'))}
          <p style={{ color: 'var(--ink-dim)', fontSize: 13.5 }}>…</p>
        </div>
      </div>
    )
  }

  if (phase === 'pick-speaker') {
    return (
      <div style={wrap}>
        <div style={card}>
          {eyebrow(t('roleplay.pickSpeakerTitle'))}
          <p style={{ color: 'var(--ink-dim)', fontSize: 13.5, marginBottom: 14 }}>{t('roleplay.pickSpeakerHint')}</p>
          {speakerPreviews.map(p => (
            <button key={p.speaker} onClick={() => pickSpeaker(p.speaker)}
              style={{ display: 'block', width: '100%', textAlign: 'start', cursor: 'pointer', color: 'var(--ink)', fontFamily: 'var(--sans)', fontSize: 13.5, lineHeight: 1.4, border: '1px solid var(--line)', borderRadius: 12, padding: '13px 14px', background: 'rgba(0,0,0,.18)', marginBottom: 10, touchAction: 'manipulation' }}>
              <b style={{ color: 'var(--cyan)', display: 'block', fontFamily: 'var(--mono)', fontSize: 11, marginBottom: 4 }}>
                {t('roleplay.speakerLabel', { letter: p.speaker })}
              </b>
              &ldquo;{p.sample}&rdquo;
            </button>
          ))}
        </div>
      </div>
    )
  }

  // phase === 'done'
  const r = result!
  const talkPct = Math.round(r.talkRatio.repRatio * 100)
  const questionPct = Math.round(r.questionRatio * 100)
  const openQuestionPct = Math.round(r.openQuestionRatio * 100)
  const paraphrasePct = Math.round(r.paraphraseScore * 100)

  return (
    <div style={wrap}>
      <div style={{ ...card, maxWidth: 520 }}>
        {eyebrow(t('roleplay.resultEyebrow'))}
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>{t('roleplay.resultTitle')}</h2>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
            <span>{t('roleplay.talkRatio')}</span><span style={{ fontFamily: 'var(--mono)' }}>{talkPct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${talkPct}%`, background: 'var(--cyan)' }} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
            <span>{t('roleplay.questionRatio')}</span><span style={{ fontFamily: 'var(--mono)' }}>{questionPct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${questionPct}%`, background: 'var(--green)' }} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
            <span>{t('roleplay.openQuestionRatio')}</span><span style={{ fontFamily: 'var(--mono)' }}>{openQuestionPct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${openQuestionPct}%`, background: 'var(--purple)' }} />
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--ink-dim)', lineHeight: 1.5, marginTop: 5 }}>{t('roleplay.openQuestionHint')}</p>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
            <span>{t('roleplay.paraphraseScore')}</span><span style={{ fontFamily: 'var(--mono)' }}>{paraphrasePct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${paraphrasePct}%`, background: 'var(--amber)' }} />
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--ink-dim)', lineHeight: 1.5, marginTop: 5 }}>{t('roleplay.paraphraseHint')}</p>
        </div>

        <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '13px 14px', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
            <span>{t('roleplay.activeListeningTitle')}</span>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>
              {r.activeListening.score} � {t(`roleplay.activeListening.${r.activeListening.label}`)}
            </span>
          </div>
        </div>

        <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '13px 14px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
            <span>{t('roleplay.rapidSwitches')}</span>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{r.rapidTurnSwitches}</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink-dim)', lineHeight: 1.5, marginTop: 6 }}>{t('roleplay.rapidSwitchesHint')}</p>
        </div>

        <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '13px 14px', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 6 }}>{t('roleplay.styleReadTitle')}</div>
          {r.repRead
            ? <div style={{ fontSize: 14 }}>{r.repRead.style} · {r.repRead.confidence}%</div>
            : <p style={{ fontSize: 13, color: 'var(--ink-dim)', lineHeight: 1.5 }}>{t('roleplay.noStyleRead')}</p>}
        </div>

        <button style={btnPrimary} onClick={onDone}>{t('roleplay.done')}</button>
      </div>
    </div>
  )
}
