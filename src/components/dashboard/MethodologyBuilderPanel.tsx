'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { METHODOLOGY_TEMPLATES } from '@/lib/methodology-templates'
import { CAPABILITY_DIMENSIONS } from '@/scoring/capability'
import { defaultScoringConfig } from '@/scoring/config'
import type { MethodologyRecord } from '@/lib/methodologies'

const BEHAVIORS = Object.values(defaultScoringConfig.competencies).flatMap(c => Object.entries(c.behaviors).map(([k, v]) => ({ key: k, description: v.description, negative: v.points < 0 })))
const label = (v: string) => v.replace(/_/g, ' ')
const STATUS_COLOR = { draft: 'var(--ink-dim)', active: 'var(--green)', archived: 'var(--red)' } as const

const inputStyle: React.CSSProperties = { background: 'rgba(0,0,0,.3)', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 11px', color: 'var(--ink)', fontFamily: 'var(--sans)', fontSize: 13.5, outline: 'none', width: '100%' }
const labelStyle: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', margin: '10px 0 5px', display: 'block' }
const primaryBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', background: 'var(--cyan)', color: '#04121f', borderRadius: 10, padding: '10px 14px', fontWeight: 700 }
const ghostBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', border: '1px solid var(--line)', background: 'none', color: 'var(--ink-dim)', borderRadius: 10, padding: '8px 12px' }
const chip = (active: boolean, color = 'var(--cyan)'): React.CSSProperties => ({ cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10.5, border: `1px solid ${active ? color : 'var(--line)'}`, borderRadius: 16, padding: '5px 10px', color: active ? color : 'var(--ink-dim)', background: active ? 'rgba(255,255,255,.04)' : 'transparent' })

interface StageForm {
  id: string; nameEn: string; nameAr: string; description: string; optional: boolean; weight: string
  expected: string[]; prohibited: string[]; evidence: string; prompts: string
}
interface Form {
  name: string; version: number; stages: StageForm[]
  terms: Record<string, { en: string; ar: string }>
  dims: Record<string, { en: string; ar: string }>
}

const lines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean)
const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v])
const newStage = (n: number): StageForm => ({ id: `stage-${n}`, nameEn: '', nameAr: '', description: '', optional: false, weight: '1', expected: [], prohibited: [], evidence: '', prompts: '' })
const BLANK: Form = { name: '', version: 1, stages: [newStage(1)], terms: {}, dims: {} }

type Body = { name?: string; version?: number; stages?: Array<Record<string, any>>; terminology?: Record<string, { en?: string; ar?: string }>; dimensionTerms?: Record<string, { en?: string; ar?: string }> } // eslint-disable-line @typescript-eslint/no-explicit-any

function fromBody(b: Body): Form {
  return {
    name: b.name ?? '', version: b.version ?? 1,
    stages: (b.stages ?? []).map((s, i) => ({
      id: s.id ?? `stage-${i + 1}`, nameEn: s.name?.en ?? '', nameAr: s.name?.ar ?? '', description: s.description?.en ?? '', optional: !!s.optional,
      weight: String(s.weight ?? 1), expected: s.expectedBehaviors ?? [], prohibited: s.prohibitedBehaviors ?? [],
      evidence: (s.requiredEvidence ?? []).join('\n'), prompts: (s.coachingPrompts ?? []).map((p: { en?: string }) => p.en ?? '').filter(Boolean).join('\n'),
    })),
    terms: Object.fromEntries(Object.entries(b.terminology ?? {}).map(([k, v]) => [k, { en: v.en ?? '', ar: v.ar ?? '' }])),
    dims: Object.fromEntries(Object.entries(b.dimensionTerms ?? {}).map(([k, v]) => [k, { en: v.en ?? '', ar: v.ar ?? '' }])),
  }
}

const text = (en: string, ar: string) => ({ ...(en.trim() ? { en: en.trim() } : {}), ...(ar.trim() ? { ar: ar.trim() } : {}) })

function toPayload(f: Form) {
  const compact = (m: Record<string, { en: string; ar: string }>) => Object.fromEntries(Object.entries(m).filter(([, v]) => v.en.trim() || v.ar.trim()).map(([k, v]) => [k, text(v.en, v.ar)]))
  return {
    name: f.name, version: f.version,
    stages: f.stages.map((s, i) => ({
      id: s.id, order: i + 1, name: text(s.nameEn, s.nameAr), description: text(s.description, ''), optional: s.optional, weight: Number(s.weight),
      expectedBehaviors: s.expected, prohibitedBehaviors: s.prohibited, requiredEvidence: lines(s.evidence),
      coachingPrompts: lines(s.prompts).map(en => ({ en })),
    })),
    terminology: compact(f.terms), dimensionTerms: compact(f.dims),
  }
}

