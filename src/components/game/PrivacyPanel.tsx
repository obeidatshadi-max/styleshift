'use client'
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n'

interface Counts { total: number }

export default function PrivacyPanel() {
  const t = useT()
  const [counts, setCounts] = useState<Counts | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [state, setState] = useState<'idle' | 'deleting' | 'done' | 'error'>('idle')

  useEffect(() => {
    fetch('/api/privacy/voice-history').then(res => res.ok ? res.json() : null).then(setCounts).catch(() => {})
  }, [])

  async function confirmDelete() {
    setState('deleting')
    try {
      const res = await fetch('/api/privacy/voice-history', { method: 'DELETE' })
      if (!res.ok) { setState('error'); return }
      setCounts({ total: 0 })
      setConfirming(false)
      setState('done')
    } catch {
      setState('error')
    }
  }

  const ghostBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', border: '1px solid var(--line)', color: 'var(--ink-dim)', background: 'transparent', borderRadius: 8, padding: '9px 14px', touchAction: 'manipulation' }
  const dangerBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', border: '1px solid var(--red)', color: 'var(--red)', background: 'rgba(255,93,108,.08)', borderRadius: 8, padding: '9px 14px', touchAction: 'manipulation' }

  return (
    <div>
      <p style={{ color: 'var(--ink-dim)', fontSize: 12.5, lineHeight: 1.55, marginBottom: 12 }}>{t('privacy.body')}</p>

      {counts && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-dim)', marginBottom: 12 }}>
          {t('privacy.count', { n: counts.total })}
        </div>
      )}

      {state === 'done' && (
        <div style={{ fontSize: 13, color: 'var(--green)', marginBottom: 10 }}>{t('privacy.deleted')}</div>
      )}
      {state === 'error' && (
        <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 10 }}>{t('privacy.deleteError')}</div>
      )}

      {!confirming ? (
        <button onClick={() => setConfirming(true)} disabled={!counts || counts.total === 0} style={{ ...dangerBtn, opacity: !counts || counts.total === 0 ? 0.4 : 1, cursor: !counts || counts.total === 0 ? 'not-allowed' : 'pointer' }}>
          {t('privacy.deleteAll')}
        </button>
      ) : (
        <div style={{ border: '1px solid var(--red)', borderRadius: 10, padding: '11px 13px', background: 'rgba(255,93,108,.06)' }}>
          <div style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.5, marginBottom: 10 }}>{t('privacy.confirmBody')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={confirmDelete} disabled={state === 'deleting'} style={{ ...dangerBtn, opacity: state === 'deleting' ? 0.6 : 1 }}>
              {state === 'deleting' ? '…' : t('privacy.confirmYes')}
            </button>
            <button onClick={() => setConfirming(false)} style={ghostBtn}>{t('privacy.confirmCancel')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
