'use client'
import { useEffect, useState } from 'react'
import { useGameData, useLang, useT } from '@/lib/i18n'
import { useBehaviorLabel, useDimensionLabel } from '@/lib/methodology-client'
import { drillRegistry } from '@/lib/drill-templates'
import type { PatternInsight } from '@/schemas/pattern'
import type { CapabilityDimension } from '@/scoring/capability'
import { card, ghostBtn, sectionLabel, bodyText, smallLabel } from './TextSimulation'
import MicroPractice from './MicroPractice'

interface Data { sessionsConsidered: number; insights: PatternInsight[] }

/** Engine difficulty names -> the names the rep sees on the practice cards. */
const LEVEL: Record<string, string> = { supportive: 'receptive', realistic: 'normal', resistant: 'resistant', pressure_test: 'pressure_test' }

/** Home card: recurring patterns across the rep's recent simulations. Each one keeps
 * what was observed, a hedged reading of it, and what to practise as three separate
 * parts, with the rep's own words as evidence. Silent when off or when nothing recurs yet. */
export default function PatternMemoryCard() {
  const t = useT()
  const { lang } = useLang()
  const { STYLES } = useGameData()
  const behaviorLabel = useBehaviorLabel()
  const dimensionLabel = useDimensionLabel()
  const [data, setData] = useState<Data | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [drill, setDrill] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/progress/patterns').then(r => (r.ok ? r.json() : null)).then(d => { if (live && d?.insights) setData(d as Data) }).catch(() => {})
    return () => { live = false }
  }, [])

  if (drill) return <MicroPractice focusDrillId={drill} onClose={() => setDrill(null)} />
  if (!data || data.insights.length === 0) return null

  const ctxValue = (key: 'physicianStyle' | 'objectionType', v: string) =>
    key === 'physicianStyle' ? (STYLES[v as keyof typeof STYLES]?.name ?? v) : t(`voice.objType.${v}`)

  function observed(i: PatternInsight): string {
    const o = i.observed
    if (o.contrast) {
      const c = o.contrast
      return t('pm.obs.context_contrast', {
        dimension: dimensionLabel(c.dimension as CapabilityDimension),
        hp: c.higher.positive, hn: c.higher.sessions, hv: ctxValue(c.contextKey, c.higher.value),
        lp: c.lower.positive, ln: c.lower.sessions, lv: ctxValue(c.contextKey, c.lower.value),
      })
    }
    const base = t(`pm.obs.${i.kind}`, { behavior: behaviorLabel(o.behavior ?? ''), n: o.sessionsWith ?? 0, m: o.sessionsConsidered, quiet: 5 })
    const c = o.context ?? {}
    const parts = [
      c.physicianStyle ? t('pm.ctx.physicianStyle', { value: STYLES[c.physicianStyle].name }) : '',
      c.objectionType ? t('pm.ctx.objectionType', { value: t(`voice.objType.${c.objectionType}`) }) : '',
      c.difficulty ? t('pm.ctx.difficulty', { value: t(`chal.level.${LEVEL[c.difficulty]}`) }) : '',
    ].filter(Boolean)
    return [base, ...parts, o.trend && i.kind === 'recurring_hurt' ? t(`chal.trend.${o.trend}`) : ''].filter(Boolean).join(' ')
  }

  return (
    <div style={card}>
      <div style={sectionLabel}>{t('pm.title')}</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.insights.map(i => {
          const open = openId === i.id
          const drillType = i.recommendation.drillId ? drillRegistry.get(i.recommendation.drillId)?.type : undefined
          return (
            <li key={i.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={smallLabel}>{t(`pm.kind.${i.kind}`)}</span>
                <span style={smallLabel}>{t(`chal.conf.${i.confidence}`)}</span>
              </div>
              <p dir="auto" style={bodyText}>{observed(i)}</p>
              <button onClick={() => setOpenId(open ? null : i.id)} aria-expanded={open} style={{ ...ghostBtn, padding: '6px 10px' }}>{t('pm.more')} {open ? '▲' : '▼'}</button>
              {open && (
                <div style={{ marginTop: 8 }}>
                  {i.observed.evidence.length > 0 && <>
                    <div style={smallLabel}>{t('pm.evidence')}</div>
                    <ul style={{ margin: '0 0 8px', paddingInlineStart: 18 }}>{i.observed.evidence.map((e, k) => <li key={k} dir="auto" style={{ ...bodyText, color: 'var(--ink-dim)' }}>“{e.text}”</li>)}</ul>
                  </>}
                  <div style={smallLabel}>{t('pm.meaning')}</div>
                  <p style={bodyText}>{t(`pm.int.${i.interpretation.code}`)}</p>
                  <ul style={{ margin: '0 0 8px', paddingInlineStart: 18 }}>{i.interpretation.caveats.map(c => <li key={c} style={{ ...bodyText, color: 'var(--ink-dim)' }}>{t(`pm.cav.${c}`)}</li>)}</ul>
                  <div style={smallLabel}>{t('pm.practice')}</div>
                  {i.recommendation.kind === 'keep_going'
                    ? <p style={bodyText}>{t('pm.rec.keep_going')}</p>
                    : <p style={bodyText}>{i.recommendation.focus && i.observed.behavior ? t(`chal.obj.${i.observed.behavior}`) : t('pm.rec.area', { area: dimensionLabel(i.recommendation.focus as CapabilityDimension) })}</p>}
                  {drillType && lang === 'en' && <button onClick={() => setDrill(i.recommendation.drillId)} style={ghostBtn}>{t('pm.tryDrill', { drill: t(`mp.type.${drillType}`) })}</button>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <div style={{ ...smallLabel, marginTop: 10 }}>{t('pm.note', { n: data.sessionsConsidered })}</div>
    </div>
  )
}
