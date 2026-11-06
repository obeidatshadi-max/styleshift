'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useT } from '@/lib/i18n'
import LangToggle from '@/components/LangToggle'
import ThemeToggle from '@/components/ThemeToggle'

const btnPrimary: React.CSSProperties = {
  background: 'var(--cyan)', color: 'var(--on-accent)', border: '1px solid var(--cyan)', borderRadius: 10,
  padding: '12px 18px', fontFamily: 'var(--mono)', fontSize: 14, letterSpacing: 'normal', textTransform: 'none',
  cursor: 'pointer', boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation', width: '100%',
}

/**
 * Where the reset email points. The link's single-use token is only spent when the person presses the button,
 * not when the page is fetched. Mail systems that open every link to scan it (common on company mail) would
 * otherwise use the token up before the person ever clicks, and they would arrive to "expired".
 */
export default function ResetLinkForm() {
  const t = useT()
  const router = useRouter()
  const tokenHash = useSearchParams().get('token_hash')
  const [busy, setBusy] = useState(false)
  const [bad, setBad] = useState(!tokenHash)

  async function proceed() {
    if (!tokenHash) { setBad(true); return }
    setBusy(true)
    const { error } = await createClient().auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })
    if (error) { setBad(true); setBusy(false); return }
    router.push('/reset-password')
    router.refresh()
  }

  return (
    <div className="field-ui login-screen" style={{ position: 'relative', zIndex: 1, maxWidth: 440, margin: '0 auto', padding: '40px 20px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 20 }}><ThemeToggle /><LangToggle /></div>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 16, padding: 24, boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{t('reset.linkTitle')}</h1>
        {bad ? (
          <>
            <p role="alert" style={{ color: 'var(--red)', fontSize: 16, lineHeight: 1.5, margin: 0 }}>{t('reset.linkBad')}</p>
            <Link href="/login" style={{ ...btnPrimary, textAlign: 'center', textDecoration: 'none', display: 'block' }}>{t('login.backToSignIn')}</Link>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--ink-dim)', fontSize: 16, lineHeight: 1.5, margin: 0 }}>{t('reset.linkBody')}</p>
            <button type="button" onClick={proceed} disabled={busy} style={btnPrimary}>{busy ? '...' : t('reset.linkContinue')}</button>
          </>
        )}
      </div>
    </div>
  )
}
