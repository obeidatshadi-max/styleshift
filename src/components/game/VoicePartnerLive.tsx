// src/components/game/VoicePartnerLive.tsx
'use client'
import { useState } from 'react'
import { useT, useLang } from '@/lib/i18n'
import type { Doctor } from '@/types/game'
import { useVoiceLive } from '@/hooks/useVoiceLive'
import {
  LIVE_DIFFICULTY_LEVELS, DEFAULT_LIVE_DIFFICULTY, persistableDifficulty,
  type LiveDifficulty, type LiveTranscriptTurn,
} from '@/lib/voice-live-core'
import { XP_VALUES } from '@/lib/game-data'
import { createClient } from '@/lib/supabase-browser'

interface Props {
  doctor: Doctor
  onDone: (won: boolean, meta: { turns: number; openingCrisis: string }) => void
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
  const { state, errorKind, transcript, connect, disconnect } = useVoiceLive(doctor.id, lang)
  const [consentChecked, setConsentChecked] = useState(false)
  const [consented, setConsented] = useState(false)
  const [difficulty, setDifficulty] = useState<LiveDifficulty>(DEFAULT_LIVE_DIFFICULTY)
  const [scoring, setScoring] = useState(false)
  // Holds the meta for the deferred `onDone` while the unscored notice is on
  // screen — non-null means "show the notice and wait for the rep to tap
  // Continue", rather than navigating away before it can ever render.
  const [unscored, setUnscored] = useState<{ turns: number; openingCrisis: string } | null>(null)

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
    const meta = transcriptMeta(transcript)
    if (meta.turns === 0) { setScoring(false); onDone(false, meta); return }
    // One id minted here and sent to BOTH routes, so `live-judge`'s
    // `conversation_turns` backfill and `session-result`'s
    // `voice_partner_sessions` row share a `session_id`. Without it each
    // route generated its own and `session-analysis` (Deep Analysis,
    // Pressure Shift, Behavioral Gravity — all keyed by session_id) found
    // zero turns and 404'd for every live session.
    const sessionId = crypto.randomUUID()
    try {
      let res: Response
      try {
        res = await fetch('/api/voice-partner/live-judge', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ doctorId: doctor.id, difficulty, lang, sessionId, transcript }),
        })
      } catch {
        // Network-level failure (dropped connection, DNS, etc.) — fetch()
        // itself rejected before any response was received. Treat this the
        // same as a judge call that completed but couldn't be scored,
        // rather than letting the exception escape uncaught: an uncaught
        // rejection here would skip onDone entirely and strand the user on
        // a dead-end screen (state stays 'ended', which no render branch
        // explicitly handles).
        setUnscored(meta)
        return
      }
      // A 400/404/429/503 body is an `{ error }` shape, never a judged
      // result — parsing it as one would silently read every field as
      // undefined and fall through to the "nothing saved, no notice" path.
      // Same handling as the explicit `scored: false` case.
      if (!res.ok) { setUnscored(meta); return }
      const data = await res.json().catch(() => null) as { objectionType?: string; outcome?: 'won' | 'escalated'; clearSteps?: string[]; turnCount?: number; scored?: boolean } | null
      if (data?.scored === false) { setUnscored(meta); return }
      if (data?.objectionType && data.outcome && data.clearSteps && typeof data.turnCount === 'number') {
        const persisted = persistableDifficulty(difficulty)
        const saved = await fetch('/api/voice-partner/session-result', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            doctorId: doctor.id, sessionId,
            objectionType: data.objectionType, outcome: data.outcome,
            clearSteps: data.clearSteps, turnCount: data.turnCount,
            ...(persisted ? { difficulty: persisted } : {}),
          }),
        }).then(r => r.ok).catch(() => false)
        // XP only for a session that actually persisted — otherwise the
        // profile's xp and the saved session history diverge permanently.
        // The call still happened, so the rep is still handed back to the
        // result screen with the real outcome either way.
        if (saved && data.outcome === 'won') await awardXpOnWin()
        onDone(data.outcome === 'won', meta)
        return
      }
      onDone(false, meta)
    } finally {
      setScoring(false)
    }
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
          <button style={{ ...ghostBtn, width: '100%', marginTop: 10 }} onClick={() => onDone(false, { turns: 0, openingCrisis: '' })}>
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
        <button onClick={() => onDone(false, { turns: 0, openingCrisis: '' })} style={ghostBtn}>{t('voiceLive.back')}</button>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="voice-practice" style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14, textAlign: 'center' }}>
        <p style={{ color: 'var(--ink-dim)', fontSize: 'max(14px, var(--voice-min-font, 0px))', marginBottom: 16 }}>{errorKind === 'mic' ? t('voiceLive.errorMic') : t('voiceLive.errorNetwork')}</p>
        {/* Report whatever the call really produced before it errored — a
            mid-call failure after several real exchanges is still a visit
            worth logging, and hardcoding turns: 0 threw that away. */}
        <button onClick={() => onDone(false, transcriptMeta(transcript))} style={ghostBtn}>{t('voiceLive.back')}</button>
      </div>
    )
  }

  // Rendered instead of navigating straight out, so the notice is actually
  // reachable: every setUnscored used to be followed immediately by onDone,
  // which unmounted this component before any re-render could show it.
  if (unscored) {
    return (
      <div className="voice-practice" style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14, textAlign: 'center' }}>
        <p style={{ color: 'var(--ink-dim)', fontSize: 'max(14px, var(--voice-min-font, 0px))', lineHeight: 1.6, marginBottom: 20 }}>{t('voiceLive.unscoredNotice')}</p>
        <button onClick={() => onDone(false, unscored)} style={{ ...primaryBtn, maxWidth: 280, margin: '0 auto' }}>{t('voiceLive.continue')}</button>
      </div>
    )
  }

  if (scoring) {
    return <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-dim)', fontSize: 'max(14px, var(--voice-min-font, 0px))' }}>{t('voiceLive.scoring')}</div>
  }

  return (
    <div className="voice-practice" style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14, textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 'max(11px, var(--voice-min-font, 0px))', letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 20 }}>
        {state === 'connecting' ? t('voiceLive.connecting') : t('voiceLive.live')}
      </div>
      {state === 'live' && (
        <button onClick={() => void finishCall()} style={{ ...primaryBtn, maxWidth: 280 }}>{t('voiceLive.endCall')}</button>
      )}
    </div>
  )
}
