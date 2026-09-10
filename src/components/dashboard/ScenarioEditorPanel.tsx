'use client'
import { useEffect, useState } from 'react'
import { OBJECTION_CATEGORIES, type ObjectionCategory } from '@/lib/social-style'
import type { CompanyScenario, StyleKey } from '@/types/game'

const STYLE_LABEL: Record<StyleKey, string> = {
  driver: 'Driver', expressive: 'Expressive', amiable: 'Amiable', analytical: 'Analytical',
}
const STYLE_KEYS: StyleKey[] = ['driver', 'expressive', 'amiable', 'analytical']

const CATEGORY_LABEL: Record<ObjectionCategory, string> = {
  evidence: 'Evidence / data', price: 'Price / cost', safety: 'Safety / side effects',
  time: 'Time / too busy', competitor: 'Competitor', logistics: 'Stock / delivery',
  trust: 'Trust / relationship',
}

const STATUS_COLOR: Record<CompanyScenario['status'], string> = {
  draft: 'var(--ink-dim)', approved: 'var(--green)', archived: 'var(--red)',
}

interface DraftOpt { t: string; r: 'win' | 'escalate'; why: string }

function emptyOpts(): DraftOpt[] {
  return [{ t: '', r: 'win', why: '' }, { t: '', r: 'escalate', why: '' }]
}

const chip = (active: boolean, color = 'var(--cyan)'): React.CSSProperties => ({
  cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.05em',
  border: `1px solid ${active ? color : 'var(--line)'}`, borderRadius: 18,
  padding: '6px 12px', color: active ? color : 'var(--ink-dim)',
  background: active ? `${color}1a` : 'transparent', touchAction: 'manipulation',
})
const inputStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,.3)', border: '1px solid var(--line)', borderRadius: 10,
  padding: '10px 12px', color: 'var(--ink)', fontFamily: 'var(--sans)', fontSize: 13.5, outline: 'none', width: '100%',
}
const labelStyle: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 6, display: 'block' }
const primaryBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', background: 'var(--cyan)', color: '#04121f', borderRadius: 10, padding: '11px 14px', fontWeight: 700 }
const ghostBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--line)', background: 'none', color: 'var(--ink-dim)', borderRadius: 10, padding: '11px 14px' }

/**
 * Manager-only: author a company scenario as a draft, then approve it
 * (compliance sign-off) so reps can see it, or archive it to pull it without
 * deleting the record. Reps only ever see 'approved' rows (enforced server-side).
 */