/**
 * Manager-only builder for the company's selling model. The model is
 * configuration over StyleShift's fixed behavior list: stages group behaviors,
 * and the terminology section only renames them. No new detectors are created,
 * so every analytic keeps working whatever the company calls things.
 */
export default function MethodologyBuilderPanel() {
  const [list, setList] = useState<MethodologyRecord[] | null>(null)
  const [disabled, setDisabled] = useState(false)
  const [form, setForm] = useState<Form | null>(null)
  const [editing, setEditing] = useState<MethodologyRecord | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/methodologies').catch(() => null)
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

  const usedBehaviors = useMemo(() => [...new Set((form?.stages ?? []).flatMap(s => [...s.expected, ...s.prohibited]))], [form])

  if (disabled) return <div style={{ color: 'var(--ink-dim)', fontSize: 13 }}>The methodology builder is not enabled for this deployment.</div>

  if (form) {
    const setStage = (i: number, patch: Partial<StageForm>) => setForm(f => f && ({ ...f, stages: f.stages.map((s, j) => (j === i ? { ...s, ...patch } : s)) }))
    const move = (i: number, d: -1 | 1) => setForm(f => {
      if (!f) return f
      const j = i + d
      if (j < 0 || j >= f.stages.length) return f
      const stages = [...f.stages];[stages[i], stages[j]] = [stages[j], stages[i]]
      return { ...f, stages }
    })
    const setTerm = (kind: 'terms' | 'dims', key: string, lang: 'en' | 'ar', v: string) =>
      setForm(f => f && ({ ...f, [kind]: { ...f[kind], [key]: { en: f[kind][key]?.en ?? '', ar: f[kind][key]?.ar ?? '', [lang]: v } } }))
    return (
      <div>
        <div style={{ ...labelStyle, marginTop: 0 }}>{editing ? 'Edit methodology' : 'New methodology'}</div>
        {editing?.status === 'active' && <div style={{ color: 'var(--ink-dim)', fontSize: 12 }}>This one is live. Saving creates a new draft version; reps keep seeing the live one until you activate the draft.</div>}
        <label style={labelStyle}>Name</label>
        <input style={inputStyle} value={form.name} maxLength={120} onChange={e => setForm({ ...form, name: e.target.value })} />

        <div style={{ ...labelStyle, marginTop: 18 }}>Stages (in order)</div>
        {form.stages.map((s, i) => (
          <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <strong>Stage {i + 1}</strong>
              <span style={{ display: 'flex', gap: 6 }}>
                <button type="button" style={ghostBtn} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                <button type="button" style={ghostBtn} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                <button type="button" style={ghostBtn} onClick={() => setForm(f => f && ({ ...f, stages: f.stages.filter((_, j) => j !== i) }))}>Remove</button>
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><label style={labelStyle}>Name (English)</label><input style={inputStyle} value={s.nameEn} onChange={e => setStage(i, { nameEn: e.target.value })} /></div>
              <div><label style={labelStyle}>Name (Arabic, optional)</label><input style={inputStyle} dir="rtl" value={s.nameAr} onChange={e => setStage(i, { nameAr: e.target.value })} /></div>
            </div>
            <label style={labelStyle}>Description</label>
            <input style={inputStyle} value={s.description} onChange={e => setStage(i, { description: e.target.value })} />
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 13 }}><input type="checkbox" checked={s.optional} onChange={e => setStage(i, { optional: e.target.checked })} /> Optional stage</label>
              <label style={{ fontSize: 13 }}>Weight <input style={{ ...inputStyle, width: 70, display: 'inline-block' }} inputMode="decimal" value={s.weight} onChange={e => setStage(i, { weight: e.target.value })} /></label>
            </div>
            <label style={labelStyle}>Expected behaviors (show the stage is done well)</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{BEHAVIORS.filter(b => !b.negative).map(b => <button key={b.key} type="button" title={b.description} style={chip(s.expected.includes(b.key), 'var(--green)')} onClick={() => setStage(i, { expected: toggle(s.expected, b.key), prohibited: s.prohibited.filter(x => x !== b.key) })}>{label(b.key)}</button>)}</div>
            <label style={labelStyle}>Prohibited behaviors (count against the stage)</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{BEHAVIORS.filter(b => b.negative).map(b => <button key={b.key} type="button" title={b.description} style={chip(s.prohibited.includes(b.key), 'var(--red)')} onClick={() => setStage(i, { prohibited: toggle(s.prohibited, b.key), expected: s.expected.filter(x => x !== b.key) })}>{label(b.key)}</button>)}</div>
            <label style={labelStyle}>Required evidence (one per line)</label>
            <textarea style={{ ...inputStyle, minHeight: 50 }} value={s.evidence} onChange={e => setStage(i, { evidence: e.target.value })} />
            <label style={labelStyle}>Coaching prompts (one per line)</label>
            <textarea style={{ ...inputStyle, minHeight: 50 }} value={s.prompts} onChange={e => setStage(i, { prompts: e.target.value })} />
          </div>
        ))}
        <button type="button" style={ghostBtn} onClick={() => setForm(f => f && ({ ...f, stages: [...f.stages, newStage(f.stages.length + 1)] }))}>+ Add stage</button>

        <div style={{ ...labelStyle, marginTop: 18 }}>Your wording for behaviors</div>
        <div style={{ color: 'var(--ink-dim)', fontSize: 12, marginBottom: 6 }}>Reps see your name instead of the app name. Leave blank to keep the app wording.</div>
        {usedBehaviors.length === 0 && <div style={{ color: 'var(--ink-dim)', fontSize: 12.5 }}>Choose behaviors for your stages first.</div>}
        {usedBehaviors.map(k => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12.5 }}>{label(k)}</span>
            <input style={inputStyle} placeholder="English" value={form.terms[k]?.en ?? ''} onChange={e => setTerm('terms', k, 'en', e.target.value)} />
            <input style={inputStyle} dir="rtl" placeholder="Arabic" value={form.terms[k]?.ar ?? ''} onChange={e => setTerm('terms', k, 'ar', e.target.value)} />
          </div>
        ))}

        <div style={{ ...labelStyle, marginTop: 18 }}>Your names for the five capability scores</div>
        {CAPABILITY_DIMENSIONS.map(d => (
          <div key={d} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12.5 }}>{d}</span>
            <input style={inputStyle} placeholder="English" value={form.dims[d]?.en ?? ''} onChange={e => setTerm('dims', d, 'en', e.target.value)} />
            <input style={inputStyle} dir="rtl" placeholder="Arabic" value={form.dims[d]?.ar ?? ''} onChange={e => setTerm('dims', d, 'ar', e.target.value)} />
          </div>
        ))}

        {errors.length > 0 && <ul role="alert" style={{ color: 'var(--red)', fontSize: 12.5, margin: '12px 0 0', paddingLeft: 18 }}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button style={primaryBtn} disabled={busy} onClick={async () => {
            const ok = await call(editing ? `/api/methodologies/${editing.id}` : '/api/methodologies', editing ? 'PUT' : 'POST', toPayload(form))
            if (ok) { setForm(null); setEditing(null); await load() }
          }}>{busy ? 'Saving...' : 'Save draft'}</button>
          <button style={ghostBtn} onClick={() => { setForm(null); setEditing(null); setErrors([]) }}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={primaryBtn} onClick={() => { setForm(BLANK); setEditing(null); setErrors([]) }}>+ New methodology</button>
        <span style={{ color: 'var(--ink-dim)', fontSize: 12 }}>or start from:</span>
        {METHODOLOGY_TEMPLATES.map(t => <button key={t.id} style={ghostBtn} onClick={() => { setForm(fromBody(t.body as Body)); setEditing(null); setErrors([]) }}>{t.label}</button>)}
      </div>
      {errors.length > 0 && <ul role="alert" style={{ color: 'var(--red)', fontSize: 12.5, paddingLeft: 18 }}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      {list === null && <div style={{ color: 'var(--ink-dim)', marginTop: 12 }}>Loading...</div>}
      {list?.length === 0 && <div style={{ color: 'var(--ink-dim)', marginTop: 12, fontSize: 13 }}>No methodology yet. Without one, reps see the app wording.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
        {list?.map(m => (
          <div key={m.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <strong>{m.name} <span style={{ color: 'var(--ink-dim)', fontWeight: 400 }}>v{m.version}</span></strong>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: STATUS_COLOR[m.status] }}>{m.status}</span>
            </div>
            <div style={{ color: 'var(--ink-dim)', fontSize: 12.5, margin: '4px 0 10px' }}>{m.stages.map(s => s.name.en ?? s.id).join(' → ')}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={ghostBtn} onClick={() => { setForm(fromBody(m as unknown as Body)); setEditing(m); setErrors([]) }}>Edit</button>
              {m.status !== 'active' && <button style={ghostBtn} disabled={busy} onClick={async () => { if (await call(`/api/methodologies/${m.id}`, 'PATCH', { status: 'active' })) await load() }}>Activate</button>}
              {m.status === 'active' && <button style={ghostBtn} disabled={busy} onClick={async () => { if (await call(`/api/methodologies/${m.id}`, 'PATCH', { status: 'archived' })) await load() }}>Deactivate</button>}
              {m.status === 'draft' && <button style={ghostBtn} disabled={busy} onClick={async () => { if (await call(`/api/methodologies/${m.id}`, 'PATCH', { status: 'archived' })) await load() }}>Archive</button>}
              {m.status === 'archived' && <button style={ghostBtn} disabled={busy} onClick={async () => { if (await call(`/api/methodologies/${m.id}`, 'PATCH', { status: 'draft' })) await load() }}>Restore as draft</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
