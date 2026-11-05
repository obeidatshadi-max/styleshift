'use client'
import { useEffect, useState } from 'react'

// Manager view: give a rep who forgot their PIN a new one. English only, like the other dashboard panels.

interface RepRow { id: string; name: string | null; kind: 'mobile' | 'email'; mobile: string | null }
interface Issued { repName: string | null; mobile: string; pin: string }

const box: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }

export default function RepPinPanel({ initial }: { initial?: RepRow[] }) {
  const [reps, setReps] = useState<RepRow[] | null>(initial ?? null)
  const [failed, setFailed] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [issued, setIssued] = useState<Issued | null>(null)
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (initial) return
    fetch('/api/rep-pins', { cache: 'no-store' }).then(r => (r.ok ? r.json() : Promise.reject())).then(d => setReps(d.reps)).catch(() => setFailed(true))
  }, [initial])

  async function reset(rep: RepRow) {
    setBusy(rep.id); setMessage(''); setIssued(null); setCopied(false)
    try {
      const res = await fetch('/api/rep-pins', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ repId: rep.id }) })
      const out = await res.json().catch(() => ({})) as { pin?: string; repName?: string | null; mobile?: string; error?: string }
      if (!res.ok || !out.pin) {
        setMessage(res.status === 429 ? 'Too many resets this hour. Try again later.' : out.error === 'not_a_pin_account' ? 'This rep signs in with an email, not a PIN.' : 'Could not reset the PIN. Nothing was changed.')
        return
      }
      setIssued({ repName: out.repName ?? rep.name, mobile: out.mobile ?? rep.mobile ?? '', pin: out.pin })
      setConfirming(null)
    } catch { setMessage('Could not reset the PIN. Nothing was changed.') } finally { setBusy(null) }
  }

  async function copy(pin: string) {
    try { await navigator.clipboard.writeText(pin); setCopied(true) } catch { setCopied(false) }
  }

  if (failed) return <p role="alert">Could not load your reps.</p>
  if (!reps) return <p role="status">Loading…</p>
  if (reps.length === 0) return <p style={{ color: 'var(--ink-dim)' }}>No reps in your team yet.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 13, color: 'var(--ink-dim)', margin: 0 }}>
        A rep who forgot their PIN signs in with their mobile number and a new 6-digit PIN that you give them. The old PIN stops working straight away. Each reset is written to the audit trail.
      </p>

      {issued && (
        <section role="status" aria-label="New PIN" style={{ ...box, borderColor: 'var(--green)' }}>
          <div style={{ fontSize: 14 }}>New PIN for <strong>{issued.repName ?? 'the rep'}</strong>{issued.mobile && <> (mobile {issued.mobile})</>}:</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '8px 0', flexWrap: 'wrap' }}>
            <code data-testid="new-pin" style={{ fontFamily: 'var(--mono)', fontSize: 28, letterSpacing: '.2em', direction: 'ltr' }}>{issued.pin}</code>
            <button type="button" onClick={() => void copy(issued.pin)}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-dim)' }}>Give it to them privately (not in a group chat). It is shown only now and cannot be looked up again.</div>
          <button type="button" style={{ marginTop: 8 }} onClick={() => { setIssued(null); setCopied(false) }}>Done</button>
        </section>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {reps.map(rep => (
          <article key={rep.id} style={box}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span><strong>{rep.name ?? 'Rep'}</strong>{rep.mobile && <span style={{ color: 'var(--ink-dim)', fontSize: 13 }}> · {rep.mobile}</span>}</span>
              {rep.kind === 'mobile'
                ? confirming === rep.id
                  ? <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 13 }}>Reset {rep.name ?? 'this rep'}'s PIN? The old PIN stops working now.</span>
                      <button type="button" disabled={busy === rep.id} onClick={() => void reset(rep)}>Yes, reset</button>
                      <button type="button" disabled={busy === rep.id} onClick={() => setConfirming(null)}>Cancel</button>
                    </span>
                  : <button type="button" onClick={() => { setConfirming(rep.id); setMessage('') }}>Reset PIN</button>
                : <span style={{ fontSize: 13, color: 'var(--ink-dim)' }}>Signs in with email: uses “Forgot password?”</span>}
            </div>
          </article>
        ))}
      </div>
      <p role="alert" style={{ minHeight: 20, margin: 0, color: 'var(--red)' }}>{message}</p>
    </div>
  )
}
