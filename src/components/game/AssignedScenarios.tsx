'use client'
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n'
import type { Doctor, StyleKey } from '@/types/game'
import TextSimulation, { card, ghostBtn, sectionLabel, bodyText, smallLabel } from './TextSimulation'

interface AssignedScenario {
  id: string
  name: string
  description: string
  availableTimeMin: number
  style: StyleKey
  visitPurpose: string
}

/** Rep home card: practice scenarios a manager approved and assigned. Renders
 * nothing when the feature is off, nothing is assigned, or the list fails to
 * load - the rest of Home is never affected. */
export default function AssignedScenarios() {
  const t = useT()
  const [list, setList] = useState<AssignedScenario[]>([])
  const [running, setRunning] = useState<AssignedScenario | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/sim-scenarios/mine')
      .then(r => (r.ok ? r.json() : []))
      .then(data => { if (!cancelled && Array.isArray(data)) setList(data as AssignedScenario[]) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (running) {
    // Display-only stand-in: the server builds the real persona from the scenario id.
    const shown = { id: 'scenario', name: running.name, style: running.style } as Doctor
    return <TextSimulation doctor={shown} scenarioId={running.id} onDone={() => setRunning(null)} />
  }
  if (!list.length) return null

  return (
    <div style={card}>
      <div style={sectionLabel}>{t('scn.title')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map(s => (
          <div key={s.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</div>
            <div style={{ ...bodyText, color: 'var(--ink-dim)', margin: '4px 0 8px' }}>{s.visitPurpose}</div>
            <div style={smallLabel}>{t('scn.minutes', { n: s.availableTimeMin })}</div>
            <button onClick={() => setRunning(s)} style={{ ...ghostBtn, marginTop: 8 }}>{t('scn.start')}</button>
          </div>
        ))}
      </div>
    </div>
  )
}
