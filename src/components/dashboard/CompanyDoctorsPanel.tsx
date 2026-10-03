'use client'

import { useEffect, useState } from 'react'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import type { DoctorInput, StyleKey } from '@/types/game'

interface Rep { id: string; name: string | null }
interface SharedDoctor { id: string; name: string; source_notes: string; assignedReps: { id: string; name: string }[] }
const STYLE_KEYS: StyleKey[] = ['driver', 'expressive', 'amiable', 'analytical']
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,.3)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', color: 'var(--ink)', font: 'inherit' }
const labelStyle: React.CSSProperties = { display: 'grid', gap: 6, fontSize: 12.5, color: 'var(--ink-dim)' }
const primaryBtn: React.CSSProperties = { cursor: 'pointer', border: '1px solid var(--cyan)', background: 'var(--cyan)', color: '#04121f', borderRadius: 10, padding: '11px 14px', fontWeight: 700 }
const ghostBtn: React.CSSProperties = { cursor: 'pointer', border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink-dim)', borderRadius: 10, padding: '10px 12px' }

function emptyProfile(name = ''): DoctorInput {
  return {
    name, specialty: null, workplace: null, style: null, assertiveness: null, responsiveness: null,
    key_phrases: null, objections: [], objection_notes: null, notes: null,
    style_driver: null, style_expressive: null, style_amiable: null, style_analytical: null,
    hidden_concern: null, product_context: null, meeting_stage: null, available_time_min: null,
  }
}

