// src/components/game/VoicePartnerLive.tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import PracticeReport from './PracticeReport'
import { useT, useLang } from '@/lib/i18n'
import type { Doctor } from '@/types/game'
import { useVoiceLive } from '@/hooks/useVoiceLive'
import {
  LIVE_DIFFICULTY_LEVELS, DEFAULT_LIVE_DIFFICULTY, persistableDifficulty,
  type LiveDifficulty, type LiveTranscriptTurn,
} from '@/lib/voice-live-core'
import { XP_VALUES } from '@/lib/game-data'
import { createClient } from '@/lib/supabase-browser'

export type LivePracticeOutcome = 'won' | 'escalated' | 'unscored' | 'interrupted'

interface Props {
  doctor: Doctor
  onDone: (outcome: LivePracticeOutcome, meta: { turns: number; openingCrisis: string }) => void
}

const primaryBtn: React.CSSProperties = { width: '100%', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 'max(12px, var(--voice-min-font, 0px))', letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: '#04121c', background: 'var(--cyan)', borderRadius: 10, padding: '12px 18px', boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation' }
const ghostBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 'max(12px, var(--voice-min-font, 0px))', letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'transparent', borderRadius: 10, padding: '12px 18px', touchAction: 'manipulation' }
const difficultyChip = (active: boolean): React.CSSProperties => ({
  cursor: 'pointer', textAlign: 'start', fontFamily: 'var(--sans)', fontSize: 'max(12.5px, var(--voice-min-font, 0px))', lineHeight: 1.4, borderRadius: 10, padding: '9px 12px',
  border: `1px solid ${active ? 'var(--cyan)' : 'var(--line)'}`, color: active ? 'var(--cyan)' : 'var(--ink-dim)',
  background: active ? 'rgba(56,214,255,.1)' : 'transparent', touchAction: 'manipulation', width: '100%',
})

/** What the parent needs to log a visit for this call, derived from whatever
 * transcript the call actually produced. Used by both the normal end-of-call
 * path and the error screen — an errored call that already had real content
 * must not be reported as `turns: 0`. */
function transcriptMeta(transcript: LiveTranscriptTurn[]): { turns: number; openingCrisis: string } {
  return {
    turns: transcript.filter(entry => entry.role === 'rep').length,
    openingCrisis: transcript.find(entry => entry.role === 'doctor')?.text ?? '',
  }
}

