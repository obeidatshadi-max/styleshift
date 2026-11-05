'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useT } from '@/lib/i18n'

const inputStyle: React.CSSProperties = {
  background: 'var(--surface-subtle)', border: '1px solid var(--line)', borderRadius: 10,
  padding: '12px 14px', color: 'var(--ink)', fontFamily: 'var(--sans)', fontSize: 16, outline: 'none', width: '100%',
}
const btnPrimary: React.CSSProperties = {
  background: 'var(--cyan)', color: 'var(--on-accent)', border: '1px solid var(--cyan)', borderRadius: 10,
  padding: '12px 18px', fontFamily: 'var(--mono)', fontSize: 14, letterSpacing: 'normal', textTransform: 'none',
  cursor: 'pointer', boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation', width: '100%',
}

/** Asks for the account email and has Supabase send a reset link. The answer is always the same
 * ("if an account exists…") so the form cannot be used to find out which emails have accounts. */
export default function ForgotPasswordForm({ initialEmail = '', onBack }: { initialEmail?: string; onBack: () => void }) {
  const t = useT()
  const [email, setEmail] = useState(initialEmail)
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'limited'>('idle')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setState('sending')
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
    })
    // Only a rate limit is worth telling the person about; every other outcome looks like success.
    setState(error && (error.status === 429 || /rate limit/i.test(error.message)) ? 'limited' : 'sent')
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{t('login.forgotTitle')}</h2>
      <p style={{ color: 'var(--ink-dim)', fontSize: 15, lineHeight: 1.5, margin: 0 }}>{t('login.forgotHint')}</p>
      <input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
        placeholder={t('login.email')} aria-label={t('login.email')} required style={inputStyle} />
      {state === 'sent' && <p role="status" style={{ color: 'var(--green)', fontSize: 16, lineHeight: 1.5, margin: 0 }}>{t('login.linkSent')}</p>}
      {state === 'limited' && <p role="alert" style={{ color: 'var(--red)', fontSize: 16, lineHeight: 1.5, margin: 0 }}>{t('login.linkRateLimit')}</p>}
      <button type="submit" disabled={state === 'sending'} style={btnPrimary}>{state === 'sending' ? '...' : t('login.sendLink')}</button>
      <button type="button" onClick={onBack}
        style={{ background: 'transparent', border: 'none', color: 'var(--ink-dim)', fontSize: 16, cursor: 'pointer', fontFamily: 'var(--sans)' }}>
        {t('login.backToSignIn')}
      </button>
    </form>
  )
}
