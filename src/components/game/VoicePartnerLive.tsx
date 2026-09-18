// src/components/game/VoicePartnerLive.tsx
'use client'
import { useState } from 'react'
import { useT } from '@/lib/i18n'
import type { Doctor } from '@/types/game'
import { useVoiceLive } from '@/hooks/useVoiceLive'
import { DIFFICULTY_LEVELS, DEFAULT_DIFFICULTY, type Difficulty } from '@/lib/voice-partner-core'
import { XP_VALUES } from '@/lib/game-data'
import { createClient } from '@/lib/supabase-browser'

interface Props {
  doctor: Doctor
  onDone: (won: boolean, meta: { turns: number; openingCrisis: string }) => void
}

const primaryBtn: React.CSSProperties = { width: '100%', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: '#04121c', background: 'var(--cyan)', borderRadius: 10, padding: '12px 18px', boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation' }
const ghostBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'transparent', borderRadius: 10, padding: '12px 18px', touchAction: 'manipulation' }
const difficultyChip = (active: boolean): React.CSSProperties => ({
  cursor: 'pointer', textAlign: 'start', fontFamily: 'var(--sans)', fontSize: 12.5, lineHeight: 1.4, borderRadius: 10, padding: '9px 12px',
  border: `1px solid ${active ? 'var(--cyan)' : 'var(--line)'}`, color: active ? 'var(--cyan)' : 'var(--ink-dim)',
  background: active ? 'rgba(56,214,255,.1)' : 'transparent', touchAction: 'manipulation', width: '100%',
})

export default function VoicePartnerLive({ doctor, onDone }: Props) {
  const t = useT()
  const { state, errorKind, transcript, connect, disconnect } = useVoiceLive(doctor.id, 'en')
  const [consentChecked, setConsentChecked] = useState(false)
  const [consented, setConsented] = useState(false)
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY)
  const [scoring, setScoring] = useState(false)
  const [unscored, setUnscored] = useState(false)

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
    await disconnect()
    setScoring(true)
    const turns = transcript.filter(entry => entry.role === 'rep').length
    if (turns === 0) { setScoring(false); onDone(false, { turns: 0, openingCrisis: '' }); return }
    try {
      const res = await fetch('/api/voice-partner/live-judge', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doctorId: doctor.id, difficulty, transcript }),
      })
      const data = await res.json().catch(() => null) as { objectionType?: string; outcome?: 'won' | 'escalated'; clearSteps?: string[]; turnCount?: number; scored?: boolean } | null
      const openingCrisis = transcript.find(entry => entry.role === 'doctor')?.text ?? ''
      if (data?.scored === false) {
        setUnscored(true)
        onDone(false, { turns, openingCrisis })
        return
      }
      if (data?.objectionType && data.outcome && data.clearSteps && typeof data.turnCount === 'number') {
        await fetch('/api/voice-partner/session-result', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ doctorId: doctor.id, objectionType: data.objectionType, outcome: data.outcome, clearSteps: data.clearSteps, turnCount: data.turnCount, difficulty }),
        }).catch(() => {})
        if (data.outcome === 'won') await awardXpOnWin()
        onDone(data.outcome === 'won', { turns, openingCrisis })
        return
      }
      onDone(false, { turns, openingCrisis })
    } finally {
      setScoring(false)
    }
  }

  if (!consented) {
    return (
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14 }}>
        <div style={{ background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,.45)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.4em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 10 }}>{t('voiceLive.consentTitle')}</div>
          <p style={{ color: 'var(--ink-dim)', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>{t('voiceLive.consentBody')}</p>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.5, marginBottom: 18, cursor: 'pointer' }}>
            <input type="checkbox" checked={consentChecked} onChange={e => setConsentChecked(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--cyan)' }} />
            {t('voiceLive.consentCheckbox')}
          </label>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 8 }}>{t('voiceLive.difficultyTitle')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {DIFFICULTY_LEVELS.map(level => (
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
          <button style={{ ...ghostBtn, width: '100%', marginTop: 10 }} onClick={() => onDone(false, { turns: 0, openingCrisis: '' })}>
            {t('voiceLive.consentCancel')}
          </button>
        </div>
      </div>
    )
  }

  if (state === 'notconfigured') {
    return (
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14 }}>
        <div style={{ display: 'inline-block', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--purple)', border: '1px solid var(--purple)', borderRadius: 20, padding: '4px 11px', marginBottom: 14, background: 'rgba(176,108,255,.08)' }}>{t('voiceLive.premium')}</div>
        <div style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink)', marginBottom: 10 }}>{t('voiceLive.teaser', { name: doctor.name })}</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-dim)', marginBottom: 14 }}>{t('voiceLive.notConfigured')}</div>
        <button onClick={() => onDone(false, { turns: 0, openingCrisis: '' })} style={ghostBtn}>{t('voiceLive.back')}</button>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14, textAlign: 'center' }}>
        <p style={{ color: 'var(--ink-dim)', fontSize: 14, marginBottom: 16 }}>{errorKind === 'mic' ? t('voiceLive.errorMic') : t('voiceLive.errorNetwork')}</p>
        <button onClick={() => onDone(false, { turns: 0, openingCrisis: '' })} style={ghostBtn}>{t('voiceLive.back')}</button>
      </div>
    )
  }

  if (scoring) {
    return <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-dim)', fontSize: 14 }}>{t('voiceLive.scoring')}</div>
  }

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14, textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 20 }}>
        {state === 'connecting' ? t('voiceLive.connecting') : t('voiceLive.live')}
      </div>
      {unscored && <p style={{ color: 'var(--ink-dim)', fontSize: 13, marginBottom: 16 }}>{t('voiceLive.unscoredNotice')}</p>}
      {state === 'live' && (
        <button onClick={() => void finishCall()} style={{ ...primaryBtn, maxWidth: 280 }}>{t('voiceLive.endCall')}</button>
      )}
    </div>
  )
}
