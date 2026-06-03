'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function InvitePage() {
  const router = useRouter()
  const params = useParams()
  const code = params.code as string
  const [status, setStatus] = useState<'loading' | 'joining' | 'done' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function join() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push(`/login?redirect=/invite/${code}`)
        return
      }
      setStatus('joining')
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!res.ok) { setStatus('error'); setMessage(data.error); return }
      setStatus('done')
      setMessage(`You joined ${data.company.name}!`)
      setTimeout(() => router.push('/play'), 1500)
    }
    join()
  }, [code, router])

  const statusText: Record<string, string> = {
    loading: 'Checking invite link…',
    joining: 'Joining team…',
    done: message,
    error: message,
  }
  const statusColor: Record<string, string> = {
    done: 'var(--green)', error: 'var(--red)',
    loading: 'var(--ink-dim)', joining: 'var(--ink-dim)',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: 16, padding: 20, position: 'relative', zIndex: 1 }}>
      <h1 style={{ fontSize: 'clamp(22px,5vw,36px)', fontWeight: 800 }}>
        STYLE<span style={{ color: 'var(--cyan)' }}>SHIFT</span>
      </h1>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: statusColor[status], letterSpacing: '.05em', textAlign: 'center' }}>
        {statusText[status]}
      </div>
      {status === 'done' && <div style={{ color: 'var(--ink-dim)', fontSize: 13 }}>Redirecting to game…</div>}
      {status === 'error' && (
        <button onClick={() => router.push('/play')}
          style={{ background: 'var(--cyan)', color: '#04121c', border: 'none', borderRadius: 10, padding: '10px 18px', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.15em', textTransform: 'uppercase', cursor: 'pointer', touchAction: 'manipulation' }}>
          Go to Game
        </button>
      )}
    </div>
  )
}
