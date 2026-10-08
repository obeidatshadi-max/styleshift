'use client'
import { useCallback, useEffect, useState } from 'react'
import { ITEM_KINDS, ITEM_STATUSES, SOURCE_TYPES, TIER_BY_KIND } from '@/schemas/knowledge'
import type { KnowledgePackRecord, PackStatus } from '@/lib/knowledge-packs'
import { BLANK_PACK, fromRecord, newItem, newSource, nextItemNumber, toPayload, type ItemForm, type PackForm, type SourceForm } from '@/lib/knowledge-pack-form'

const label = (v: string) => v.replace(/_/g, ' ')
const STATUS_COLOR: Record<PackStatus, string> = { draft: 'var(--ink-dim)', approved: 'var(--green)', archived: 'var(--red)' }

const inputStyle: React.CSSProperties = { background: 'rgba(0,0,0,.3)', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 11px', color: 'var(--ink)', fontFamily: 'var(--sans)', fontSize: 13.5, outline: 'none', width: '100%' }
const labelStyle: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', margin: '10px 0 5px', display: 'block' }
const primaryBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', background: 'var(--cyan)', color: '#04121f', borderRadius: 10, padding: '10px 14px', fontWeight: 700 }
const ghostBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', border: '1px solid var(--line)', background: 'none', color: 'var(--ink-dim)', borderRadius: 10, padding: '8px 12px' }

/**
 * Manager-only editor for product knowledge packs. The manager types each fact in and
 * adds its source; the app enforces that an approved clinical fact has a source but cannot
 * judge whether a fact is correct or compliant. That responsibility stays with the company.
 */
export default function KnowledgePackPanel() {
  const [list, setList] = useState<KnowledgePackRecord[] | null>(null)
  const [disabled, setDisabled] = useState(false)
  const [form, setForm] = useState<PackForm | null>(null)
  const [editing, setEditing] = useState<KnowledgePackRecord | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/knowledge-packs').catch(() => null)
    if (!res || res.status === 404) { setDisabled(true); return }
    if (res.ok) setList(await res.json())
  }, [])
  useEffect(() => { void load() }, [load])

  async function call(url: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true); setErrors([])
    const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(() => null)
    setBusy(false)
    if (!res) { setErrors(['Network error']); return false }
    if (!res.ok) { const d = await res.json().catch(() => null); setErrors(d?.errors ?? ['Request failed']); return false }
    return true
  }

  if (disabled) return <div style={{ color: 'var(--ink-dim)', fontSize: 13 }}>Product knowledge is not enabled for this deployment.</div>

  if (form) {
    const setItem = (i: number, patch: Partial<ItemForm>) => setForm(f => f && ({ ...f, items: f.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }))
    const setSource = (i: number, k: number, patch: Partial<SourceForm>) =>
      setItem(i, { sources: form.items[i].sources.map((s, j) => (j === k ? { ...s, ...patch } : s)) })
    async function save() {
      if (!form) return
      const ok = editing ? await call(`/api/knowledge-packs/${editing.id}`, 'PUT', toPayload(form)) : await call('/api/knowledge-packs', 'POST', toPayload(form))
      if (ok) { setForm(null); setEditing(null); await load() }
    }
    return (
      <div>
        <div style={{ ...labelStyle, marginTop: 0 }}>{editing ? 'Edit knowledge pack' : 'New knowledge pack'}</div>
        <div style={{ color: 'var(--ink-dim)', fontSize: 12 }}>
          You are responsible for the accuracy and compliance of what you enter. The app only checks that an approved clinical fact has a source.
          {editing?.status === 'approved' && ' Saving an edit returns this approved pack to draft; approve it again to release it.'}
        </div>
        <label style={labelStyle}>Pack name</label>
        <input style={inputStyle} value={form.name} maxLength={120} onChange={e => setForm({ ...form, name: e.target.value })} />
        <label style={labelStyle}>Product name</label>
        <input style={inputStyle} value={form.productName} maxLength={120} onChange={e => setForm({ ...form, productName: e.target.value })} />
        <label style={labelStyle}>Indication (optional)</label>
        <input style={inputStyle} value={form.indication} maxLength={300} onChange={e => setForm({ ...form, indication: e.target.value })} />

        <div style={{ ...labelStyle, marginTop: 18 }}>Items</div>
        {form.items.map((it, i) => (
          <div key={it.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <strong>{it.id}</strong>
              <button style={ghostBtn} onClick={() => setForm(f => f && ({ ...f, items: f.items.filter((_, j) => j !== i) }))}>Remove</button>
            </div>
            <label style={labelStyle}>Kind (tier: {label(TIER_BY_KIND[it.kind])})</label>
            <select style={inputStyle} value={it.kind} onChange={e => setItem(i, { kind: e.target.value as ItemForm['kind'] })}>
              {ITEM_KINDS.map(k => <option key={k} value={k}>{label(k)}</option>)}
            </select>
            <label style={labelStyle}>Text (English)</label>
            <textarea style={{ ...inputStyle, minHeight: 56 }} value={it.textEn} maxLength={2000} onChange={e => setItem(i, { textEn: e.target.value })} />
            <label style={labelStyle}>Text (Arabic)</label>
            <textarea dir="rtl" style={{ ...inputStyle, minHeight: 56 }} value={it.textAr} maxLength={2000} onChange={e => setItem(i, { textAr: e.target.value })} />
            <label style={{ ...labelStyle, display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={it.arabicReviewed} onChange={e => setItem(i, { arabicReviewed: e.target.checked })} /> Arabic checked by a native speaker
            </label>
            <label style={labelStyle}>Topics (comma separated)</label>
            <input style={inputStyle} value={it.topics} onChange={e => setItem(i, { topics: e.target.value })} />
            <label style={labelStyle}>Status</label>
            <select style={inputStyle} value={it.status} onChange={e => setItem(i, { status: e.target.value as ItemForm['status'] })}>
              {ITEM_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div style={{ ...labelStyle, marginTop: 14 }}>Sources</div>
            {it.sources.map((s, k) => (
              <div key={k} style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
                <input style={inputStyle} placeholder="Title (e.g. Product label)" value={s.title} onChange={e => setSource(i, k, { title: e.target.value })} />
                <select style={inputStyle} value={s.type} onChange={e => setSource(i, k, { type: e.target.value as SourceForm['type'] })}>
                  {SOURCE_TYPES.map(t => <option key={t} value={t}>{label(t)}</option>)}
                </select>
                <input style={inputStyle} placeholder="Reference (section, page or URL)" value={s.reference} onChange={e => setSource(i, k, { reference: e.target.value })} />
                <input style={inputStyle} placeholder="Version (optional)" value={s.version} onChange={e => setSource(i, k, { version: e.target.value })} />
                <button style={ghostBtn} onClick={() => setItem(i, { sources: it.sources.filter((_, j) => j !== k) })}>Remove source</button>
              </div>
            ))}
            <button style={ghostBtn} onClick={() => setItem(i, { sources: [...it.sources, newSource()] })}>+ Add source</button>
          </div>
        ))}
        <button style={ghostBtn} onClick={() => setForm(f => f && ({ ...f, items: [...f.items, newItem(nextItemNumber(f.items))] }))}>+ Add item</button>

        {errors.length > 0 && <ul role="alert" style={{ color: 'var(--red)', fontSize: 12.5, margin: '12px 0 0', paddingLeft: 18 }}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button style={primaryBtn} disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save draft'}</button>
          <button style={ghostBtn} onClick={() => { setForm(null); setEditing(null); setErrors([]) }}>Cancel</button>
        </div>
      </div>
    )
  }

  async function change(id: string, status: PackStatus) {
    if (await call(`/api/knowledge-packs/${id}`, 'PATCH', { status })) await load()
  }

  return (
    <div>
      <button style={primaryBtn} onClick={() => { setEditing(null); setForm({ ...BLANK_PACK }) }}>+ New knowledge pack</button>
      {errors.length > 0 && <ul role="alert" style={{ color: 'var(--red)', fontSize: 12.5, margin: '12px 0 0', paddingLeft: 18 }}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      {list === null ? null : list.length === 0 ? (
        <div style={{ color: 'var(--ink-dim)', fontSize: 13, marginTop: 12 }}>No knowledge packs yet. Without one, the AI doctor and reports stay generic about your product.</div>
      ) : list.map(p => (
        <div key={p.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <strong>{p.name} v{p.version}</strong>
            <span style={{ color: STATUS_COLOR[p.status], fontFamily: 'var(--mono)', fontSize: 11, textTransform: 'uppercase' }}>{p.status}</span>
          </div>
          <div style={{ color: 'var(--ink-dim)', fontSize: 12.5, margin: '4px 0 10px' }}>
            {p.productName} · {p.items.filter(i => i.status === 'approved').length} approved of {p.items.length} items
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={ghostBtn} onClick={() => { setEditing(p); setForm(fromRecord(p)) }}>Edit</button>
            {p.status !== 'approved' && <button style={ghostBtn} disabled={busy} onClick={() => change(p.id, 'approved')}>Approve</button>}
            {p.status === 'approved' && <button style={ghostBtn} disabled={busy} onClick={() => change(p.id, 'draft')}>Return to draft</button>}
            {p.status !== 'archived' && <button style={ghostBtn} disabled={busy} onClick={() => change(p.id, 'archived')}>Archive</button>}
          </div>
        </div>
      ))}
    </div>
  )
}
