'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useT, useLang } from '@/lib/i18n'
import LangToggle from '@/components/LangToggle'

export default function JoinGroupPage() {
  const router = useRouter()
  const params = useParams()
  const code = params.code as string
  const t = useT()
  const { dir } = useLang()

  const [status, setStatus] = useState<'checking' | 'loggedOut' | 'joining' | 'done' | 'error'>('checking')
  const [message, setMessage] = useState('')
  const [groupName, setGroupName] = useState('')

  useEffect(() => {
    (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setStatus('loggedOut'); return }
      setStatus('joining')
      const res = await fetch('/api/groups/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!res.ok) { setStatus('error'); setMessage(data.error); return }
      setGroupName(data.group?.name ?? '')
      setStatus('done')
      setTimeout(() => { router.push('/play'); router.refresh() }, 1400)
    })()
  }, [code, router])

  const btnStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--cyan)', color: '#04121c', border: '1px solid var(--cyan)',
    borderRadius: 10, padding: '12px 18px', fontFamily: 'var(--mono)', fontSize: 12,
    letterSpacing: '.15em', textTransform: 'uppercase', cursor: 'pointer',
    boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation', textDecoration: 'none',
  }

  return (
    <div dir={dir} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: 16, padding: 20, position: 'relative', zIndex: 1 }}>
      <div style={{ position: 'absolute', top: 20, right: 20 }}><LangToggle /></div>

      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.45em', color: 'var(--cyan)', textTransform: 'uppercase' }}>
        {t('group.joinEyebrow')}
      </div>
      <h1 style={{ fontSize: 'clamp(22px,5vw,36px)', fontWeight: 800 }}>
        STYLE<span style={{ color: 'var(--cyan)' }}>SHIFT</span>
      </h1>

      <div style={{ background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)', borderRadius: 16, padding: 24, boxShadow: '0 12px 40px rgba(0,0,0,.45)', width: '100%', maxWidth: 380, textAlign: 'center' }}>
        {status === 'checking' && <p style={{ color: 'var(--ink-dim)' }}>{t('group.checking')}</p>}
        {status === 'joining' && <p style={{ color: 'var(--ink-dim)' }}>{t('group.joining')}</p>}
        {status === 'loggedOut' && (
          <>
            <p style={{ color: 'var(--ink-dim)', marginBottom: 16 }}>{t('group.loginFirst')}</p>
            <a href="/login" style={btnStyle}>{t('group.goToLogin')}</a>
          </>
        )}
        {status === 'done' && (
          <p style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontWeight: 700 }}>{t('group.joined', { name: groupName })}</p>
        )}
        {status === 'error' && (
          <>
            <p style={{ color: 'var(--red)', marginBottom: 16 }}>{message}</p>
            <a href="/play" style={btnStyle}>{t('group.backToGame')}</a>
          </>
        )}
      </div>
    </div>
  )
}
