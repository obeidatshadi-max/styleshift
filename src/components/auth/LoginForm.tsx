'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useSearchParams } from 'next/navigation'
import { useT } from '@/lib/i18n'
import LangToggle from '@/components/LangToggle'

export default function LoginForm() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useT()

  const [tab, setTab] = useState<'rep' | 'manager'>('rep')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [mobile, setMobile] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (searchParams.get('confirm_error')) setError(t('login.confirmError'))
  }, [searchParams, t])

  async function handleRepLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const res = await fetch('/api/rep-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error)
      setLoading(false)
      return
    }

    const { error: otpError } = await supabase.auth.verifyOtp({
      token_hash: data.token_hash,
      type: 'magiclink',
    })
    if (otpError) {
      setError(t('login.mobileLoginFailed'))
      setLoading(false)
      return
    }

    const redirect = searchParams.get('redirect') || '/play'
    router.push(redirect)
    router.refresh()
  }

  async function handleManagerLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    if (mode === 'signup') {
      // Create the account server-side (already-confirmed, no email sent), then
      // sign straight in. Avoids Supabase's built-in email rate limit entirely.
      const res = await fetch('/api/manager-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setLoading(false); return }
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      const redirect = searchParams.get('redirect') || '/play'
      router.push(redirect)
      router.refresh()
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    const redirect = searchParams.get('redirect') || '/play'
    router.push(redirect)
    router.refresh()
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(0,0,0,.3)', border: '1px solid var(--line)', borderRadius: 10,
    padding: '12px 14px', color: 'var(--ink)', fontFamily: 'var(--sans)', fontSize: 14,
    outline: 'none', width: '100%',
  }
  const btnPrimary: React.CSSProperties = {
    background: 'var(--cyan)', color: '#04121c', border: '1px solid var(--cyan)',
    borderRadius: 10, padding: '12px 18px', fontFamily: 'var(--mono)', fontSize: 12,
    letterSpacing: '.15em', textTransform: 'uppercase', cursor: 'pointer',
    boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation', width: '100%',
  }

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 400, margin: '0 auto', padding: '40px 20px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <LangToggle />
      </div>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.45em', color: 'var(--cyan)', textTransform: 'uppercase', marginBottom: 12 }}>{t('eyebrow')}</div>
        <h1 style={{ fontSize: 'clamp(28px,6vw,40px)', fontWeight: 800, letterSpacing: '.02em' }}>
          STYLE<span style={{ color: 'var(--cyan)' }}>SHIFT</span>
        </h1>
        <p style={{ color: 'var(--ink-dim)', fontSize: 13, marginTop: 8, letterSpacing: '.18em', textTransform: 'uppercase' }}>{t('tagline')}</p>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, background: 'rgba(0,0,0,.25)', borderRadius: 10, padding: 4 }}>
        {(['rep', 'manager'] as const).map(t2 => (
          <button
            key={t2}
            onClick={() => { setTab(t2); setError(null) }}
            style={{
              flex: 1, padding: '9px 0', border: 'none', borderRadius: 8,
              fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.15em', textTransform: 'uppercase',
              cursor: 'pointer', transition: 'all .15s',
              background: tab === t2 ? 'var(--cyan)' : 'transparent',
              color: tab === t2 ? '#04121c' : 'var(--ink-dim)',
              fontWeight: tab === t2 ? 700 : 400,
            }}
          >
            {t2 === 'rep' ? t('login.repTab') : t('login.managerTab')}
          </button>
        ))}
      </div>

      <div style={{ background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)', borderRadius: 16, padding: 24, boxShadow: '0 12px 40px rgba(0,0,0,.45)' }}>
        {tab === 'rep' ? (
          <form onSubmit={handleRepLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-dim)' }}>
              {t('login.mobileLabel')}
            </div>
            <input
              type="tel"
              value={mobile}
              onChange={e => setMobile(e.target.value)}
              placeholder={t('join.mobilePlaceholder')}
              required
              style={inputStyle}
            />
            {error && (
              <p style={{ color: 'var(--red)', fontSize: 13, fontFamily: 'var(--mono)' }}>{error}</p>
            )}
            <button type="submit" disabled={loading} style={btnPrimary}>
              {loading ? '…' : t('login.mobileSignIn')}
            </button>
            <p style={{ color: 'var(--ink-dim)', fontSize: 12, lineHeight: 1.5, margin: 0 }}>
              {t('login.mobileHint')}
            </p>
          </form>
        ) : (
          <form onSubmit={handleManagerLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('login.email')} required style={inputStyle} />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('login.password')} required style={inputStyle} />
            {error && <p style={{ color: error === t('login.checkEmail') ? 'var(--green)' : 'var(--red)', fontSize: 13, fontFamily: 'var(--mono)' }}>{error}</p>}
            <button type="submit" disabled={loading} style={btnPrimary}>
              {loading ? '...' : mode === 'login' ? t('login.signIn') : t('login.createAccount')}
            </button>
            <button type="button" onClick={() => setMode(m => m === 'login' ? 'signup' : 'login')}
              style={{ background: 'transparent', border: 'none', color: 'var(--ink-dim)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--sans)' }}>
              {mode === 'login' ? t('login.toSignup') : t('login.toLogin')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
