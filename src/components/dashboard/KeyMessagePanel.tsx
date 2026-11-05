'use client'
import { useCallback, useEffect, useState } from 'react'
import { KM_MAX_MESSAGE, KM_STYLES, type Versions } from '@/lib/key-message'

interface Shared { repName: string | null; style: string; text: string; createdAt: string }
interface Msg { id: string; text: string; mode?: string; versions: Versions | null; dueDate: string | null; total: number; completed: number; shared: Shared[] }
interface Data { role: string; messages: Msg[]; reps: Array<{ id: string; name: string | null }> }

const inputStyle: React.CSSProperties = { background: 'var(--surface-subtle)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', color: 'var(--ink)', fontFamily: 'var(--sans)', fontSize: 13.5, outline: 'none', width: '100%' }
const labelStyle: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', margin: '12px 0 6px', display: 'block' }
const primaryBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', background: 'var(--cyan)', color: 'var(--on-accent)', borderRadius: 10, padding: '10px 14px', fontWeight: 700 }
const ghostBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', border: '1px solid var(--line)', background: 'none', color: 'var(--ink-dim)', borderRadius: 10, padding: '8px 12px' }
const STYLE_NAME: Record<string, string> = { driver: 'Driver', expressive: 'Expressive', amiable: 'Amiable', analytical: 'Analytical' }

/** Manager side of key-message practice. Sets a message for everyone or chosen reps, and sees who finished.
 * Hidden unless the feature is on. A rep's practice text appears here only when that rep chose to share it. */
export default function KeyMessagePanel() {
  const [data, setData] = useState<Data | null>(null)
  const [text, setText] = useState('')
  const [due, setDue] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [everyone, setEveryone] = useState(true)
  const [mode, setMode] = useState<'written' | 'verbal'>('written')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/key-messages').catch(() => null)
    if (!res?.ok) return
    const d = await res.json() as Data
    if (d.role === 'manager') setData(d)
  }, [])
  useEffect(() => { void load() }, [load])
  if (!data) return null

  const create = async () => {
    setBusy(true); setError(null)
    const res = await fetch('/api/key-messages', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, mode, dueDate: due || null, repIds: everyone ? null : picked }),
    }).catch(() => null)
    setBusy(false)
    if (!res?.ok) { setError(res?.status === 429 ? 'Too many requests. Wait a little and try again.' : 'Could not create the message. Try again.'); return }
    setText(''); setDue(''); setPicked([]); setEveryone(true); setMode('written')
    await load()
  }
  const chip = (on: boolean): React.CSSProperties => ({ ...ghostBtn, textTransform: 'none', borderColor: on ? 'var(--cyan)' : 'var(--line)', color: on ? 'var(--cyan)' : 'var(--ink-dim)' })

  return (
    <div>
      <p style={{ color: 'var(--ink-dim)', fontSize: 13, lineHeight: 1.55, margin: '0 0 8px' }}>
        Set one key message. The app writes a version for each of the four social styles, and each rep practises by writing their own.
        You see who finished. You see a rep&apos;s text only if they choose to share it.
      </p>

      <label style={labelStyle} htmlFor="km-text">Key message</label>
      <textarea id="km-text" rows={3} maxLength={KM_MAX_MESSAGE} value={text} onChange={e => setText(e.target.value)} style={inputStyle} />
      <div style={{ ...labelStyle, margin: '4px 0 0' }}>{KM_MAX_MESSAGE - text.length} characters left</div>

      <span style={labelStyle}>Reps</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" aria-pressed={everyone} onClick={() => setEveryone(true)} style={chip(everyone)}>Everyone</button>
        {data.reps.map(r => {
          const on = !everyone && picked.includes(r.id)
          return <button type="button" key={r.id} aria-pressed={on} onClick={() => { setEveryone(false); setPicked(p => p.includes(r.id) ? p.filter(x => x !== r.id) : [...p, r.id]) }} style={chip(on)}>{r.name ?? 'Rep'}</button>
        })}
      </div>

      <span style={labelStyle}>How should reps practise it?</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" aria-pressed={mode === 'written'} onClick={() => setMode('written')} style={chip(mode === 'written')}>Write it</button>
        <button type="button" aria-pressed={mode === 'verbal'} onClick={() => setMode('verbal')} style={chip(mode === 'verbal')}>Say it aloud</button>
      </div>

      <label style={labelStyle} htmlFor="km-due">Due date (optional)</label>
      <input id="km-due" type="date" value={due} onChange={e => setDue(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />

      <div style={{ marginTop: 14 }}>
        <button disabled={busy || !text.trim() || (!everyone && picked.length === 0)} onClick={() => void create()} style={primaryBtn}>{busy ? 'Writing the four versions...' : 'Create and assign'}</button>
      </div>
      {error && <p role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}

      <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
        {data.messages.length === 0 && <p style={{ color: 'var(--ink-dim)', fontSize: 13 }}>No key messages set yet.</p>}
        {data.messages.map(m => (
          <div key={m.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12 }}>
            <div dir="auto" style={{ fontSize: 14, lineHeight: 1.5 }}>{m.text}</div>
            <div style={{ ...labelStyle, margin: '8px 0' }}>
              {m.completed} of {m.total} finished{m.mode === 'verbal' ? ' · say it aloud' : ''}{m.dueDate ? ` · due ${m.dueDate}` : ''}
            </div>
            <button onClick={() => setOpenId(openId === m.id ? null : m.id)} aria-expanded={openId === m.id} style={ghostBtn}>{openId === m.id ? 'Hide details' : 'Show details'}</button>
            {openId === m.id && <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              {m.versions && KM_STYLES.map(k => (
                <div key={k} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>
                  <div style={{ ...labelStyle, margin: '0 0 4px' }}>{STYLE_NAME[k]}</div>
                  <div dir="auto" style={{ fontSize: 13.5, lineHeight: 1.5 }}>{m.versions![k]}</div>
                </div>
              ))}
              <div style={{ ...labelStyle, margin: '8px 0 0' }}>Shared by reps ({m.shared.length})</div>
              {m.shared.length === 0 && <div style={{ color: 'var(--ink-dim)', fontSize: 13 }}>No rep has shared an attempt.</div>}
              {m.shared.map((s, i) => (
                <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>
                  <div style={{ ...labelStyle, margin: '0 0 4px' }}>{s.repName ?? 'Rep'} · {STYLE_NAME[s.style] ?? s.style}</div>
                  <div dir="auto" style={{ fontSize: 13.5, lineHeight: 1.5 }}>{s.text}</div>
                </div>
              ))}
            </div>}
          </div>
        ))}
      </div>
    </div>
  )
}
