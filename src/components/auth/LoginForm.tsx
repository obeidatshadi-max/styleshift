'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useSearchParams } from 'next/navigation'
import { useT } from '@/lib/i18n'
import LangToggle from '@/components/LangToggle'

export default function LoginForm() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      setError(t('login.checkEmail'))
      setLoading(false)
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    const redirect = searchParams.get('redirect') || '/play'
    router.push(redirect)
    router.refresh()
  }

  const inputStyle: React.CSSProperties = {
    background:'rgba(0,0,0,.3)', border:'1px solid var(--line)', borderRadius:10,
    padding:'12px 14px', color:'var(--ink)', fontFamily:'var(--sans)', fontSize:14,
    outline:'none', width:'100%',
  }
  const btnStyle: React.CSSProperties = {
    background:'var(--cyan)', color:'#04121c', border:'1px solid var(--cyan)',
    borderRadius:10, padding:'12px 18px', fontFamily:'var(--mono)', fontSize:12,
    letterSpacing:'.15em', textTransform:'uppercase', cursor:'pointer',
    boxShadow:'var(--glow-cyan)', touchAction:'manipulation', width:'100%',
  }

  return (
    <div style={{ position:'relative', zIndex:1, maxWidth:400, margin:'0 auto', padding:'40px 20px 80px' }}>
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:20 }}>
        <LangToggle />
      </div>
      <div style={{ textAlign:'center', marginBottom:32 }}>
        <div style={{ fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.45em', color:'var(--cyan)', textTransform:'uppercase', marginBottom:12 }}>{t('eyebrow')}</div>
        <h1 style={{ fontSize:'clamp(28px,6vw,40px)', fontWeight:800, letterSpacing:'.02em' }}>
          STYLE<span style={{ color:'var(--cyan)' }}>SHIFT</span>
        </h1>
        <p style={{ color:'var(--ink-dim)', fontSize:13, marginTop:8, letterSpacing:'.18em', textTransform:'uppercase' }}>{t('tagline')}</p>
      </div>
      <div style={{ background:'linear-gradient(180deg,var(--panel),#0a1430)', border:'1px solid var(--line)', borderRadius:16, padding:24, boxShadow:'0 12px 40px rgba(0,0,0,.45)' }}>
        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('login.email')} required style={inputStyle} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('login.password')} required style={inputStyle} />
          {error && <p style={{ color: error === t('login.checkEmail') ? 'var(--green)' : 'var(--red)', fontSize:13, fontFamily:'var(--mono)' }}>{error}</p>}
          <button type="submit" disabled={loading} style={btnStyle}>
            {loading ? '...' : mode === 'login' ? t('login.signIn') : t('login.createAccount')}
          </button>
          <button type="button" onClick={() => setMode(m => m === 'login' ? 'signup' : 'login')}
            style={{ background:'transparent', border:'none', color:'var(--ink-dim)', fontSize:13, cursor:'pointer', fontFamily:'var(--sans)' }}>
            {mode === 'login' ? t('login.toSignup') : t('login.toLogin')}
          </button>
        </form>
      </div>
    </div>
  )
}