export default function ScenarioEditorPanel() {
  const [scenarios, setScenarios] = useState<CompanyScenario[] | null>(null)
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<StyleKey>('driver')
  const [category, setCategory] = useState<ObjectionCategory>('evidence')
  const [name, setName] = useState('')
  const [crisis, setCrisis] = useState('')
  const [q, setQ] = useState('')
  const [opts, setOpts] = useState<DraftOpt[]>(emptyOpts())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/scenarios').catch(() => null)
    if (res?.ok) setScenarios(await res.json())
  }
  useEffect(() => { void load() }, [])

  function resetForm() {
    setStyle('driver'); setCategory('evidence'); setName(''); setCrisis(''); setQ(''); setOpts(emptyOpts()); setError(null)
  }

  function updateOpt(i: number, patch: Partial<DraftOpt>) {
    setOpts(prev => prev.map((o, oi) => oi === i ? { ...o, ...patch } : o))
  }

  async function submit() {
    setSaving(true); setError(null)
    const res = await fetch('/api/scenarios', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ style, category, name, crisis, q, opts }),
    }).catch(() => null)
    setSaving(false)
    if (!res?.ok) { setError('Check every field is filled in, and one option is marked as the winning response.'); return }
    resetForm(); setOpen(false)
    void load()
  }

  async function setStatus(id: string, status: CompanyScenario['status']) {
    setBusyId(id)
    await fetch(`/api/scenarios/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    }).catch(() => null)
    setBusyId(null)
    void load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ color: 'var(--ink-dim)', fontSize: 12.5, lineHeight: 1.5 }}>
        Author objection drills specific to your products and territory. Draft it, then approve it — only approved scenarios reach reps.
      </div>

      {scenarios === null ? (
        <div style={{ color: 'var(--ink-dim)', fontSize: 13 }}>…</div>
      ) : scenarios.length === 0 ? (
        <div style={{ color: 'var(--ink-dim)', fontSize: 12.5 }}>No company scenarios yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {scenarios.map(s => (
            <div key={s.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', background: 'rgba(0,0,0,.18)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <span style={{ fontSize: 13.5, fontWeight: 700 }}>{s.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-dim)', marginInlineStart: 8 }}>{STYLE_LABEL[s.style]} · {CATEGORY_LABEL[s.category]}</span>
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: STATUS_COLOR[s.status] }}>{s.status}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-dim)', marginTop: 6, lineHeight: 1.4 }}>{s.crisis}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {s.status !== 'approved' && (
                  <button disabled={busyId === s.id} onClick={() => setStatus(s.id, 'approved')} style={{ ...ghostBtn, fontSize: 10.5, padding: '6px 10px', border: '1px solid var(--green)', color: 'var(--green)' }}>
                    Approve
                  </button>
                )}
                {s.status !== 'archived' && (
                  <button disabled={busyId === s.id} onClick={() => setStatus(s.id, 'archived')} style={{ ...ghostBtn, fontSize: 10.5, padding: '6px 10px' }}>
                    Archive
                  </button>
                )}
                {s.status === 'archived' && (
                  <button disabled={busyId === s.id} onClick={() => setStatus(s.id, 'draft')} style={{ ...ghostBtn, fontSize: 10.5, padding: '6px 10px' }}>
                    Back to draft
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {open ? (
        <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, background: 'rgba(0,0,0,.18)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <span style={labelStyle}>Doctor style this drill targets</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STYLE_KEYS.map(k => (
                <button key={k} style={chip(style === k)} onClick={() => setStyle(k)}>{STYLE_LABEL[k]}</button>
              ))}
            </div>
          </div>
          <div>
            <span style={labelStyle}>Objection category — drives the bias callout the rep sees</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {OBJECTION_CATEGORIES.map(k => (
                <button key={k} style={chip(category === k, 'var(--purple)')} onClick={() => setCategory(k)}>{CATEGORY_LABEL[k]}</button>
              ))}
            </div>
          </div>
          <div><span style={labelStyle}>Scenario name</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Dr. Rossi — pricing pushback" style={inputStyle} />
          </div>
          <div><span style={labelStyle}>Objection / crisis line (what the doctor says)</span>
            <textarea value={crisis} onChange={e => setCrisis(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' as const }} />
          </div>
          <div><span style={labelStyle}>Prompt shown to the rep</span>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="How do you respond?" style={inputStyle} />
          </div>
          <div>
            <span style={labelStyle}>Response options — mark exactly one as the winning response</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {opts.map((o, i) => (
                <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={{ ...chip(o.r === 'win', 'var(--green)'), flex: 1 }} onClick={() => updateOpt(i, { r: 'win' })}>Win</button>
                    <button style={{ ...chip(o.r === 'escalate', 'var(--red)'), flex: 1 }} onClick={() => updateOpt(i, { r: 'escalate' })}>Escalate</button>
                    {opts.length > 2 && (
                      <button style={ghostBtn} onClick={() => setOpts(prev => prev.filter((_, oi) => oi !== i))}>✕</button>
                    )}
                  </div>
                  <input value={o.t} onChange={e => updateOpt(i, { t: e.target.value })} placeholder="What the rep says" style={inputStyle} />
                  <input value={o.why} onChange={e => updateOpt(i, { why: e.target.value })} placeholder="Why this works or backfires" style={inputStyle} />
                </div>
              ))}
              {opts.length < 4 && (
                <button style={ghostBtn} onClick={() => setOpts(prev => [...prev, { t: '', r: 'escalate', why: '' }])}>+ Add option</button>
              )}
            </div>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={submit} disabled={saving} style={{ ...primaryBtn, flex: 1, opacity: saving ? .6 : 1 }}>{saving ? 'Saving…' : 'Save draft'}</button>
            <button onClick={() => { setOpen(false); resetForm() }} style={ghostBtn}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} style={{ cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'rgba(56,214,255,.06)', borderRadius: 10, padding: '12px 16px', touchAction: 'manipulation' }}>
          ＋ New scenario
        </button>
      )}
    </div>
  )
}
