'use client'
import { useEffect, useState } from 'react'
import { RUBRIC_DOMAINS, RUBRIC_VERSION, type RubricDomain } from '@/lib/validation/rubric'
import { emptyForm, formToItems, itemsToForm, type RatingForm } from '@/lib/validation/rating-form'
import type { CaseSummary, SavedRating, Turn } from '@/lib/validation/assessor-service'

const LABEL: Record<RubricDomain, string> = {
  opening: 'Opening and purpose', questioning: 'Questioning', active_listening: 'Active listening',
  clinical_communication: 'Clinical communication', objection_handling: 'Objection handling', style_adaptation: 'Style adaptation',
  state_adaptation: 'State adaptation', composure: 'Composure', closing: 'Closing',
}
const SCALE = '1 clearly ineffective · 2 weak · 3 adequate, with gaps · 4 good · 5 strong, shown more than once · NO = not observable (not a low score)'
const box = { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 16, padding: 18, marginTop: 20 }
const field = { padding: 8, background: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 8 }

interface Detail { scenarioType: CaseSummary['scenarioType']; turns: Turn[]; rating: SavedRating | null }

export default function AssessorPanel() {
  const [cases, setCases] = useState<CaseSummary[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [form, setForm] = useState<RatingForm>(emptyForm())
  const [unscorable, setUnscorable] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function call(path: string, init?: RequestInit) {
    const res = await fetch(path, { ...init, cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Request failed')
    return data
  }
  async function loadCases() {
    try { setCases((await call('/api/validation/assessor/cases')).cases) } catch (e) { setMessage(String((e as Error).message)) }
  }
  useEffect(() => { void loadCases() }, [])

  async function openCase(id: string) {
    setOpen(id); setDetail(null); setMessage('')
    try {
      const d: Detail = await call(`/api/validation/assessor/cases/${id}`)
      setDetail(d); setForm(d.rating ? itemsToForm(d.rating.items) : emptyForm()); setUnscorable(d.rating?.unscorable ?? false)
    } catch (e) {
      setMessage((e as Error).message === 'transcript_not_available' ? 'This case has no transcript that can be shown here yet.' : `Could not open the case (${(e as Error).message}).`)
    }
  }

  async function save(submit: boolean) {
    if (!open) return
    setBusy(true); setMessage('')
    try {
      const out = await call(`/api/validation/assessor/cases/${open}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unscorable, items: unscorable ? [] : formToItems(form), submit }),
      })
      setMessage(out.status === 'submitted' ? 'Submitted. This rating can no longer be changed.' : 'Draft saved.')
      await loadCases()
      if (out.status === 'submitted') setDetail(d => d && { ...d, rating: { id: out.ratingId, status: 'submitted', unscorable, items: [] } })
    } catch (e) { setMessage(`Not saved: ${(e as Error).message}`) } finally { setBusy(false) }
  }

  const locked = detail?.rating?.status === 'submitted'
  const set = (d: RubricDomain, patch: Partial<RatingForm[RubricDomain]>) => setForm(f => ({ ...f, [d]: { ...f[d], ...patch } }))

  return <div>
    <section style={box}>
      <h2 style={{ marginTop: 0 }}>Your cases</h2>
      {cases === null && !message && <p>Loading…</p>}
      {cases?.length === 0 && <p>No cases are assigned to you.</p>}
      {cases?.map((c, i) => <button key={c.assignmentId} type="button" onClick={() => openCase(c.assignmentId)} aria-current={open === c.assignmentId}
        style={{ ...field, display: 'block', width: '100%', textAlign: 'left', marginBottom: 8, cursor: 'pointer', fontWeight: open === c.assignmentId ? 700 : 400 }}>
        Case {i + 1} · scenario {c.scenarioType} · {c.ratingStatus === 'submitted' ? 'submitted' : c.ratingStatus === 'draft' ? 'draft saved' : 'not started'}
      </button>)}
    </section>

    {message && <p role="status" style={{ marginTop: 16 }}>{message}</p>}

    {detail && <>
      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Conversation · scenario {detail.scenarioType}</h2>
        <ol start={0} style={{ paddingLeft: 0, listStyle: 'none', maxHeight: 360, overflow: 'auto' }}>
          {detail.turns.map(t => <li key={t.index} style={{ marginBottom: 8 }}><strong>{t.index}</strong> · {t.role === 'rep' ? 'Representative' : 'Doctor'}: <span dir="auto">{t.text}</span></li>)}
        </ol>
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Your rating <small style={{ fontWeight: 400 }}>(rubric {RUBRIC_VERSION})</small></h2>
        <p style={{ marginTop: 0 }}>{SCALE}. Rate the representative, not the doctor&apos;s reaction. Cite the turn numbers that show it; a 5 needs at least two. If unsure between two ratings, give the lower and say why.</p>
        <label><input type="checkbox" checked={unscorable} disabled={locked} onChange={e => setUnscorable(e.target.checked)} /> This case cannot be rated (for example, the transcript is unusable)</label>
        {!unscorable && RUBRIC_DOMAINS.map(d => <fieldset key={d} disabled={locked} style={{ border: '1px solid var(--line)', borderRadius: 12, margin: '14px 0', padding: 12 }}>
          <legend>{LABEL[d]}</legend>
          <label>Rating{' '}
            <select value={form[d].answer} onChange={e => set(d, { answer: e.target.value as RatingForm[RubricDomain]['answer'] })} style={field}>
              <option value="">—</option>{['1', '2', '3', '4', '5'].map(n => <option key={n} value={n}>{n}</option>)}<option value="NO">NO (not observable)</option>
            </select>
          </label>{' '}
          <label>Turns{' '}<input value={form[d].turns} onChange={e => set(d, { turns: e.target.value })} placeholder="e.g. 2, 5" style={{ ...field, width: 110 }} inputMode="numeric" /></label>{' '}
          <label><input type="checkbox" checked={form[d].uncertain} onChange={e => set(d, { uncertain: e.target.checked })} /> unsure (audio or transcript quality)</label>
          <textarea value={form[d].note} maxLength={300} onChange={e => set(d, { note: e.target.value })} placeholder="Note (optional, 300 characters)" rows={2} style={{ ...field, display: 'block', width: '100%', marginTop: 8 }} />
        </fieldset>)}
        {!locked && <p style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" disabled={busy} onClick={() => save(false)} style={field}>Save draft</button>
          <button type="button" disabled={busy} onClick={() => { if (window.confirm('Submit this rating? It can no longer be changed.')) void save(true) }} style={{ ...field, fontWeight: 700 }}>Submit</button>
        </p>}
        {locked && <p>This rating is submitted and cannot be changed.</p>}
      </section>
    </>}
  </div>
}