export default function VoicePartnerLive({ doctor, onDone }: Props) {
  const t = useT()
  const { lang } = useLang()
  const { state, errorKind, transcript, activity, muted, toggleMute, connect, disconnect } = useVoiceLive(doctor.id, lang)
  const [consentChecked, setConsentChecked] = useState(false)
  const [consented, setConsented] = useState(false)
  const [difficulty, setDifficulty] = useState<LiveDifficulty>(DEFAULT_LIVE_DIFFICULTY)
  const [scoring, setScoring] = useState(false)
  const [result, setResult] = useState<{ outcome: LivePracticeOutcome; meta: ReturnType<typeof transcriptMeta>; sessionId?: string; saved?: boolean } | null>(null)
  const finishing = useRef(false)
  const [elapsed, setElapsed] = useState(0)
  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (state !== 'live') return
    const began = Date.now()
    setElapsed(0)
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - began) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [state])
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [transcript])

  // Same inline pattern as useVoicePartner.ts's awardXpOnWin (not exported
  // there, and only that one of the 5 turn-based modes awards XP directly —
  // duplicated here rather than extracted, matching the codebase's existing
  // choice not to share it across modes).
  const awardXpOnWin = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile, error: profileError } = await supabase.from('profiles').select('xp').eq('id', user.id).single()
    if (profileError || !profile) return
    const { error: xpError } = await supabase.from('profiles').update({ xp: profile.xp + XP_VALUES.voicePartnerWin }).eq('id', user.id)
    if (xpError) console.error('voice partner live xp update failed:', xpError.message)
  }

  const finishCall = async () => {
    if (finishing.current) return
    finishing.current = true
    setScoring(true)
    const captured = await disconnect()
    const meta = transcriptMeta(captured)
    if (meta.turns === 0) {
      setResult({ outcome: 'unscored', meta }); setScoring(false); return
    }
    const sessionId = crypto.randomUUID()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000)
    try {
      const res = await fetch('/api/voice-partner/live-judge', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ doctorId: doctor.id, difficulty, lang, sessionId, transcript: captured }),
      })
      if (!res.ok) throw new Error('not_scored')
      const data = await res.json()
      if (data.scored === false || !data.objectionType || !['won', 'escalated'].includes(data.outcome) || !Array.isArray(data.clearSteps) || typeof data.turnCount !== 'number') throw new Error('not_scored')
      const saved = await fetch('/api/voice-partner/session-result', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ doctorId: doctor.id, sessionId, objectionType: data.objectionType,
          outcome: data.outcome, clearSteps: data.clearSteps, turnCount: data.turnCount,
          difficulty: persistableDifficulty(difficulty) }),
      }).then(r => r.ok).catch(() => false)
      setResult({ outcome: data.outcome, meta, sessionId, saved })
      if (saved && data.outcome === 'won') void awardXpOnWin().catch(() => {})
    } catch { setResult({ outcome: 'unscored', meta }) }
    finally { clearTimeout(timeout); setScoring(false) }
  }

  if (!consented) {
    return (
      <div className="voice-practice" style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14 }}>
        <div style={{ background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,.45)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 'max(11px, var(--voice-min-font, 0px))', letterSpacing: '.4em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 10 }}>{t('voiceLive.consentTitle')}</div>
          <p style={{ color: 'var(--ink-dim)', fontSize: 'max(14px, var(--voice-min-font, 0px))', lineHeight: 1.6, marginBottom: 16 }}>{t('voiceLive.consentBody')}</p>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 'max(13.5px, var(--voice-min-font, 0px))', lineHeight: 1.5, marginBottom: 18, cursor: 'pointer' }}>
            <input type="checkbox" checked={consentChecked} onChange={e => setConsentChecked(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--cyan)' }} />
            {t('voiceLive.consentCheckbox')}
          </label>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 'max(10px, var(--voice-min-font, 0px))', letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 8 }}>{t('voiceLive.difficultyTitle')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {LIVE_DIFFICULTY_LEVELS.map(level => (
                <button key={level} onClick={() => setDifficulty(level)} style={difficultyChip(difficulty === level)}>
                  {t(`voice.difficulty.${level}`)}
                </button>
              ))}
            </div>
          </div>
          <button style={{ ...primaryBtn, opacity: consentChecked ? 1 : 0.5, cursor: consentChecked ? 'pointer' : 'not-allowed' }}
            disabled={!consentChecked} onClick={() => { setConsented(true); void connect(difficulty) }}>
            {t('voiceLive.consentAgree')}
          </button>
          <button style={{ ...ghostBtn, width: '100%', marginTop: 10 }} onClick={() => onDone('unscored', { turns: 0, openingCrisis: '' })}>
            {t('voiceLive.consentCancel')}
          </button>
        </div>
      </div>
    )
  }

  if (state === 'notconfigured') {
    return (
      <div className="voice-practice" style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14 }}>
        <div style={{ display: 'inline-block', fontFamily: 'var(--mono)', fontSize: 'max(10px, var(--voice-min-font, 0px))', letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--purple)', border: '1px solid var(--purple)', borderRadius: 20, padding: '4px 11px', marginBottom: 14, background: 'rgba(176,108,255,.08)' }}>{t('voiceLive.premium')}</div>
        <div style={{ fontSize: 'max(14.5px, var(--voice-min-font, 0px))', lineHeight: 1.6, color: 'var(--ink)', marginBottom: 10 }}>{t('voiceLive.teaser', { name: doctor.name })}</div>
        <div style={{ fontSize: 'max(13px, var(--voice-min-font, 0px))', lineHeight: 1.6, color: 'var(--ink-dim)', marginBottom: 14 }}>{t('voiceLive.notConfigured')}</div>
        <button onClick={() => onDone('unscored', { turns: 0, openingCrisis: '' })} style={ghostBtn}>{t('voiceLive.back')}</button>
      </div>
    )
  }

  if (result) {
    return <div className="voice-practice" style={{ maxWidth: 560, margin: '0 auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2>{t(`practice.outcome.${result.outcome}`)}</h2>
      {result.outcome === 'unscored' && <p role="status">{t(result.meta.turns ? 'practice.unscored' : 'practice.noTurns')}</p>}
      {result.saved === false && <p role="alert">{t('practice.unsaved')}</p>}
      {result.sessionId && <PracticeReport sessionId={result.sessionId} />}
      <button style={primaryBtn} onClick={() => onDone(result.outcome, result.meta)}>{t('practice.finish')}</button>
    </div>
  }
  if (scoring) return <div className="voice-practice" style={{ padding: 24 }}>
    <p role="status">{t('voiceLive.scoring')}</p>
  </div>
  if (state === 'error') return <div className="voice-practice" style={{ maxWidth: 560, margin: '0 auto', padding: 14 }}>
    <p role="alert">{errorKind === 'mic' ? t('voiceLive.errorMic') : t('voiceLive.errorNetwork')}</p>
    <p>{t('practice.interrupted')}</p>
    <button onClick={() => onDone('interrupted', transcriptMeta(transcript))} style={ghostBtn}>{t('practice.finish')}</button>
  </div>
  const time = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`
  return <div className="voice-practice" style={{ maxWidth: 560, margin: '0 auto', padding: 14 }}>
    <h2>{doctor.name}</h2>
    <p role="status" aria-live="polite">{t(state === 'connecting' ? 'voiceLive.connecting' : muted ? 'practice.muted' : `practice.${activity}`)}</p>
    {state === 'live' && <>
      <p>{t('practice.elapsed', { time })}</p>
      <button style={ghostBtn} onClick={toggleMute} aria-pressed={muted}>{t(muted ? 'practice.unmute' : 'practice.mute')}</button>
      <h3>{t('practice.transcript')}</h3>
      <div ref={logRef} role="log" aria-live="polite" style={{ maxHeight: 320, overflowY: 'auto', margin: '14px 0', lineHeight: 1.6 }}>
        {!transcript.length && <p>{t('practice.transcriptHint')}</p>}
        {transcript.map((turn, index) => <p key={index} dir="auto"><strong>{t(turn.role === 'rep' ? 'sim.you' : 'sim.doctor')}: </strong>{turn.text}</p>)}
      </div>
      <button style={primaryBtn} onClick={() => void finishCall()}>{t('voiceLive.endCall')}</button>
    </>}
    {state === 'connecting' && <button style={ghostBtn} onClick={() => { void disconnect(); onDone('unscored', { turns: 0, openingCrisis: '' }) }}>{t('practice.cancel')}</button>}
  </div>
}
