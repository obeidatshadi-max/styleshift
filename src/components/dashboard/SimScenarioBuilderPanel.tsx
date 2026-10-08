'use client'
import { useCallback, useEffect, useState } from 'react'
import TextSimulation from '@/components/game/TextSimulation'
import { SPECIALTIES, SPECIALTY_ORDER } from '@/lib/game-data'
import { previewScenario, doctorFromScenario } from '@/lib/scenario-persona'
import { OBJECTION_TYPES, type ObjectionType } from '@/lib/voice-partner-core'
import { COMPETENCIES, type Competency } from '@/schemas/observation'
import {
  ADOPTION_ATTITUDES, RELATIONSHIP_STAGES, SENIORITIES, SIM_DIFFICULTIES,
  type SimScenario, type SimScenarioRecord,
} from '@/schemas/scenario'
import { defaultScoringConfig } from '@/scoring/config'

const BEHAVIORS = Object.values(defaultScoringConfig.competencies).flatMap(c => Object.keys(c.behaviors))
const STYLES = ['driver', 'expressive', 'amiable', 'analytical'] as const
const STATUS_COLOR = { draft: 'var(--ink-dim)', approved: 'var(--green)', archived: 'var(--red)' } as const
const label = (v: string) => v.replace(/_/g, ' ')

const chip = (active: boolean): React.CSSProperties => ({
  cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.05em',
  border: `1px solid ${active ? 'var(--cyan)' : 'var(--line)'}`, borderRadius: 18, padding: '6px 12px',
  color: active ? 'var(--cyan)' : 'var(--ink-dim)', background: active ? 'rgba(0,229,255,.1)' : 'transparent', touchAction: 'manipulation',
})
const inputStyle: React.CSSProperties = { background: 'rgba(0,0,0,.3)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', color: 'var(--ink)', fontFamily: 'var(--sans)', fontSize: 13.5, outline: 'none', width: '100%' }
const labelStyle: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', margin: '12px 0 6px', display: 'block' }
const primaryBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', background: 'var(--cyan)', color: '#04121f', borderRadius: 10, padding: '10px 14px', fontWeight: 700 }
const ghostBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', border: '1px solid var(--line)', background: 'none', color: 'var(--ink-dim)', borderRadius: 10, padding: '8px 12px' }

interface Form {
  name: string; description: string; therapeuticArea: string; productName: string
  specialty: string; seniority: string; style: string; relationshipStage: string; adoptionAttitude: string
  mainConcerns: string; hiddenConcern: string; competitorSituation: string; patientPopulation: string
  visitPurpose: string; learningObjectives: string; expectedCompetencies: Competency[]
  difficulty: string; language: string; availableTimeMin: string; desiredNextStep: string
  required: ObjectionType[]; optional: ObjectionType[]; focus: string[]; coachInstructions: string
}

const EMPTY: Form = {
  name: '', description: '', therapeuticArea: '', productName: '',
  specialty: 'cardiology', seniority: 'specialist', style: 'analytical', relationshipStage: 'new', adoptionAttitude: 'neutral',
  mainConcerns: '', hiddenConcern: '', competitorSituation: '', patientPopulation: '',
  visitPurpose: '', learningObjectives: '', expectedCompetencies: ['discovery'],
  difficulty: 'normal', language: 'en', availableTimeMin: '5', desiredNextStep: '',
  required: [], optional: [], focus: [], coachInstructions: '',
}

const lines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean)

function toPayload(f: Form) {
  const orNull = (s: string) => (s.trim() ? s.trim() : null)
  return {
    name: f.name, description: f.description, therapeuticArea: f.therapeuticArea, productName: orNull(f.productName),
    physician: { specialty: f.specialty, seniority: f.seniority, style: f.style, relationshipStage: f.relationshipStage, adoptionAttitude: f.adoptionAttitude },
    mainConcerns: lines(f.mainConcerns), hiddenConcern: orNull(f.hiddenConcern), competitorSituation: orNull(f.competitorSituation),
    patientPopulation: orNull(f.patientPopulation), visitPurpose: f.visitPurpose, learningObjectives: lines(f.learningObjectives),
    expectedCompetencies: f.expectedCompetencies, difficulty: f.difficulty, language: f.language,
    // Only the Iraqi doctor voice exists today.
    arabicVariant: f.language === 'ar' ? 'iraqi' : undefined,
    availableTimeMin: Number(f.availableTimeMin), desiredNextStep: orNull(f.desiredNextStep),
    requiredObjections: f.required.map(type => ({ type, text: null })),
    optionalObjections: f.optional.map(type => ({ type, text: null })),
    scoringCriteria: f.focus.map(behavior => ({ behavior, emphasis: 'focus' })),
    coachInstructions: orNull(f.coachInstructions),
  }
}

