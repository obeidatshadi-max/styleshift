'use client'
import { useEffect, useState } from 'react'
import { useLang, useT } from '@/lib/i18n'
import { useBehaviorLabel } from '@/lib/methodology-client'
import type { Methodology, StageCoverage, StageStatus } from '@/schemas/methodology'
import { card, sectionLabel, bodyText, smallLabel } from './TextSimulation'

interface Data { methodology: Methodology | null; sessionsConsidered?: number; stages?: Array<StageCoverage & { status: StageStatus }> }

const COLOR: Record<StageStatus, string> = { covered: 'var(--green)', partial: 'var(--cyan)', not_seen: 'var(--line)', needs_attention: 'var(--red)' }

/** Home card: recent practice against the company's own stages. Silent when the
 * feature is off, the company has no active methodology, or there is no history. */
export default function MethodologyCard() {
  const t = useT()
  const { lang } = useLang()
  const label = useBehaviorLabel()
  const [data, setData] = useState<Data | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/progress/methodology').then(r => (r.ok ? r.json() : null)).then(d => { if (live && d) setData(d as Data) }).catch(() => {})
    return () => { live = false }
  }, [])

  if (!data?.methodology || !data.stages || !data.sessionsConsidered) return null
  const m = data.methodology
  return (
    <div style={card}>
      <div style={sectionLabel}>{m.name}</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.stages.map(c => {
          const stage = m.stages.find(s => s.id === c.stageId)
          if (!stage) return null
          const prompt = c.status !== 'covered' ? (stage.coachingPrompts[0]?.[lang] ?? stage.coachingPrompts[0]?.en) : undefined
          return (
            <li key={c.stageId} style={{ border: `1px solid ${COLOR[c.status]}`, borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong dir="auto">{stage.name[lang] ?? stage.name.en}{stage.optional ? ` (${t('meth.optional')})` : ''}</strong>
                <span style={smallLabel}>{t(`meth.status.${c.status}`)}</span>
              </div>
              {c.expectedSeen.length > 0 && <p dir="auto" style={bodyText}>{t('meth.seen')}: {c.expectedSeen.map(label).join(', ')}</p>}
              {c.expectedMissing.length > 0 && <p dir="auto" style={{ ...bodyText, color: 'var(--ink-dim)' }}>{t('meth.notSeen')}: {c.expectedMissing.map(label).join(', ')}</p>}
              {c.prohibitedSeen.length > 0 && <p dir="auto" style={{ ...bodyText, color: 'var(--red)' }}>{t('meth.against')}: {c.prohibitedSeen.map(label).join(', ')}</p>}
              {prompt && <p dir="auto" style={{ ...bodyText, color: 'var(--cyan)' }}>{t('meth.reflect')}: {prompt}</p>}
            </li>
          )
        })}
      </ul>
      <div style={{ ...smallLabel, marginTop: 10 }}>{t('meth.note', { n: data.sessionsConsidered })}</div>
    </div>
  )
}
