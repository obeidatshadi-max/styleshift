'use client'
import { useCallback, useEffect, useState } from 'react'
import { useGameData, useT } from '@/lib/i18n'
import { FEEDBACK_FIELDS, KM_MAX_MESSAGE, KM_STYLES, type Feedback, type KmStyle, type Versions } from '@/lib/key-message'
import { bodyText, card, ghostBtn, primaryBtn, sectionLabel, smallLabel } from './TextSimulation'

interface Msg { id: string; text: string; mode: string; versions: Versions | null; dueDate: string | null; doctorId: string | null; fromManager: boolean; completed: boolean }
interface Doc { id: string; name: string; style: KmStyle | null }
interface Data { role: string; messages: Msg[]; doctors: Doc[] }

const field: React.CSSProperties = { background: 'var(--surface-subtle)', border: '1px solid var(--line)', borderRadius: 10, padding: 10, color: 'var(--ink)', width: '100%', fontFamily: 'var(--sans)' }

/** Home card. Hidden unless the feature is on and the caller is a rep. The rep reads one message in the
 * four styles, writes their own version and gets feedback. Verbal practice is not part of this version. */
export default function KeyMessagePractice() {
  const t = useT()
  const { STYLES } = useGameData()
  const [data, setData] = useState<Data | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [style, setStyle] = useState<KmStyle>('driver')
  const [text, setText] = useState('')
  const [share, setShare] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [newText, setNewText] = useState('')
  const [newDoctor, setNewDoctor] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/key-messages').catch(() => null)
    if (!res?.ok) return
    const d = await res.json() as Data
    if (d.role === 'rep') setData(d)
  }, [])
  useEffect(() => { void load() }, [load])

  if (!data) return null

  const styleOf = (m: Msg) => data.doctors.find(d => d.id === m.doctorId)
  const toggle = (m: Msg) => {
    setOpen(open === m.id ? null : m.id)
    setText(''); setFeedback(null); setError(null); setShare(false)
    setStyle(styleOf(m)?.style ?? 'driver')
  }

  const submit = async (m: Msg) => {
    setBusy(true); setError(null)
    const res = await fetch(`/api/key-messages/${m.id}/practice`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ style, text, share }) }).catch(() => null)
    setBusy(false)
    if (!res?.ok) { setError(t(res?.status === 429 ? 'km.err.rate' : 'km.err.feedback')); return }
    const body = await res.json() as { feedback: Feedback }
    setFeedback(body.feedback)
    setData(d => d && { ...d, messages: d.messages.map(x => x.id === m.id ? { ...x, completed: true } : x) })
  }

  const create = async () => {
    setAdding(true); setError(null)
    const res = await fetch('/api/key-messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: newText, doctorId: newDoctor || null }) }).catch(() => null)
    setAdding(false)
    if (!res?.ok) { setError(t(res?.status === 429 ? 'km.err.rate' : 'km.err.create')); return }
    setNewText(''); setNewDoctor('')
    await load()
  }

  return (
    <div style={card}>
      <div style={sectionLabel}>{t('km.title')}</div>
      <p style={bodyText}>{t('km.intro')}</p>
      <p style={{ ...bodyText, color: 'var(--ink-dim)' }}>{t('km.disclaimer')}</p>

      <div style={{ display: 'grid', gap: 12, margin: '12px 0' }}>
        {data.messages.map(m => {
          const doc = styleOf(m)
          const isOpen = open === m.id
          return (
            <div key={m.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12 }}>
              <div style={smallLabel}>
                {t(m.fromManager ? 'km.fromManager' : 'km.mine')}
                {m.dueDate ? ` · ${t('km.due', { date: m.dueDate })}` : ''}
                {m.completed ? ` · ${t('km.done')}` : ''}
              </div>
              <p dir="auto" style={bodyText}>{m.text}</p>
              <button onClick={() => toggle(m)} aria-expanded={isOpen} style={ghostBtn}>{isOpen ? t('km.close') : t('km.practise')}</button>

              {isOpen && m.versions && <div style={{ marginTop: 12 }}>
                <div style={smallLabel}>{t('km.versions')}</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {KM_STYLES.map(k => (
                    <div key={k} style={{ border: `1px solid ${doc?.style === k ? 'var(--cyan)' : 'var(--line)'}`, borderRadius: 10, padding: 10 }}>
                      <div style={smallLabel}>{STYLES[k].name}{doc?.style === k ? ` · ${t('km.customerStyle', { name: doc.name })}` : ''}</div>
                      <div dir="auto" style={bodyText}>{m.versions![k]}</div>
                    </div>
                  ))}
                </div>

                <div style={{ ...smallLabel, marginTop: 12 }}>{t('km.pick')}</div>
                <div role="radiogroup" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {KM_STYLES.map(k => (
                    <button key={k} role="radio" aria-checked={style === k} onClick={() => setStyle(k)}
                      style={{ ...ghostBtn, padding: '8px 12px', background: style === k ? 'var(--cyan)' : 'transparent', color: style === k ? 'var(--on-accent)' : 'var(--cyan)' }}>{STYLES[k].name}</button>
                  ))}
                </div>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={smallLabel}>{t('km.write')}</span>
                  <textarea dir="auto" rows={4} value={text} maxLength={1200} placeholder={t('km.placeholder')} onChange={e => setText(e.target.value)} style={field} />
                </label>
                {m.fromManager && (
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} />
                    <span style={bodyText}>{t('km.share')}</span>
                  </label>
                )}
                <button disabled={busy || !text.trim()} onClick={() => void submit(m)} style={{ ...primaryBtn, width: 'auto', marginTop: 6 }}>{busy ? t('km.sending') : t('km.submit')}</button>
                {error && <p role="alert" style={{ ...bodyText, color: 'var(--red)' }}>{error}</p>}

                {feedback && <div role="status" style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                  {FEEDBACK_FIELDS.map(f => (
                    <div key={f}><div style={smallLabel}>{t(`km.fb.${f}`)}</div><div dir="auto" style={bodyText}>{feedback[f]}</div></div>
                  ))}
                </div>}
              </div>}
            </div>
          )
        })}
      </div>

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        <div style={smallLabel}>{t('km.new')}</div>
        <label style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
          <span style={smallLabel}>{t('km.new.text')}</span>
          <textarea dir="auto" rows={3} value={newText} maxLength={KM_MAX_MESSAGE} onChange={e => setNewText(e.target.value)} style={field} />
          <span style={smallLabel}>{t('km.new.limit', { n: KM_MAX_MESSAGE - newText.length })}</span>
        </label>
        {data.doctors.length > 0 && (
          <label style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
            <span style={smallLabel}>{t('km.new.customer')}</span>
            <select value={newDoctor} onChange={e => setNewDoctor(e.target.value)} style={field}>
              <option value="">{t('km.new.none')}</option>
              {data.doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        )}
        <button disabled={adding || !newText.trim()} onClick={() => void create()} style={{ ...primaryBtn, width: 'auto' }}>{adding ? t('km.new.creating') : t('km.new.create')}</button>
        {!open && error && <p role="alert" style={{ ...bodyText, color: 'var(--red)' }}>{error}</p>}
      </div>
    </div>
  )
}
