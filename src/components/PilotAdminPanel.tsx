'use client'
import { useEffect, useState } from 'react'
import type { AnalysisReport } from '@/lib/validation/analysis'
import { DATA_SOURCES, MEMBER_ROLES, MIN_ASSESSORS, PHASES, SCENARIO_TYPES, SCENARIO_VERSIONS, SESSION_TYPES, type CaseRow, type Member, type Person, type Pilot } from '@/lib/validation/pilot-admin-service'

const box = { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 16, padding: 18, marginTop: 20 }
const field = { padding: 8, background: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 8 }

const num = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? 'n/a' : v.toFixed(d))
const interval = (i: { estimate: number | null; lower: number | null; upper: number | null; n: number; excluded: number }) =>
  `${num(i.estimate)} (95% interval ${num(i.lower)} to ${num(i.upper)}; ${i.n} pairs, ${i.excluded} left out)`

interface Detail { pilot: Pilot; versions: { rubric: string; methodology: string; protocol: string }; members: Member[]; cases: CaseRow[]; people: Person[] }

export default function PilotAdminPanel() {
  const [pilots, setPilots] = useState<Pilot[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [message, setMessage] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [analysis, setAnalysis] = useState<{ pilotStatus: string; interim: boolean; report: AnalysisReport } | null>(null)
  const [incidents, setIncidents] = useState('')
  const [gate, setGate] = useState('UNKNOWN')
  const [name, setName] = useState('')
  const [dataSource, setDataSource] = useState<string>('synthetic')
  const [memberId, setMemberId] = useState('')
  const [memberRole, setMemberRole] = useState<string>('assessor')
  const [c, setC] = useState({ repId: '', sessionType: 'ai_doctor_text', sessionId: '', scenarioType: 'A', scenarioVersion: 'v1', phase: 'baseline', seenBefore: false, assessorIds: [] as string[] })

  async function call(path: string, init?: RequestInit) {
    const res = await fetch(path, { ...init, cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Request failed')
    return data
  }
  const send = (path: string, body: unknown) => call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  async function loadPilots() { try { setPilots((await call('/api/validation/admin/pilots')).pilots) } catch (e) { setMessage((e as Error).message) } }
  async function loadDetail(id: string) { try { setDetail(await call(`/api/validation/admin/pilots/${id}`)) } catch (e) { setMessage((e as Error).message) } }
  useEffect(() => { void loadPilots() }, [])

  async function act(run: () => Promise<unknown>, done: string) {
    setBusy(true); setMessage(''); setWarnings([])
    try { await run(); setMessage(done); await loadPilots(); if (open) await loadDetail(open) } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) }
  }
  function openPilot(id: string) { setOpen(id); setDetail(null); setAnalysis(null); setMessage(''); setWarnings([]); void loadDetail(id) }

  const draft = detail?.pilot.status === 'draft'
  const assessors = detail?.members.filter(m => m.role === 'assessor') ?? []
  const nameOf = (id: string) => detail?.people.find(p => p.id === id)?.displayName ?? detail?.members.find(m => m.userId === id)?.displayName ?? 'Unnamed'

  return <div>
    <section style={box}>
      <h2 style={{ marginTop: 0 }}>Your pilots</h2>
      {pilots?.length === 0 && <p>No pilots yet.</p>}
      {pilots?.map(p => <button key={p.id} type="button" onClick={() => openPilot(p.id)} aria-current={open === p.id}
        style={{ ...field, display: 'block', width: '100%', textAlign: 'left', marginBottom: 8, cursor: 'pointer', fontWeight: open === p.id ? 700 : 400 }}>
        {p.name} · {p.status} · {p.dataSource} data
      </button>)}
      <form onSubmit={e => { e.preventDefault(); void act(async () => { const r = await send('/api/validation/admin/pilots', { name, dataSource }); setName(''); openPilot(r.id) }, 'Pilot created as a draft.') }} style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="New pilot name" maxLength={120} required style={{ ...field, flex: 1, minWidth: 180 }} aria-label="New pilot name" />
        <select value={dataSource} onChange={e => setDataSource(e.target.value)} style={field} aria-label="Data source">{DATA_SOURCES.map(d => <option key={d} value={d}>{d} data</option>)}</select>
        <button type="submit" disabled={busy} style={{ ...field, fontWeight: 700 }}>Create pilot</button>
      </form>
    </section>

    {message && <p role="status" style={{ marginTop: 16 }}>{message}</p>}
    {warnings.map(w => <p key={w} role="status" style={{ marginTop: 8 }}>⚠ {w}</p>)}

    {detail && <>
      <section style={box}>
        <h2 style={{ marginTop: 0 }}>{detail.pilot.name} <small style={{ fontWeight: 400 }}>· {detail.pilot.status} · {detail.pilot.dataSource} data</small></h2>
        <p style={{ marginTop: 0 }}>Rubric {detail.versions.rubric} · methodology {detail.versions.methodology} · protocol {detail.versions.protocol}. A pilot moves from draft to running to closed and never back. Cases can be added only while it is a draft.</p>
        {draft && <button type="button" disabled={busy} style={{ ...field, fontWeight: 700 }}
          onClick={() => { if (window.confirm('Start the pilot? Cases can no longer be added, and assessors will see their cases.')) void act(() => send(`/api/validation/admin/pilots/${detail.pilot.id}/status`, { status: 'running' }), 'Pilot is running.') }}>Start pilot</button>}
        {detail.pilot.status === 'running' && <button type="button" disabled={busy} style={{ ...field, fontWeight: 700 }}
          onClick={() => { if (window.confirm('Close the pilot? Ratings stop being accepted. This cannot be undone.')) void act(() => send(`/api/validation/admin/pilots/${detail.pilot.id}/status`, { status: 'closed' }), 'Pilot is closed.') }}>Close pilot</button>}
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>People</h2>
        <ul>{detail.members.map(m => <li key={m.userId + m.role}>{m.displayName} · {m.role}</li>)}</ul>
        {detail.pilot.status !== 'closed' && <form onSubmit={e => { e.preventDefault(); void act(() => send(`/api/validation/admin/pilots/${detail.pilot.id}/members`, { userId: memberId, role: memberRole }), 'Added.') }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={memberId} onChange={e => setMemberId(e.target.value)} required style={field} aria-label="Person"><option value="">Choose a person</option>{detail.people.map(p => <option key={p.id} value={p.id}>{p.displayName} ({p.role})</option>)}</select>
          <select value={memberRole} onChange={e => setMemberRole(e.target.value)} style={field} aria-label="Role">{MEMBER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select>
          <button type="submit" disabled={busy} style={field}>Add</button>
        </form>}
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Cases ({detail.cases.length})</h2>
        <ul>{detail.cases.map((k, i) => <li key={k.id}>Case {i + 1} · {nameOf(k.repId)} · scenario {k.scenarioType} · {k.phase} · {k.assessorIds.length} assessors</li>)}</ul>
        {draft && <form onSubmit={e => { e.preventDefault(); void act(async () => { const r = await send(`/api/validation/admin/pilots/${detail.pilot.id}/cases`, c); setWarnings(r.warnings ?? []) }, 'Case added.') }} style={{ display: 'grid', gap: 8 }}>
          <select value={c.repId} onChange={e => setC({ ...c, repId: e.target.value })} required style={field} aria-label="Representative"><option value="">Representative</option>{detail.people.map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={c.sessionType} onChange={e => setC({ ...c, sessionType: e.target.value })} style={field} aria-label="Session type">{SESSION_TYPES.map(s => <option key={s} value={s}>{s}</option>)}</select>
            <input value={c.sessionId} onChange={e => setC({ ...c, sessionId: e.target.value.trim() })} placeholder="Session id" required style={{ ...field, flex: 1, minWidth: 260 }} aria-label="Session id" />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={c.scenarioType} onChange={e => setC({ ...c, scenarioType: e.target.value })} style={field} aria-label="Scenario type">{SCENARIO_TYPES.map(s => <option key={s} value={s}>scenario {s}</option>)}</select>
            <select value={c.scenarioVersion} onChange={e => setC({ ...c, scenarioVersion: e.target.value })} style={field} aria-label="Scenario version">{SCENARIO_VERSIONS.map(s => <option key={s} value={s}>{s}</option>)}</select>
            <select value={c.phase} onChange={e => setC({ ...c, phase: e.target.value })} style={field} aria-label="Phase">{PHASES.map(s => <option key={s} value={s}>{s}</option>)}</select>
            <label><input type="checkbox" checked={c.seenBefore} onChange={e => setC({ ...c, seenBefore: e.target.checked })} /> seen this scenario before</label>
          </div>
          <fieldset style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 10 }}>
            <legend>Assessors (at least {MIN_ASSESSORS})</legend>
            {assessors.length === 0 && <p style={{ margin: 0 }}>Add people as assessors first.</p>}
            {assessors.map(a => <label key={a.userId} style={{ display: 'block' }}><input type="checkbox" checked={c.assessorIds.includes(a.userId)}
              onChange={e => setC({ ...c, assessorIds: e.target.checked ? [...c.assessorIds, a.userId] : c.assessorIds.filter(x => x !== a.userId) })} /> {a.displayName}</label>)}
          </fieldset>
          <button type="submit" disabled={busy} style={{ ...field, fontWeight: 700, justifySelf: 'start' }}>Add case</button>
        </form>}
      </section>
      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Results</h2>
        <p style={{ marginTop: 0 }}>Runs the analysis fixed in advance (methodology {detail.versions.methodology}). Read-only: it changes no rating. Two inputs cannot be computed from the stored data, so you enter them.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <input value={incidents} onChange={e => setIncidents(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Critical incidents (number)" style={field} aria-label="Critical incidents" inputMode="numeric" />
          <select value={gate} onChange={e => setGate(e.target.value)} style={field} aria-label="Security gate">{['UNKNOWN', 'PASS', 'CONDITIONAL', 'FAIL'].map(g => <option key={g} value={g}>security gate: {g}</option>)}</select>
          <button type="button" disabled={busy} style={{ ...field, fontWeight: 700 }}
            onClick={() => void act(async () => { setAnalysis(await call(`/api/validation/admin/pilots/${detail.pilot.id}/analysis?gate=${gate}${incidents ? `&incidents=${incidents}` : ''}`)) }, 'Analysis done.')}>Run analysis</button>
        </div>
        {analysis && <div>
          <p><strong>{analysis.report.label}</strong>{analysis.interim ? ' · INTERIM: the pilot is not closed' : ''} · recommendation: <strong>{analysis.report.recommendation.replace(/_/g, ' ')}</strong></p>
          {analysis.report.conditions.length > 0 && <p>Conditions: {analysis.report.conditions.join('; ')}</p>}
          <ul>
            <li>Cases: {analysis.report.counts.cases}, with two or more ratings: {analysis.report.counts.casesWithTwoRatings}, representatives: {analysis.report.counts.reps}</li>
            <li>Rater agreement (pooled weighted kappa): {interval(analysis.report.raterAgreement.pooledKappa)}</li>
            <li>AI against human (pooled weighted kappa): {interval(analysis.report.aiHumanAgreement.pooledKappa)}</li>
            <li>Unsupported AI claims: {analysis.report.claims.unsupported} of {analysis.report.claims.adjudicated}{analysis.report.claims.rate.p !== null ? ` (${num(analysis.report.claims.rate.p * 100, 1)}%, upper bound ${num((analysis.report.claims.rate.upper ?? 0) * 100, 1)}%)` : ''}</li>
            <li>Change from baseline to follow-up on an alternate scenario: {analysis.report.coachingChange.alternateScenario.n} representatives, mean difference {num(analysis.report.coachingChange.alternateScenario.meanDifference)}. {analysis.report.coachingChange.note}</li>
          </ul>
          <h3>Indicators</h3>
          <ul>{Object.entries(analysis.report.indicators).map(([k, v]) => <li key={k}><strong>{k}</strong>: {v.status.replace(/_/g, ' ')} · {v.detail}</li>)}</ul>
          <h3>Minimum data before any recommendation</h3>
          <ul>{Object.entries(analysis.report.minimums).map(([k, m]) => <li key={k}>{k}: {m.have ?? 'none'} of {m.need} {m.reached ? '✓' : '✗'}</li>)}</ul>
        </div>}
      </section>
    </>}
  </div>
}
