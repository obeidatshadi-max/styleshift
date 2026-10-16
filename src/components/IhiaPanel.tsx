'use client'
import { useEffect, useState, type FormEvent } from 'react'
import { REGIONS, type Knowledge } from '@/lib/ihia/core'
import type { SuggestedExpression } from '@/lib/ihia/suggestions'

type Entry = Knowledge & { review_note: string }
const field = { display: 'block', width: '100%', padding: 10, margin: '6px 0 14px', background: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 8 }
const box = { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 16, padding: 18, marginTop: 20 }
const blank = { expression: '', literal_meaning: '', contextual_meaning: '', specialty: 'general', region: 'baghdad', kind: 'dialect', uncertainty: '', source_reference: '' }
export default function IhiaPanel({ reviewer }: { reviewer: boolean }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [edit, setEdit] = useState<Entry | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>(blank)
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [history, setHistory] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [situation, setSituation] = useState('')
  const [suggestionRegion, setSuggestionRegion] = useState('baghdad')
  const [suggestions, setSuggestions] = useState<SuggestedExpression[]>([])
  const [savedSuggestions, setSavedSuggestions] = useState<Set<string>>(new Set())
  const [suggesting, setSuggesting] = useState(false)
  async function request(path: string, init?: RequestInit) {
    const res = await fetch(path, { ...init, cache: 'no-store' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Request failed')
    return data
  }
  async function refresh() {
    try { setEntries(await request('/api/ihia/knowledge')) } catch (e) { setMessage(String(e)) }
  }
  useEffect(() => { if (reviewer) void refresh() }, [reviewer]) // eslint-disable-line react-hooks/exhaustive-deps
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(''); setResult(null)
    const form = new FormData(event.currentTarget)
    try { setResult(await request('/api/ihia/interpret', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: form.get('text'), region: form.get('region') }) })) }
    catch (e) { setMessage(String(e)) } finally { setBusy(false) }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('')
    const note = new FormData(event.currentTarget).get('note')
    try {
      await request('/api/ihia/knowledge', { method: edit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edit ? { id: edit.id, version: edit.version, action: 'correct', entry: draft, review_note: note } : draft) })
      setEdit(null); setDraft(blank); setMessage('Saved as draft. Approval is required.'); await refresh()
    } catch (e) { setMessage(String(e)) } finally { setBusy(false) }
  }
  async function review(event: FormEvent<HTMLFormElement>, entry: Entry) {
    event.preventDefault(); setBusy(true); setMessage('')
    const form = new FormData(event.currentTarget)
    try {
      await request('/api/ihia/knowledge', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, version: entry.version, action: form.get('decision'), review_note: form.get('note') }) })
      await refresh(); setMessage('Review saved. Start a new voice session to load the new vocabulary.')
    } catch (e) { setMessage(String(e)) } finally { setBusy(false) }
  }
  async function suggest(context = situation) {
    setBusy(true); setSuggesting(true); setMessage(''); setSuggestions([]); setSavedSuggestions(new Set())
    try {
      const data = await request('/api/ihia/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ situation: context, region: suggestionRegion }) })
      setSuggestions(data.suggestions)
    } catch (e) { setMessage(String(e)) } finally { setBusy(false); setSuggesting(false) }
  }
  async function saveSuggestion(suggestion: SuggestedExpression) {
    setBusy(true); setMessage('')
    try {
      await request('/api/ihia/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(suggestion) })
      setSavedSuggestions(previous => new Set([...previous, suggestion.expression]))
      await refresh(); setMessage('Saved as an unapproved draft. Verify the expression before approving it.')
    } catch (e) { setMessage(String(e)) } finally { setBusy(false) }
  }
  return <>
    <section style={box} aria-label="AI expression discovery">
      <h2>Let the AI suggest expressions</h2>
      <p>You do not need to remember a phrase. Choose a situation or describe one in Arabic or English.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '14px 0' }}>
        {['Busy doctor', 'Asking for evidence', 'Pharmacy stock', 'Using a new app'].map(topic =>
          <button key={topic} type="button" disabled={busy} onClick={() => { setSituation(topic); void suggest(topic) }}>{topic}</button>)}
      </div>
      <form onSubmit={event => { event.preventDefault(); void suggest() }}>
        <label>Describe the situation (optional)<textarea dir="auto" maxLength={1000} style={field} value={situation}
          placeholder="For example: I want to ask a busy doctor for a short meeting."
          onChange={event => setSituation(event.target.value)} /></label>
        <label>Suggested region<select style={field} value={suggestionRegion} onChange={event => setSuggestionRegion(event.target.value)}>
          {REGIONS.map(region => <option key={region}>{region}</option>)}
        </select></label>
        <button disabled={busy}>{suggesting ? 'Finding Iraqi expressions…' : 'Suggest Iraqi expressions'}</button>
      </form>
      <p style={{ marginTop: 12 }}>Use general or synthetic situations; do not include patient details. AI suggestions are unverified and do not enter the voice agent until reviewed and approved.</p>
      <div aria-live="polite">{suggestions.map((suggestion, index) => <article key={index} style={box}>
        <p style={{ color: 'var(--amber)' }}>AI suggestion · unverified</p>
        <h3 lang="ar" dir="rtl">{suggestion.expression}</h3>
        <p>Literal meaning: {suggestion.literal_meaning}</p><p>Possible meaning: {suggestion.contextual_meaning}</p>
        <p lang="ar" dir="rtl">{suggestion.example}</p><p>Uncertainty: {suggestion.uncertainty}</p>
        <p>{suggestion.source_reference}</p>
        {reviewer && <button type="button" disabled={busy || savedSuggestions.has(suggestion.expression)}
          onClick={() => void saveSuggestion(suggestion)}>{savedSuggestions.has(suggestion.expression) ? 'Saved as draft' : 'Save as draft for review'}</button>}
      </article>)}</div>
    </section>
    <section style={box} aria-label="Interpret expression">
      <h2>Try an expression</h2>
      <form onSubmit={submit}>
        <label>Original utterance<textarea name="text" dir="auto" required maxLength={2000} style={field} /></label>
        <label>Region<select name="region" style={field}>{REGIONS.map(r => <option key={r}>{r}</option>)}</select></label>
        <button disabled={busy}>Interpret</button>
      </form>
      {result && <div aria-live="polite"><p dir="auto">{String(result.response)}</p><p>{String(result.uncertainty)}</p>
        <details><summary>Evidence and original utterance</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(result, null, 2)}</pre></details></div>}
    </section>
    <p role="status">{busy ? 'Working…' : message}</p>
    {reviewer && <section style={box}><h2>{edit ? 'Correct expression' : 'Add expression for review'}</h2>
      <form onSubmit={save}>
        {Object.entries(draft).map(([key, value]) => <label key={key}>{key.replaceAll('_', ' ')}
          {key === 'region' || key === 'kind' ? <select style={field} value={value} onChange={e => setDraft({ ...draft, [key]: e.target.value })}>
            {(key === 'region' ? REGIONS : ['dialect', 'medical', 'pharmacy', 'workflow']).map(o => <option key={o}>{o}</option>)}</select>
            : <input dir="auto" style={field} required maxLength={key === 'expression' ? 120 : 800} value={value} onChange={e => setDraft({ ...draft, [key]: e.target.value })} />}</label>)}
        {edit && <label>Correction reason<input style={field} name="note" required maxLength={800} /></label>}
        <button disabled={busy}>Save draft</button>{edit && <button type="button" onClick={() => { setEdit(null); setDraft(blank) }}>Cancel</button>}
      </form>
      <h2 style={{ marginTop: 24 }}>Review queue and approved vocabulary</h2>
      <p>Sources must support the contextual meaning. Do not enter patient information.</p>
      {entries.map(entry => <article key={entry.id} style={box}>
        <h3 dir="auto">{entry.expression}</h3><p>{entry.status} · version {entry.version} · {entry.region} · {entry.specialty}</p>
        <p dir="auto">Literal: {entry.literal_meaning}</p><p dir="auto">Context: {entry.contextual_meaning}</p>
        <p>Source: {entry.source_reference}</p><p>Uncertainty: {entry.uncertainty}</p><p>Review: {entry.review_note}</p>
        <button type="button" disabled={busy} onClick={() => { setEdit(entry); setDraft(Object.fromEntries(Object.keys(blank).map(k => [k, String(entry[k as keyof Entry])]))) }}>Correct</button>
        <button type="button" disabled={busy} onClick={async () => { try { setHistory(await request(`/api/ihia/knowledge?history=${encodeURIComponent(entry.id)}`)) } catch (e) { setMessage(String(e)) } }}>View history</button>
        <form onSubmit={event => review(event, entry)}>
          <label>Review reason<input name="note" required maxLength={800} style={field} /></label>
          <label>Decision<select name="decision" style={field}><option value="approved">Approve</option><option value="rejected">Reject / withdraw</option></select></label>
          <button disabled={busy}>Save review</button>
        </form>
      </article>)}
      {history !== null && <details open><summary>Version history</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(history, null, 2)}</pre></details>}
    </section>}
  </>
}