export default function CompanyDoctorsPanel({ reps }: { reps: Rep[] }) {
  const [profiles, setProfiles] = useState<SharedDoctor[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [profile, setProfile] = useState<DoctorInput>(emptyProfile())
  const [sourceNotes, setSourceNotes] = useState('')
  const [recipients, setRecipients] = useState<string[]>(reps.map(r => r.id))
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const recorder = useAudioRecorder(null, 'en')

  async function load() {
    setLoading(true)
    const res = await fetch('/api/company-doctors').catch(() => null)
    if (res?.ok) setProfiles((await res.json()).profiles ?? [])
    setLoading(false)
  }
  useEffect(() => { void load(); return () => recorder.abort() }, []) // recorder lifecycle intentionally stable

  async function toggleRecording() {
    if (recording) { await recorder.stop(); setRecording(false); return }
    const ok = await recorder.start()
    if (ok) setRecording(true)
    else setError('Microphone unavailable. You can type the profile instead.')
  }

  async function transcribe() {
    const take = recorder.take()
    if (!take) return
    setBusy(true); setError('')
    const form = new FormData(); form.append('audio', take.blob)
    const res = await fetch('/api/transcribe', { method: 'POST', body: form }).catch(() => null)
    setBusy(false)
    if (!res?.ok) { setError('Voice transcription is unavailable. Please type the profile notes.'); return }
    const data = await res.json()
    setSourceNotes(prev => `${prev}${prev ? '\n' : ''}${String(data.text ?? '')}`.slice(0, 5000))
  }

  async function submit() {
    if (!profile.name?.trim() || !profile.style || !sourceNotes.trim() || !recipients.length) {
      setError('Add a doctor name, choose a conversation style, describe the profile and select at least one rep.')
      return
    }
    setBusy(true); setError('')
    const res = await fetch('/api/company-doctors', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile: { ...profile, notes: sourceNotes }, sourceNotes, repIds: recipients }),
    }).catch(() => null)
    setBusy(false)
    if (!res?.ok) { setError('Could not assign this doctor profile. Check the selected reps and try again.'); return }
    setProfile(emptyProfile()); setSourceNotes(''); setRecipients(reps.map(r => r.id)); setOpen(false)
    void load()
  }

  return <div style={{ display: 'grid', gap: 12 }}>
    <p style={{ color: 'var(--ink-dim)', fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
      Create a team doctor persona from a written briefing or your own voice note. Assigned reps can practice with it in AI Doctor. Do not upload a doctor&apos;s voice recording.
    </p>
    {loading ? <p role="status">Loading profiles…</p> : profiles.map(p => (
      <div key={p.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
        <strong>{p.name}</strong>
        <p style={{ color: 'var(--ink-dim)', fontSize: 12, margin: '6px 0 0' }}>
          Assigned to {p.assignedReps.length} rep{p.assignedReps.length === 1 ? '' : 's'}: {p.assignedReps.map(r => r.name).join(', ') || 'none'}
        </p>
      </div>
    ))}
    {!open ? <button onClick={() => { setError(''); setOpen(true) }} style={{ ...primaryBtn, justifySelf: 'start' }}>＋ Create and assign doctor</button> : (
      <section style={{ display: 'grid', gap: 12, border: '1px solid var(--line)', borderRadius: 12, padding: 14, background: 'rgba(0,0,0,.18)' }}>
        <label style={labelStyle}>Doctor profile name
          <input aria-label="Doctor profile name" maxLength={120} value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} style={inputStyle} />
        </label>
        <label style={labelStyle}>Specialty
          <input aria-label="Specialty" maxLength={200} value={profile.specialty ?? ''} onChange={e => setProfile(p => ({ ...p, specialty: e.target.value || null }))} style={inputStyle} />
        </label>
        <label style={labelStyle}>Conversation style for this practice persona
          <select aria-label="Conversation style" value={profile.style ?? ''} onChange={e => setProfile(p => ({ ...p, style: (e.target.value || null) as StyleKey | null }))} style={inputStyle}>
            <option value="">Choose a style</option>{STYLE_KEYS.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </label>
        <label style={labelStyle}>Product or approved-message context
          <textarea aria-label="Product context" rows={3} maxLength={2000} value={profile.product_context ?? ''} onChange={e => setProfile(p => ({ ...p, product_context: e.target.value || null }))} style={inputStyle} />
        </label>
        <label style={labelStyle}>What should the AI doctor ask or raise?
          <textarea aria-label="Doctor objections" rows={3} maxLength={1600} value={(profile.objections ?? []).join('\n')} onChange={e => setProfile(p => ({ ...p, objections: e.target.value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 8) }))} placeholder="One concern or objection per line" style={inputStyle} />
        </label>
        <label style={labelStyle}>Doctor background and interaction details
          <textarea aria-label="Doctor profile notes" rows={5} maxLength={5000} value={sourceNotes} onChange={e => setSourceNotes(e.target.value)} placeholder="Share only approved, relevant scenario details: priorities, likely questions, time constraints, and meeting context." style={inputStyle} />
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" disabled={busy} onClick={() => void toggleRecording()} style={ghostBtn}>{recording ? 'Stop recording' : 'Record manager voice note'}</button>
          {recorder.previewUrl && <>
            <audio controls src={recorder.previewUrl} aria-label="Review profile voice note" />
            <button type="button" disabled={busy} onClick={() => void transcribe()} style={ghostBtn}>Transcribe into notes</button>
            <button type="button" disabled={busy} onClick={recorder.discard} style={ghostBtn}>Discard</button>
          </>}
        </div>
        <fieldset style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>
          <legend style={{ color: 'var(--ink-dim)', fontSize: 12 }}>Assign to reps</legend>
          {reps.map(rep => <label key={rep.id} style={{ display: 'flex', gap: 8, padding: '5px 0', alignItems: 'center' }}>
            <input type="checkbox" checked={recipients.includes(rep.id)} onChange={e => setRecipients(prev => e.target.checked ? [...prev, rep.id] : prev.filter(id => id !== rep.id))} />
            {rep.name || 'Rep'}
          </label>)}
          {!reps.length && <p>No reps are in this team yet.</p>}
        </fieldset>
        <p style={{ color: 'var(--ink-dim)', fontSize: 11.5, lineHeight: 1.5, margin: 0 }}>Voice notes are sent for transcription and aren&apos;t stored in the team profile. Use a fictional or approved profile; don&apos;t include confidential patient information.</p>
        {error && <p role="alert" style={{ color: 'var(--red)', margin: 0 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" disabled={busy || recording} onClick={() => void submit()} style={primaryBtn}>{busy ? 'Saving…' : 'Assign profile'}</button>
          <button type="button" disabled={busy} onClick={() => { setOpen(false); setError('') }} style={ghostBtn}>Cancel</button>
        </div>
      </section>
    )}
  </div>
}
