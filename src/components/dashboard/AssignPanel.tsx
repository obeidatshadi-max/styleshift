'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { OBJECTION_CATEGORIES } from '@/lib/social-style'
import type { ManagerAssignmentView } from '@/lib/assignments'

// Dashboard-side labels (the dashboard is English; reps see localized names in-game).
const CATEGORY_LABEL: Record<string, string> = {
  evidence: 'Evidence / data', price: 'Price / cost', safety: 'Safety / side effects',
  time: 'Time / too busy', competitor: 'Competitor', logistics: 'Stock / delivery',
  trust: 'Trust / relationship',
}
const LEVEL_LABEL: Record<string, string> = {
  '1': 'Level 1 · Style Scan', '2': 'Level 2 · Crisis Mode',
  '3': 'Level 3 · Drive Decoder', '4': 'Level 4 · The Boardroom',
}

export function describeTarget(targetType: string, targetKey: string): string {
  return targetType === 'category'
    ? `${CATEGORY_LABEL[targetKey] ?? targetKey} objection drills`
    : LEVEL_LABEL[targetKey] ?? `Level ${targetKey}`
}

interface Props {
  current: ManagerAssignmentView | null
  reps: { id: string; name: string | null }[]
}

export default function AssignPanel({ current, reps }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [targetType, setTargetType] = useState<'category' | 'level'>('category')
  const [targetKey, setTargetKey] = useState<string>('price')
  const [selected, setSelected] = useState<string[]>(reps.map(r => r.id))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  const overdue = current ? current.assignment.due_date < new Date().toISOString().slice(0, 10) : false
  const doneCount = current?.reps.filter(r => r.completed_at).length ?? 0

  async function create() {
    if (selected.length === 0) return
    setSaving(true); setError(false)
    const res = await fetch('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_type: targetType,
        target_key: targetKey,
        rep_ids: selected.length === reps.length ? null : selected,
      }),
    }).catch(() => null)
    setSaving(false)
    if (!res?.ok) { setError(true); return }
    setOpen(false)
    router.refresh()
  }

  const chip = (active: boolean): React.CSSProperties => ({
    cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.05em',
    border: `1px solid ${active ? 'var(--cyan)' : 'var(--line)'}`, borderRadius: 18,
    padding: '6px 12px', color: active ? 'var(--cyan)' : 'var(--ink-dim)',
    background: active ? 'rgba(56,214,255,.1)' : 'transparent', touchAction: 'manipulation',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Active assignment status */}
      {current ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{describeTarget(current.assignment.target_type, current.assignment.target_key)}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: overdue ? 'var(--red)' : 'var(--ink-dim)', marginTop: 2 }}>
                {overdue ? `Overdue — was due ${current.assignment.due_date}` : `Due ${current.assignment.due_date}`}
              </div>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: doneCount === current.reps.length ? 'var(--green)' : 'var(--amber)' }}>
              {doneCount}/{current.reps.length} done
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {current.reps.map(r => (
              <div key={r.rep_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'rgba(0,0,0,.18)' }}>
                <span style={{ fontSize: 13 }}>{r.name ?? 'Rep'}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: r.completed_at ? 'var(--green)' : 'var(--ink-dim)' }}>
                  {r.completed_at ? '✓ done' : '— pending'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ color: 'var(--ink-dim)', fontSize: 12.5, lineHeight: 1.5 }}>
          No active assignment. Spot a weak area in the heatmap, then assign targeted drills — reps see it on their game home.
        </div>
      )}

      {/* Create form */}
      {open ? (
        <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, background: 'rgba(0,0,0,.18)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={chip(targetType === 'category')} onClick={() => { setTargetType('category'); setTargetKey('price') }}>Objection drills</button>
            <button style={chip(targetType === 'level')} onClick={() => { setTargetType('level'); setTargetKey('2') }}>Level run</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {targetType === 'category'
              ? OBJECTION_CATEGORIES.map(c => (
                  <button key={c} style={chip(targetKey === c)} onClick={() => setTargetKey(c)}>{CATEGORY_LABEL[c]}</button>
                ))
              : (['1', '2', '3', '4'] as const).map(l => (
                  <button key={l} style={chip(targetKey === l)} onClick={() => setTargetKey(l)}>{LEVEL_LABEL[l]}</button>
                ))}
          </div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 8 }}>Who</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {reps.map(r => {
                const on = selected.includes(r.id)
                return (
                  <button key={r.id} style={chip(on)}
                    onClick={() => setSelected(s => on ? s.filter(id => id !== r.id) : [...s, r.id])}>
                    {on ? '✓ ' : ''}{r.name ?? 'Rep'}
                  </button>
                )
              })}
            </div>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>Couldn&apos;t create the assignment — try again.</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={create} disabled={saving || selected.length === 0}
              style={{ flex: 1, cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', background: 'var(--cyan)', color: '#04121f', borderRadius: 10, padding: '11px 14px', fontWeight: 700, opacity: saving || selected.length === 0 ? .5 : 1 }}>
              {saving ? 'Assigning…' : 'Assign · due in 7 days'}
            </button>
            <button onClick={() => setOpen(false)}
              style={{ cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--line)', background: 'none', color: 'var(--ink-dim)', borderRadius: 10, padding: '11px 14px' }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)}
          style={{ cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'rgba(56,214,255,.06)', borderRadius: 10, padding: '12px 16px', touchAction: 'manipulation' }}>
          {current ? '＋ New assignment (replaces current)' : '＋ Create assignment'}
        </button>
      )}
    </div>
  )
}
