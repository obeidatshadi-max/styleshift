'use client'
import { useEffect, useState } from 'react'
import { useGameData, useT } from '@/lib/i18n'
import { useBehaviorLabel, useDimensionLabel } from '@/lib/methodology-client'
import type { ProgressReport } from '@/lib/progress'
import { card, ghostBtn, sectionLabel, bodyText, smallLabel } from './TextSimulation'

const MASTERY_COLOR = { new: 'var(--line)', practising: 'var(--ink-dim)', proficient: 'var(--cyan)', mastered: 'var(--green)' } as const

/** Home card: weekly practice rhythm, what is genuinely moving, skill mastery and milestones.
 * No points or rankings: it reads only from the rep's own practice, and counts days, not volume.
 * Silent when the feature is off or there is no practice yet. */
export default function ProgressCard() {
  const t = useT()
  const { STYLES } = useGameData()
  const behaviorLabel = useBehaviorLabel()
  const dimensionLabel = useDimensionLabel()
  const [p, setP] = useState<ProgressReport | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let live = true
    const tz = -new Date().getTimezoneOffset() // minutes east of UTC
    fetch(`/api/progress/summary?tz=${tz}`).then(r => (r.ok ? r.json() : null)).then(d => { if (live && d?.week) setP(d as ProgressReport) }).catch(() => {})
    return () => { live = false }
  }, [])

  if (!p || p.totals.practiceDays === 0) return null
  const drillName = (type: string) => t(`mp.type.${type}`)
  const highlights: string[] = [
    ...p.drills.filter(d => d.improvement?.direction === 'improved').map(d => t('prog.imp', { pct: d.improvement!.percent, drill: drillName(d.type), days: d.improvement!.overDays })),
    ...p.styleBests.map(b => t('prog.best', { style: STYLES[b.style].name })),
    ...p.cleanRuns.map(c => t('prog.clean', { n: c.sessions, behavior: behaviorLabel(c.behavior) })),
    ...p.improvingCapabilities.map(d => t('prog.cap', { dimension: dimensionLabel(d) })),
  ]

  return (
    <div style={card}>
      <div style={sectionLabel}>{t('prog.title')}</div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }} role="img" aria-label={t('prog.week', { n: p.week.days, target: p.week.target })}>
        {Array.from({ length: p.week.target }, (_, i) => (
          <span key={i} aria-hidden="true" style={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--cyan)', background: i < p.week.days ? 'var(--cyan)' : 'transparent' }} />
        ))}
        <span style={{ ...bodyText, marginInlineStart: 8 }}>{t('prog.week', { n: p.week.days, target: p.week.target })}{p.week.met ? ` · ${t('prog.weekMet')}` : ''}</span>
      </div>
      <p style={bodyText}>
        {p.streak.weeks >= 2 ? t('prog.streak', { n: p.streak.weeks }) : p.streak.weeks === 1 ? t('prog.streakOne') : t('prog.streak0', { target: p.week.target })}
      </p>

      <div style={smallLabel}>{t('prog.highlights')}</div>
      {highlights.length === 0
        ? <p style={{ ...bodyText, color: 'var(--ink-dim)' }}>{t('prog.none')}</p>
        : <ul style={{ margin: '0 0 8px', paddingInlineStart: 18 }}>{highlights.map((h, i) => <li key={i} dir="auto" style={bodyText}>{h}</li>)}</ul>}

      <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ ...ghostBtn, padding: '6px 10px' }}>{t('prog.details')} {open ? '▲' : '▼'}</button>
      {open && (
        <div style={{ marginTop: 10 }}>
          {p.drills.length > 0 && <>
            <div style={smallLabel}>{t('prog.skills')}</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 10px', display: 'grid', gap: 6 }}>
              {p.drills.map(d => (
                <li key={d.type} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, border: `1px solid ${MASTERY_COLOR[d.mastery]}`, borderRadius: 10, padding: '8px 10px' }}>
                  <span style={bodyText}>{drillName(d.type)}</span>
                  <span style={smallLabel}>{t(`prog.mastery.${d.mastery}`)}{d.best !== null ? ` · ${t('prog.bestScore', { n: d.best })}` : ''}</span>
                </li>
              ))}
            </ul>
          </>}
          {p.milestones.length > 0 && <>
            <div style={smallLabel}>{t('prog.milestones')}</div>
            <ul style={{ margin: '0 0 8px', paddingInlineStart: 18 }}>
              {p.milestones.map((m, i) => <li key={i} style={bodyText}>{t(`prog.ms.${m.id}`, { drill: m.param ? drillName(m.param) : '' })}</li>)}
            </ul>
          </>}
          <p style={{ ...bodyText, color: 'var(--ink-dim)' }}>{t('prog.note')}</p>
        </div>
      )}
    </div>
  )
}
