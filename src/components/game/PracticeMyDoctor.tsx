'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useGameData, useLang, useT } from '@/lib/i18n'
import type { Doctor } from '@/types/game'
import type { HcpContext } from '@/lib/hcp-context'
import type { NextVisitReason } from '@/lib/practice-my-doctor'
import type { HcpStart } from '@/hooks/useTextSimulation'
import TextSimulation, { card, ghostBtn, primaryBtn, sectionLabel, bodyText, smallLabel } from './TextSimulation'

interface Preview {
  doctors: Array<{ id: string; name: string }>
  seed?: string
  reason?: NextVisitReason | 'chosen'
  doctor?: { id: string; name: string; style: Doctor['style'] }
  context?: HcpContext
}

/** Opens from Home. Shows, before anything starts, exactly what the simulation
 * will assume about this doctor - kept in three labelled groups - and lets the
 * rep leave out any recorded fact. This simulates the LIKELY interaction from
 * the rep's own notes; it is not a model of the real person. */
export default function PracticeMyDoctor() {
  const t = useT()
  const { lang } = useLang()
  const { STYLES } = useGameData()
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)
  const [off, setOff] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState<HcpStart | null>(null)

  const load = useCallback(async (doctorId?: string, seed?: string) => {
    setLoading(true)
    const q = new URLSearchParams()
    if (doctorId) q.set('doctorId', doctorId)
    if (seed) q.set('seed', seed)
    const res = await fetch(`/api/practice-my-doctor/preview?${q}`).catch(() => null)
    setLoading(false)
    if (!res?.ok) { setPreview(null); return }
    setPreview(await res.json() as Preview)
    setOff(new Set())
  }, [])

  // Quietly find out whether the feature exists and the rep has any doctor; render nothing otherwise.
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    fetch('/api/practice-my-doctor/preview').then(async r => {
      if (!r.ok) return
      const d = await r.json() as Preview
      if (d.doctors.length) { setAvailable(true); setPreview(d) }
    }).catch(() => {})
  }, [])

  const hcp = useMemo<HcpStart | null>(() => (preview?.doctor && preview.seed ? { doctorId: preview.doctor.id, seed: preview.seed, exclude: [...off] } : null), [preview, off])

  if (running && preview?.doctor) {
    const shown = { id: preview.doctor.id, name: preview.doctor.name, style: preview.doctor.style } as Doctor
    return <TextSimulation doctor={shown} hcp={running} onDone={() => { setRunning(null); setOpen(false) }} />
  }
  if (!available) return null

  if (!open) {
    return (
      <div style={card}>
        <div style={sectionLabel}>{t('pmd.title')}</div>
        <p style={bodyText}>{t('pmd.intro')}</p>
        <button onClick={() => setOpen(true)} style={primaryBtn}>{t('pmd.open')}</button>
      </div>
    )
  }

  const ctx = preview?.context
  const toggle = (id: string) => setOff(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const keptInference = ctx ? ctx.inferences.filter(i => i.basis.every(b => !off.has(b))) : []

  return (
    <div style={card}>
      <div style={sectionLabel}>{t('pmd.title')}</div>
      <p style={{ ...bodyText, color: 'var(--ink-dim)' }}>{t('pmd.disclaimer')}</p>

      <label style={{ display: 'grid', gap: 6, margin: '10px 0' }}>
        <span style={smallLabel}>{t('pmd.doctor')}</span>
        <select value={preview?.doctor?.id ?? ''} onChange={e => void load(e.target.value)}
          style={{ background: 'rgba(0,0,0,.3)', border: '1px solid var(--line)', borderRadius: 10, padding: 10, color: 'var(--ink)' }}>
          {preview?.doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
      {preview?.reason && preview.reason !== 'chosen' && <p style={{ ...bodyText, color: 'var(--ink-dim)' }}>{t(`pmd.reason.${preview.reason}`)}</p>}
      {loading && <p role="status" style={bodyText}>{t('pmd.loading')}</p>}

      {ctx && <>
        <div style={smallLabel}>{t('pmd.facts')}</div>
        {ctx.facts.length === 0 && <p style={{ ...bodyText, color: 'var(--ink-dim)' }}>{t('pmd.noFacts')}</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', display: 'grid', gap: 6 }}>
          {ctx.facts.map(f => (
            <li key={f.id}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={!off.has(f.id)} onChange={() => toggle(f.id)} aria-label={t('pmd.use')} />
                <span dir="auto" style={bodyText}>
                  <span style={{ ...smallLabel, display: 'inline', marginInlineEnd: 6 }}>{t(`pmd.kind.${f.kind}`)}</span>
                  {f.kind === 'doctor_style' && f.text in STYLES ? STYLES[f.text as keyof typeof STYLES].name : f.text}
                </span>
              </label>
            </li>
          ))}
        </ul>

        <div style={smallLabel}>{t('pmd.inferred')}</div>
        {keptInference.length === 0 && <p style={{ ...bodyText, color: 'var(--ink-dim)' }}>{t('pmd.noInferred')}</p>}
        <ul style={{ margin: '0 0 12px', paddingInlineStart: 18 }}>
          {keptInference.map(i => <li key={i.id} dir="auto" style={bodyText}>{t(`pmd.inf.${i.kind}`, { subject: i.subject ?? '' })}</li>)}
        </ul>

        <div style={smallLabel}>{t('pmd.challenge')}</div>
        <p style={bodyText}>{t(`pmd.ch.${ctx.challenge}`)}</p>

        {ctx.missing.length > 0 && <>
          <div style={smallLabel}>{t('pmd.missing')}</div>
          <ul style={{ margin: '0 0 12px', paddingInlineStart: 18 }}>{ctx.missing.map(m => <li key={m} style={{ ...bodyText, color: 'var(--ink-dim)' }}>{t(`pmd.miss.${m}`)}</li>)}</ul>
        </>}
      </>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button disabled={!hcp || loading} onClick={() => hcp && setRunning(hcp)} style={{ ...primaryBtn, width: 'auto' }}>{t('pmd.start')}</button>
        <button onClick={() => setOpen(false)} style={ghostBtn}>{t('pmd.close')}</button>
      </div>
    </div>
  )
}
