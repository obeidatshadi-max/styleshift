'use client'
import { useEffect, useMemo, useState } from 'react'
import {
  CHECK_LABEL, CRITERIA_KEYS, DEFAULT_CRITERIA, evaluate, parseCriteria, type CheckKey, type Criteria, type Evidence,
} from '@/lib/certification'

// Manager view: set the requirements, see each rep against them, issue or withdraw certificates,
// and read the audit trail. English only, like the other dashboard panels.

interface RepRow { id: string; name: string | null; evidence: Evidence }
interface Certificate {
  id: string; repId: string; repName: string; program: string; criteriaMet: boolean; exceptionReason: string | null
  verifyCode: string; issuedAt: string; revokedAt: string | null; revokeReason: string | null
}
interface AuditEvent { id: number; actor: string | null; action: string; details: Record<string, unknown> | null; at: string }
interface Overview { windowDays: number; reps: RepRow[]; certificates: Certificate[]; audit: AuditEvent[] }

const box: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }
const input: React.CSSProperties = { padding: 8, background: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 8, width: '100%' }
const chip = (ok: boolean): React.CSSProperties => ({ fontFamily: 'var(--mono)', fontSize: 12, padding: '2px 8px', borderRadius: 999, border: `1px solid ${ok ? 'var(--green)' : 'var(--red)'}`, color: ok ? 'var(--green)' : 'var(--red)', whiteSpace: 'nowrap' })
const day = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const time = (s: string) => new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function describeEvent(e: AuditEvent): string {
  const d = e.details ?? {}
  const program = String(d.program ?? '')
  const rep = String(d.rep_name ?? '')
  if (e.action === 'certification.issued')
    return `Issued “${program}” to ${rep}${d.exception_reason ? ` as an exception: ${String(d.exception_reason)}` : ''}`
  if (e.action === 'certification.revoked') return `Withdrew “${program}” from ${rep}: ${String(d.reason ?? '')}`
  return e.action
}

