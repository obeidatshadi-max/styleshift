'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useT } from '@/lib/i18n'
import PasswordInput from './PasswordInput'
import LangToggle from '@/components/LangToggle'
import ThemeToggle from '@/components/ThemeToggle'

export const MIN_PASSWORD = 6

const inputStyle: React.CSSProperties = {
  background: 'var(--surface-subtle)', border: '1px solid var(--line)', borderRadius: 10,
  padding: '12px 14px', color: 'var(--ink)', fontFamily: 'var(--sans)', fontSize: 16, outline: 'none', width: '100%',
}
const btnPrimary: React.CSSProperties = {
  background: 'var(--cyan)', color: 'var(--on-accent)', border: '1px solid var(--cyan)', borderRadius: 10,
  padding: '12px 18px', fontFamily: 'var(--mono)', fontSize: 14, letterSpacing: 'normal', textTransform: 'none',
  cursor: 'pointer', boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation', width: '100%',
}

/**
 * Shown after the emailed link signed the person in. Sets the new password, then says so and offers two ways on:
 * continue to the app (already signed in), or sign out and sign in again with the new password. The sign-in page
 * sends a signed-in person straight to the app, so reaching it again needs a sign-out first.
 */
export default function ResetPasswordForm() {
  const t = useT()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function signInAgain() {
    setBusy(true)
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < MIN_PASSWORD) { setError(t('reset.tooShort')); return }
    if (password !== again) { setError(t('reset.mismatch')); return }
    setError(null); setBusy(true)
    const { error: updateError } = await createClient().auth.updateUser({ password })
    if (updateError) { setError(t('reset.failed')); setBusy(false); return }
    setBusy(false)
    setDone(true)
  }

  function goToApp() {
    router.push('/play')
    router.refresh()
  }

  return (
    <div className="field-ui login-screen" style={{ position: 'relative', zIndex: 1, maxWidth: 440, margin: '0 auto', padding: '40px 20px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 20 }}><ThemeToggle /><LangToggle /></div>
      {done ? (
        <div role="status" style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 16, padding: 24, boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{t('reset.done')}</h1>
          <p style={{ color: 'var(--ink-dim)', fontSize: 16, lineHeight: 1.5, margin: 0 }}>{t('reset.doneBody')}</p>
          <button type="button" onClick={goToApp} disabled={busy} style={btnPrimary}>{t('reset.continue')}</button>
          <button type="button" onClick={signInAgain} disabled={busy} style={{ ...btnPrimary, background: 'transparent', color: 'var(--cyan)', boxShadow: 'none' }}>{t('reset.signInAgain')}</button>
        </div>
      ) : (
      <form onSubmit={submit} style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 16, padding: 24, boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{t('reset.title')}</h1>
        <PasswordInput autoComplete="new-password" value={password} onChange={setPassword}
          placeholder={t('reset.new')} ariaLabel={t('reset.new')} required style={inputStyle} />
        <PasswordInput autoComplete="new-password" value={again} onChange={setAgain}
          placeholder={t('reset.confirm')} ariaLabel={t('reset.confirm')} required style={inputStyle} />
        {error && <p role="alert" style={{ color: 'var(--red)', fontSize: 16, lineHeight: 1.5, margin: 0 }}>{error}</p>}
        <button type="submit" disabled={busy} style={btnPrimary}>{busy ? '...' : t('reset.save')}</button>
        <button type="button" onClick={signInAgain} disabled={busy}
          style={{ background: 'transparent', border: 'none', color: 'var(--ink-dim)', fontSize: 16, cursor: 'pointer', fontFamily: 'var(--sans)' }}>
          {t('login.backToSignIn')}
        </button>
      </form>
      )}
    </div>
  )
}