function toForm(s: SimScenario): Form {
  return {
    name: s.name, description: s.description, therapeuticArea: s.therapeuticArea, productName: s.productName ?? '',
    specialty: s.physician.specialty, seniority: s.physician.seniority, style: s.physician.style,
    relationshipStage: s.physician.relationshipStage, adoptionAttitude: s.physician.adoptionAttitude,
    mainConcerns: s.mainConcerns.join('\n'), hiddenConcern: s.hiddenConcern ?? '', competitorSituation: s.competitorSituation ?? '',
    patientPopulation: s.patientPopulation ?? '', visitPurpose: s.visitPurpose, learningObjectives: s.learningObjectives.join('\n'),
    expectedCompetencies: s.expectedCompetencies, difficulty: s.difficulty, language: s.language,
    availableTimeMin: String(s.availableTimeMin), desiredNextStep: s.desiredNextStep ?? '',
    required: s.requiredObjections.map(o => o.type), optional: s.optionalObjections.map(o => o.type),
    focus: s.scoringCriteria.filter(c => c.emphasis === 'focus').map(c => c.behavior), coachInstructions: s.coachInstructions ?? '',
  }
}

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v])

function Select({ value, options, onChange }: { value: string; options: ReadonlyArray<{ v: string; l: string }>; onChange: (v: string) => void }) {
  return <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>{options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
}
const opts = (list: readonly string[]) => list.map(v => ({ v, l: label(v) }))

interface Assignment { id: string; assigneeRepId: string | null }

/**
 * Manager-only builder for AI-Doctor simulation scenarios. All logic lives in
 * the schema, API and persona mapper - this component only edits a form and
 * calls the API. Basic fields are always shown; everything optional sits under
 * "More options".
 */
export default function SimScenarioBuilderPanel({ reps }: { reps: Array<{ id: string; name: string | null }> }) {
  const [list, setList] = useState<SimScenarioRecord[] | null>(null)
  const [disabled, setDisabled] = useState(false)
  const [form, setForm] = useState<Form | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [testing, setTesting] = useState<SimScenarioRecord | null>(null)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [assignee, setAssignee] = useState('')

  const load = useCallback(async () => {
    const res = await fetch('/api/sim-scenarios').catch(() => null)
    if (!res || res.status === 404) { setDisabled(true); return }
    if (res.ok) setList(await res.json())
  }, [])
  useEffect(() => { void load() }, [load])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => (f ? { ...f, [k]: v } : f))

  async function call(url: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true); setErrors([])
    const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(() => null)
    setBusy(false)
    if (!res) { setErrors(['Network error']); return false }
    if (!res.ok) { const d = await res.json().catch(() => null); setErrors(d?.errors ?? ['Request failed']); return false }
    return true
  }

  async function save() {
    if (!form) return
    const ok = await call(editingId ? `/api/sim-scenarios/${editingId}` : '/api/sim-scenarios', editingId ? 'PUT' : 'POST', toPayload(form))
    if (ok) { setForm(null); setEditingId(null); await load() }
  }
  async function status(id: string, st: string) { if (await call(`/api/sim-scenarios/${id}`, 'PATCH', { status: st })) await load() }
  async function duplicate(id: string) { if (await call(`/api/sim-scenarios/${id}/duplicate`, 'POST')) await load() }
  async function openAssign(id: string) {
    setAssigning(id); setAssignee('')
    const res = await fetch(`/api/sim-scenarios/${id}/assign`).catch(() => null)
    setAssignments(res?.ok ? await res.json() : [])
  }
  async function addAssignment(id: string) {
    if (await call(`/api/sim-scenarios/${id}/assign`, 'POST', { repId: assignee === '' ? null : assignee })) await openAssign(id)
  }
  async function removeAssignment(id: string, assignmentId: string) {
    if (await call(`/api/sim-scenarios/${id}/assign`, 'DELETE', { assignmentId })) await openAssign(id)
  }

  if (disabled) return <div style={{ color: 'var(--ink-dim)', fontSize: 13 }}>The scenario builder is not enabled for this deployment.</div>
  if (testing) {
    return (
      <div>
        <button style={ghostBtn} onClick={() => setTesting(null)}>← Back to scenarios</button>
        <TextSimulation doctor={doctorFromScenario(testing, 'test')} scenarioId={testing.id} onDone={() => setTesting(null)} />
      </div>
    )
  }

  if (form) {
    return (
      <div>
        <div style={{ ...labelStyle, marginTop: 0 }}>{editingId ? 'Edit scenario' : 'New scenario'}</div>
        {editingId && <div style={{ color: 'var(--ink-dim)', fontSize: 12 }}>Saving an edit returns an approved scenario to draft. Approve it again to release it to reps.</div>}
        <label style={labelStyle}>Name</label>
        <input style={inputStyle} value={form.name} maxLength={120} onChange={e => set('name', e.target.value)} />
        <label style={labelStyle}>Therapeutic area</label>
        <input style={inputStyle} value={form.therapeuticArea} onChange={e => set('therapeuticArea', e.target.value)} />
        <label style={labelStyle}>Doctor specialty</label>
        <Select value={form.specialty} onChange={v => set('specialty', v)} options={SPECIALTY_ORDER.map(s => ({ v: s, l: SPECIALTIES[s].name }))} />
        <label style={labelStyle}>Communication style</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{STYLES.map(s => <button key={s} type="button" style={chip(form.style === s)} onClick={() => set('style', s)}>{s}</button>)}</div>
        <label style={labelStyle}>Difficulty</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{SIM_DIFFICULTIES.map(d => <button key={d} type="button" style={chip(form.difficulty === d)} onClick={() => set('difficulty', d)}>{label(d)}</button>)}</div>
        <label style={labelStyle}>Visit purpose</label>
        <input style={inputStyle} value={form.visitPurpose} onChange={e => set('visitPurpose', e.target.value)} />
        <label style={labelStyle}>Doctor main concerns (one per line)</label>
        <textarea style={{ ...inputStyle, minHeight: 64 }} value={form.mainConcerns} onChange={e => set('mainConcerns', e.target.value)} />
        <label style={labelStyle}>Learning objectives (one per line)</label>
        <textarea style={{ ...inputStyle, minHeight: 64 }} value={form.learningObjectives} onChange={e => set('learningObjectives', e.target.value)} />
        <label style={labelStyle}>Skills to practise</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{COMPETENCIES.map(c => <button key={c} type="button" style={chip(form.expectedCompetencies.includes(c))} onClick={() => set('expectedCompetencies', toggle(form.expectedCompetencies, c))}>{label(c)}</button>)}</div>
        <label style={labelStyle}>Language</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={chip(form.language === 'en')} onClick={() => set('language', 'en')}>English</button>
          <button type="button" style={chip(form.language === 'ar')} onClick={() => set('language', 'ar')}>Arabic (Iraqi)</button>
        </div>
        <label style={labelStyle}>Time available (minutes)</label>
        <input style={{ ...inputStyle, maxWidth: 120 }} inputMode="numeric" value={form.availableTimeMin} onChange={e => set('availableTimeMin', e.target.value)} />

        <button type="button" style={{ ...ghostBtn, marginTop: 16 }} onClick={() => setMore(m => !m)}>{more ? 'Fewer options ▲' : 'More options ▼'}</button>
        {more && <div>
          <label style={labelStyle}>Description</label>
          <textarea style={{ ...inputStyle, minHeight: 56 }} value={form.description} onChange={e => set('description', e.target.value)} />
          <label style={labelStyle}>Product name (generic; no clinical claims here)</label>
          <input style={inputStyle} value={form.productName} onChange={e => set('productName', e.target.value)} />
          <label style={labelStyle}>Doctor seniority</label>
          <Select value={form.seniority} onChange={v => set('seniority', v)} options={opts(SENIORITIES)} />
          <label style={labelStyle}>Relationship stage</label>
          <Select value={form.relationshipStage} onChange={v => set('relationshipStage', v)} options={opts(RELATIONSHIP_STAGES)} />
          <label style={labelStyle}>Attitude to adopting the product</label>
          <Select value={form.adoptionAttitude} onChange={v => set('adoptionAttitude', v)} options={opts(ADOPTION_ATTITUDES)} />
          <label style={labelStyle}>Hidden concern (only revealed if the rep earns it)</label>
          <input style={inputStyle} value={form.hiddenConcern} onChange={e => set('hiddenConcern', e.target.value)} />
          <label style={labelStyle}>Competitor situation</label>
          <input style={inputStyle} value={form.competitorSituation} onChange={e => set('competitorSituation', e.target.value)} />
          <label style={labelStyle}>Patient population</label>
          <input style={inputStyle} value={form.patientPopulation} onChange={e => set('patientPopulation', e.target.value)} />
          <label style={labelStyle}>Desired next step</label>
          <input style={inputStyle} value={form.desiredNextStep} onChange={e => set('desiredNextStep', e.target.value)} />
          <label style={labelStyle}>Required objections (always raised)</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{OBJECTION_TYPES.map(o => <button key={o} type="button" style={chip(form.required.includes(o))} onClick={() => setForm(f => f && ({ ...f, required: toggle(f.required, o), optional: f.optional.filter(x => x !== o) }))}>{label(o)}</button>)}</div>
          <label style={labelStyle}>Optional objections (may appear)</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{OBJECTION_TYPES.filter(o => !form.required.includes(o)).map(o => <button key={o} type="button" style={chip(form.optional.includes(o))} onClick={() => set('optional', toggle(form.optional, o))}>{label(o)}</button>)}</div>
          <label style={labelStyle}>Behaviors to focus the feedback on</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{BEHAVIORS.map(b => <button key={b} type="button" style={chip(form.focus.includes(b))} onClick={() => set('focus', toggle(form.focus, b))}>{label(b)}</button>)}</div>
          <label style={labelStyle}>Coach instructions</label>
          <textarea style={{ ...inputStyle, minHeight: 56 }} value={form.coachInstructions} onChange={e => set('coachInstructions', e.target.value)} />
        </div>}

        {errors.length > 0 && <ul role="alert" style={{ color: 'var(--red)', fontSize: 12.5, margin: '12px 0 0', paddingLeft: 18 }}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button style={primaryBtn} disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save draft'}</button>
          <button style={ghostBtn} onClick={() => { setForm(null); setEditingId(null); setErrors([]) }}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <button style={primaryBtn} onClick={() => { setForm(EMPTY); setEditingId(null); setMore(false); setErrors([]) }}>+ New scenario</button>
      {errors.length > 0 && <ul role="alert" style={{ color: 'var(--red)', fontSize: 12.5, paddingLeft: 18 }}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      {list === null && <div style={{ color: 'var(--ink-dim)', marginTop: 12 }}>Loading...</div>}
      {list?.length === 0 && <div style={{ color: 'var(--ink-dim)', marginTop: 12, fontSize: 13 }}>No scenarios yet. Create one to give your reps a repeatable AI Doctor practice.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
        {list?.map(s => {
          const preview = previewId === s.id ? previewScenario(s) : null
          return (
            <div key={s.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <strong>{s.name}</strong>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: STATUS_COLOR[s.status] }}>{s.status}</span>
              </div>
              <div style={{ color: 'var(--ink-dim)', fontSize: 12.5, margin: '4px 0 10px' }}>{s.physician.style} · {label(s.difficulty)} · {s.language === 'ar' ? 'Arabic' : 'English'} · {s.availableTimeMin} min</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={ghostBtn} onClick={() => setPreviewId(preview ? null : s.id)}>{preview ? 'Hide preview' : 'Preview'}</button>
                <button style={ghostBtn} onClick={() => setTesting(s)}>Test</button>
                <button style={ghostBtn} onClick={() => { const { id: _i, companyId: _c, status: _s, createdBy: _b, createdAt: _t, ...cfg } = s; void [_i, _c, _s, _b, _t]; setForm(toForm(cfg)); setEditingId(s.id); setMore(true); setErrors([]) }}>Edit</button>
                <button style={ghostBtn} disabled={busy} onClick={() => duplicate(s.id)}>Duplicate</button>
                {s.status !== 'approved' && s.status !== 'archived' && <button style={ghostBtn} disabled={busy} onClick={() => status(s.id, 'approved')}>Approve</button>}
                {s.status === 'approved' && <button style={ghostBtn} disabled={busy} onClick={() => openAssign(s.id)}>Assign</button>}
                {s.status === 'archived' ? <button style={ghostBtn} disabled={busy} onClick={() => status(s.id, 'draft')}>Restore</button> : <button style={ghostBtn} disabled={busy} onClick={() => status(s.id, 'archived')}>Archive</button>}
              </div>
              {preview && (
                <div style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.55 }}>
                  <div style={{ fontWeight: 700 }}>{preview.headline}</div>
                  <ul style={{ paddingLeft: 18, margin: '6px 0' }}>{[...preview.doctorBrief, ...preview.engine].map((l, i) => <li key={i}>{l}</li>)}</ul>
                  {preview.warnings.length > 0 && <ul style={{ paddingLeft: 18, margin: 0, color: 'var(--amber, #e8c060)' }}>{preview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
                </div>
              )}
              {assigning === s.id && (
                <div style={{ marginTop: 10 }}>
                  <div style={labelStyle}>Assigned to</div>
                  {assignments.length === 0 && <div style={{ color: 'var(--ink-dim)', fontSize: 12.5 }}>Nobody yet. Reps only see approved, assigned scenarios.</div>}
                  {assignments.map(a => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                      <span>{a.assigneeRepId ? (reps.find(r => r.id === a.assigneeRepId)?.name ?? 'Rep') : 'Whole company'}</span>
                      <button style={ghostBtn} onClick={() => removeAssignment(s.id, a.id)}>Remove</button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <select value={assignee} onChange={e => setAssignee(e.target.value)} style={inputStyle}>
                      <option value="">Whole company</option>
                      {reps.map(r => <option key={r.id} value={r.id}>{r.name ?? 'Rep'}</option>)}
                    </select>
                    <button style={primaryBtn} disabled={busy} onClick={() => addAssignment(s.id)}>Assign</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