export default function CertificationPanel({ initial }: { initial?: Overview }) {
  const [data, setData] = useState<Overview | null>(initial ?? null)
  const [failed, setFailed] = useState(false)
  const [program, setProgram] = useState('Field Ready')
  const [criteria, setCriteria] = useState<Criteria>(DEFAULT_CRITERIA)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [exceptionFor, setExceptionFor] = useState<string | null>(null)
  const [reasons, setReasons] = useState<Record<string, string>>({})

  async function load() {
    try {
      const res = await fetch('/api/certifications', { cache: 'no-store' })
      if (!res.ok) { setFailed(true); return }
      setData(await res.json()); setFailed(false)
    } catch { setFailed(true) }
  }
  useEffect(() => { if (!initial) void load() }, [initial]) // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = useMemo(() => parseCriteria(criteria), [criteria])
  const programKey = program.trim().toLowerCase()
  const live = (repId: string) => data?.certificates.find(c => c.repId === repId && !c.revokedAt && c.program.trim().toLowerCase() === programKey)

  async function send(method: 'POST' | 'PATCH', body: unknown, key: string, done: string) {
    setBusy(key); setMessage('')
    try {
      const res = await fetch('/api/certifications', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const out = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) {
        setMessage(out.error === 'already_certified' ? 'This rep already holds that certificate.'
          : out.error === 'criteria_not_met' ? 'The rep does not meet the requirements. Give a written reason to issue an exception.'
          : out.error ?? 'Could not save. Try again.')
        return
      }
      setMessage(done); setExceptionFor(null); await load()
    } catch { setMessage('Could not save. Try again.') } finally { setBusy(null) }
  }

  if (failed) return <p role="alert">Could not load certification.</p>
  if (!data) return <p role="status">Loading…</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <section aria-label="Requirements" style={box}>
        <label style={{ display: 'block', fontSize: 14, marginBottom: 10 }}>Certificate name
          <input style={{ ...input, marginTop: 4 }} maxLength={120} value={program} onChange={e => setProgram(e.target.value)} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }}>
          {CRITERIA_KEYS.map((k: CheckKey) => (
            <label key={k} style={{ fontSize: 13 }}>{CHECK_LABEL[k]}
              <input type="number" min={0} style={{ ...input, marginTop: 4 }} value={criteria[k]}
                onChange={e => setCriteria({ ...criteria, [k]: e.target.value === '' ? Number.NaN : Number(e.target.value) })} />
            </label>
          ))}
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink-dim)', margin: '8px 0 0' }}>
          0 means not required. Evidence is read live from each rep’s practice records, which the rep’s own account writes, so treat a pass as a guide, not proof. You decide whether to issue. Voice figures cover the last {data.windowDays} days.
          {!parsed.ok && <strong style={{ color: 'var(--red)' }}> {parsed.error}.</strong>}
        </p>
      </section>

      {data.reps.length === 0 && <p style={{ color: 'var(--ink-dim)' }}>No reps in your team yet.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.reps.map(rep => {
          const eligibility = parsed.ok ? evaluate(rep.evidence, parsed.criteria) : null
          const held = live(rep.id)
          return (
            <article key={rep.id} style={box}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <strong>{rep.name ?? 'Rep'}</strong>
                {held ? <span style={chip(true)}>Certified {day(held.issuedAt)}</span>
                  : eligibility && <span style={chip(eligibility.met)}>{eligibility.met ? 'Eligible' : 'Not yet'}</span>}
              </div>
              {eligibility && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
                  {eligibility.checks.map(c => (
                    <span key={c.key} style={chip(c.passed)}>{CHECK_LABEL[c.key]}: {c.actual ?? 'no data'} / {c.required}</span>
                  ))}
                </div>
              )}
              {!held && eligibility && (
                eligibility.met ? (
                  <button disabled={busy === rep.id || !program.trim()} onClick={() => send('POST', { repId: rep.id, programName: program, criteria }, rep.id, `Certificate issued to ${rep.name ?? 'the rep'}.`)}>Issue certificate</button>
                ) : exceptionFor === rep.id ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input aria-label={`Exception reason for ${rep.name ?? 'rep'}`} style={{ ...input, flex: '1 1 240px', width: 'auto' }} maxLength={500} placeholder="Why is an exception justified?"
                      value={reasons[rep.id] ?? ''} onChange={e => setReasons({ ...reasons, [rep.id]: e.target.value })} />
                    <button disabled={busy === rep.id || !(reasons[rep.id] ?? '').trim() || !program.trim()}
                      onClick={() => send('POST', { repId: rep.id, programName: program, criteria, exceptionReason: reasons[rep.id] }, rep.id, `Exception certificate issued to ${rep.name ?? 'the rep'}.`)}>Issue as exception</button>
                    <button onClick={() => setExceptionFor(null)}>Cancel</button>
                  </div>
                ) : <button onClick={() => setExceptionFor(rep.id)}>Issue as exception…</button>
              )}
            </article>
          )
        })}
      </div>
      <p role="status" style={{ minHeight: 20 }}>{message}</p>

      <section aria-label="Issued certificates">
        <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>Issued certificates</h3>
        {data.certificates.length === 0 && <p style={{ color: 'var(--ink-dim)' }}>None yet.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.certificates.map(c => (
            <article key={c.id} style={box}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span><strong>{c.repName}</strong> · {c.program} · {day(c.issuedAt)}{!c.criteriaMet && ' · exception'}</span>
                <span style={chip(!c.revokedAt)}>{c.revokedAt ? `Withdrawn ${day(c.revokedAt)}` : 'Valid'}</span>
              </div>
              {c.exceptionReason && <div style={{ fontSize: 13, color: 'var(--ink-dim)', marginTop: 4 }}>Exception: {c.exceptionReason}</div>}
              {c.revokeReason && <div style={{ fontSize: 13, color: 'var(--ink-dim)', marginTop: 4 }}>Reason withdrawn: {c.revokeReason}</div>}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                <a href={`/verify/${c.verifyCode}`} target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)' }}>Open certificate</a>
                {!c.revokedAt && <>
                  <input aria-label={`Reason to withdraw ${c.repName}'s certificate`} style={{ ...input, flex: '1 1 220px', width: 'auto' }} maxLength={500} placeholder="Reason to withdraw"
                    value={reasons[c.id] ?? ''} onChange={e => setReasons({ ...reasons, [c.id]: e.target.value })} />
                  <button disabled={busy === c.id || !(reasons[c.id] ?? '').trim()}
                    onClick={() => send('PATCH', { id: c.id, reason: reasons[c.id] }, c.id, 'Certificate withdrawn.')}>Withdraw</button>
                </>}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section aria-label="Audit trail">
        <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>Audit trail</h3>
        <p style={{ fontSize: 13, color: 'var(--ink-dim)', margin: '0 0 8px' }}>Written automatically when a certificate is issued or withdrawn. Entries cannot be edited or deleted.</p>
        {data.audit.length === 0 && <p style={{ color: 'var(--ink-dim)' }}>No events yet.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.audit.map(e => (
            <div key={e.id} style={{ ...box, fontSize: 14, lineHeight: 1.5 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-dim)' }}>{time(e.at)} · {e.actor ?? 'Unknown'}</span>
              <div>{describeEvent(e)}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
