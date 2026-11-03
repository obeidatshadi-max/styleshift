'use client'
import { useEffect, useState } from 'react'
import { useLang } from '@/lib/i18n'
import type { ShareKind } from '@/lib/manager-share'

interface Props {
  kind: ShareKind
  id: string
  /** ISO time the rep shared it, or null/undefined when private. */
  initialSharedAt?: string | null
}

/**
 * Off by default. The rep decides per item, and can switch it off again. The note says exactly what a
 * manager would see, so the choice is informed.
 */
export default function ShareWithManager({ kind, id, initialSharedAt }: Props) {
  const { lang } = useLang()
  const ar = lang === 'ar'
  const [shared, setShared] = useState(!!initialSharedAt)
  // Unknown until the server says so, unless the caller already has it: never show "private" for an item that is shared.
  const [loading, setLoading] = useState(initialSharedAt === undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (initialSharedAt !== undefined) return
    let active = true
    fetch(`/api/share-with-manager?kind=${kind}&id=${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (active && d) setShared(!!d.sharedAt) })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [kind, id, initialSharedAt])

  async function toggle(next: boolean) {
    setBusy(true); setError(false)
    try {
      const res = await fetch('/api/share-with-manager', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, id, shared: next }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setShared(next)
    } catch { setError(true) } finally { setBusy(false) }
  }

  const what = kind === 'debrief'
    ? (ar ? 'سيرى مديرك تقرير التدريب (الملخص والأولوية والخطوة التالية) ولن يرى ما كتبته بنفسك.' : 'Your manager will see the coaching report (summary, priority, next step), not what you wrote yourself.')
    : (ar ? 'سيرى مديرك ملخص التقرير والأولوية التدريبية ولن يرى نص المحادثة.' : 'Your manager will see the report summary and coaching priority, not the conversation transcript.')

  return (
    <div role="group" aria-label={ar ? 'المشاركة مع المدير' : 'Share with manager'}
      style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginTop: 12, display: 'grid', gap: 6 }}>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: busy ? 'wait' : 'pointer', fontSize: 16 }}>
        <input type="checkbox" checked={shared} disabled={busy || loading} onChange={e => void toggle(e.target.checked)} />
        {ar ? 'شارك هذا مع مديري' : 'Share this with my manager'}
      </label>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ink-dim)', margin: 0 }}>
        {shared ? (ar ? 'تمت المشاركة. يمكنك إيقافها في أي وقت. ' : 'Shared. You can stop sharing any time. ') : (ar ? 'خاص حالياً. ' : 'Private for now. ')}{what}
      </p>
      {error && <p role="alert" style={{ fontSize: 14, color: 'var(--red)', margin: 0 }}>{ar ? 'تعذّر الحفظ. حاول مرة أخرى.' : 'Could not save. Try again.'}</p>}
    </div>
  )
}
