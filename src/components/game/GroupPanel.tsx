'use client'
import { useState } from 'react'
import { useT } from '@/lib/i18n'
import { useGroup } from '@/hooks/useGroup'

export default function GroupPanel() {
  const t = useT()
  const { group, standings, loading, createGroup } = useGroup()
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    setCreating(true)
    setError('')
    const err = await createGroup()
    if (err) setError(err)
    setCreating(false)
  }

  function copyLink() {
    if (!group) return
    const url = `${window.location.origin}/join-group/${group.inviteCode}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (loading) return null

  const btnStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
    fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase',
    border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'rgba(56,214,255,.06)',
    borderRadius: 10, padding: '11px 16px', touchAction: 'manipulation',
  }

  if (!group) {
    return (
      <>
        <div style={{ color: 'var(--ink-dim)', fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>{t('group.subtitle')}</div>
        <button onClick={handleCreate} disabled={creating} style={btnStyle}>
          {creating ? t('group.creating') : t('group.create')}
        </button>
        {error && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{error}</p>}
      </>
    )
  }

  return (
    <>
      <div style={{ color: 'var(--ink-dim)', fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>{t('group.inviteHint')}</div>
      <button onClick={copyLink} style={{ ...btnStyle, width: '100%', marginBottom: 14 }}>
        {copied ? t('group.linkCopied') : t('group.copyLink')}
      </button>
      {standings && standings.standings.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {standings.standings.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', background: s.isSelf ? 'rgba(56,214,255,.07)' : 'rgba(0,0,0,.18)' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-dim)', width: 18, textAlign: 'center' }}>{i + 1}</span>
              <span style={{ flex: 1, fontSize: 13, color: s.isSelf ? 'var(--cyan)' : 'var(--ink)' }}>{s.isSelf ? t('rank.you') : (s.name || '—')}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-dim)' }}>{s.xp.toLocaleString()} XP</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: 'var(--ink-dim)', fontSize: 12 }}>{t('group.empty')}</div>
      )}
    </>
  )
}
