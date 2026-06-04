'use client'
import { useRef, useState } from 'react'
import { useT } from '@/lib/i18n'

// Lets a rep set/replace their profile photo. The photo appears on the manager's
// recognition card (and can be reused elsewhere later). Optional — reps who skip
// it simply get a monogram on the card.
export default function AvatarUploader({
  avatarUrl,
  name,
  onUpload,
}: {
  avatarUrl: string | null
  name: string | null
  onUpload: (file: File) => Promise<string | null>
}) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const initial = (name?.trim()?.[0] || '★').toUpperCase()

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      setError(true)
      return
    }
    setError(false)
    setBusy(true)
    const url = await onUpload(file)
    setBusy(false)
    if (!url) setError(true)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', border: '2px solid var(--cyan)', boxShadow: 'var(--glow-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.3)', color: 'var(--cyan)', fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700 }}>
        {avatarUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={avatarUrl} alt={name ?? 'avatar'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : initial}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 4 }}>{t('avatar.title')}</div>
        <div style={{ fontSize: 11.5, color: error ? 'var(--red)' : 'var(--ink-dim)', lineHeight: 1.4 }}>
          {error ? t('avatar.error') : t('avatar.hint')}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
      <button onClick={() => inputRef.current?.click()} disabled={busy}
        style={{ flexShrink: 0, cursor: busy ? 'default' : 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'rgba(56,214,255,.06)', borderRadius: 10, padding: '9px 14px', opacity: busy ? 0.5 : 1, touchAction: 'manipulation' }}>
        {busy ? t('avatar.uploading') : avatarUrl ? t('avatar.change') : t('avatar.add')}
      </button>
    </div>
  )
}
