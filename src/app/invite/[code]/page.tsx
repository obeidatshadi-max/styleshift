'use client'
import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useT, useLang } from '@/lib/i18n'
import LangToggle from '@/components/LangToggle'

export default function InvitePage() {
  const router = useRouter()
  const params = useParams()
  const code = params.code as string
  const t = useT()
  const { dir } = useLang()

  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setMessage('')

    const res = await fetch('/api/rep-join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mobile, inviteCode: code }),
    })
    const data = await res.json()
    if (!res.ok) {
      setStatus('error')
      setMessage(data.error)
      return
    }

    // Exchange hashed token for a real session — no email required
    const supabase = createClient()
    const { error: otpError } = await supabase.auth.verifyOtp({
      token_hash: data.token_hash,
      type: 'magiclink',
    })
    if (otpError) {
      setStatus('error')
      setMessage(t('join.otpError'))
      return
    }

    setStatus('done')
    setMessage(t('join.welcome', { name: data.company_name }))
    setTimeout(() => {
      router.push('/play')
      router.refresh()
    }, 1400)
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(0,0,0,.3)', border: '1px solid var(--line)', borderRadius: 10,
    padding: '12px 14px', color: 'var(--ink)', fontFamily: 'var(--sans)', fontSize: 14,
    outline: 'none', width: '100%',
  }
  const btnStyle: React.CSSProperties = {
    background: 'var(--cyan)', color: '#04121c', border: '1px solid var(--cyan)',
    borderRadius: 10, padding: '12px 18px', fontFamily: 'var(--mono)', fontSize: 12,
    letterSpacing: '.15em', textTransform: 'uppercase', cursor: 'pointer',
    boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation', width: '100%',
  }

  return (
    <div dir={dir} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: 16, padding: 20, position: 'relative', zIndex: 1 }}>
      <div style={{ alignSelf: 'flex-end', position: 'absolute', top: 20, right: 20 }}>
        <LangToggle />
      </div>

      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.45em', color: 'var(--cyan)', textTransform: 'uppercase' }}>
        {t('join.eyebrow')}
      </div>
      <h1 style={{ fontSize: 'clamp(22px,5vw,36px)', fontWeight: 800 }}>
        STYLE<span style={{ color: 'var(--cyan)' }}>SHIFT</span>
      </h1>

      {status === 'done' ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700 }}>{message}</div>
          <div style={{ color: 'var(--ink-dim)', fontSize: 13, marginTop: 8 }}>{t('join.redirecting')}</div>
        </div>
      ) : (
        <div style={{ background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)', borderRadius: 16, padding: 24, boxShadow: '0 12px 40px rgba(0,0,0,.45)', width: '100%', maxWidth: 380 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 16 }}>
            {t('join.subtitle')}
          </div>
          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('join.yourName')}
              required
              style={inputStyle}
            />
            <input
              type="tel"
              value={mobile}
              onChange={e => setMobile(e.target.value)}
              placeholder={t('join.mobilePlaceholder')}
              required
              style={inputStyle}
            />
            {status === 'error' && (
              <p style={{ color: 'var(--red)', fontSize: 13, fontFamily: 'var(--mono)' }}>{message}</p>
            )}
            <button type="submit" disabled={status === 'loading'} style={btnStyle}>
              {status === 'loading' ? t('join.loading') : t('join.submit')}
            </button>
          </form>
          <p style={{ color: 'var(--ink-dim)', fontSize: 12, marginTop: 12, lineHeight: 1.6 }}>
            {t('join.hint')}
          </p>
        </div>
      )}
    </div>
  )
}
