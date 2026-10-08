'use client'
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n'
import type { CapabilityReport, DimensionResult } from '@/lib/capability-iq'
import { CAPABILITY_DIMENSIONS } from '@/scoring/capability'
import { card, sectionLabel, bodyText, smallLabel, ghostBtn } from './TextSimulation'

const BAND_COLOR = { developing: 'var(--red)', building: 'var(--amber, #e8c060)', strong: 'var(--cyan)', advanced: 'var(--green)' } as const

function Row({ r, sessions }: { r: DimensionResult; sessions: number }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const name = t(`cap.${r.dimension}`)

  if (r.status === 'insufficient_evidence') {
    return (
      <li style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 700 }}>{name}</div>
        <div style={{ ...bodyText, color: 'var(--ink-dim)' }}>
          {t('cap.insufficient', { events: r.eventsUsed, needEvents: r.needed.events, sessions: r.sessionsUsed, needSessions: r.needed.sessions })}
        </div>
      </li>
    )
  }
  const color = BAND_COLOR[r.band]
  return (
    <li style={{ border: `1px solid ${color}`, borderRadius: 12, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontWeight: 700 }}>{name}</div>
        <div style={{ fontFamily: 'var(--mono)', color }}>{t(`cap.band.${r.band}`)} · {r.score}</div>
      </div>
      <div style={smallLabel}>{t(`cap.conf.${r.confidence}`)} · {t(`cap.trend.${r.trend}`)}</div>
      {r.limit && <div style={{ ...bodyText, color: 'var(--ink-dim)', marginTop: 6 }}>{t(`cap.limit.${r.limit}`)}</div>}
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ ...ghostBtn, marginTop: 8, padding: '6px 10px' }}>{t('cap.why')} {open ? '▲' : '▼'}</button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <div style={{ ...smallLabel, marginBottom: 6 }}>{t('cap.basis', { events: r.eventsUsed, sessions: r.sessionsUsed, total: sessions })}</div>
          {(['helped', 'hurt'] as const).map(side => r.evidence[side].length > 0 && (
            <div key={side} style={{ marginBottom: 8 }}>
              <div style={{ ...smallLabel, color: side === 'helped' ? 'var(--green)' : 'var(--red)' }}>{t(`cap.${side}`)}</div>
              <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                {r.evidence[side].map((e, i) => (
                  <li key={i} style={bodyText}>
                    {t(`sim.beh.${e.behavior}`)}
                    {e.quote && <span dir="auto" style={{ color: 'var(--ink-dim)' }}> - “{e.quote}”</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </li>
  )
}

/** Home card: five capability dimensions from the rep's own scored simulations.
 * Each is shown only when there is enough evidence, as a rounded band with
 * confidence and trend, and can be opened to see the behaviors and the rep's
 * own words behind it. Silent when the feature is off or there is no history. */
export default function CapabilityCard() {
  const t = useT()
  const [report, setReport] = useState<CapabilityReport | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/progress/capability').then(r => (r.ok ? r.json() : null)).then(d => { if (live && d?.dimensions) setReport(d as CapabilityReport) }).catch(() => {})
    return () => { live = false }
  }, [])

  if (!report || report.sessionsConsidered === 0) return null
  return (
    <div style={card}>
      <div style={sectionLabel}>{t('cap.title')}</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {CAPABILITY_DIMENSIONS.map(d => <Row key={d} r={report.dimensions[d]} sessions={report.sessionsConsidered} />)}
      </ul>
      <div style={{ ...smallLabel, marginTop: 10 }}>{t('cap.note', { n: report.sessionsConsidered })}</div>
    </div>
  )
}
