'use client'
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n'
import type { ImprovementReport, MetricKey, RoadmapItem } from '@/lib/improvement'
import { METRICS } from '@/lib/improvement/metrics'
import type { FollowupView } from '@/lib/improvement/server'

// Rep-facing Behavioral Improvement Plan: Conversation Snapshot -> Behavioral Evolution ->
// Personal Coaching Roadmap, plus what the manager has assigned. Every number says where it
// came from (measured in practice / reported by you / confirmed by your manager) and thin or
// unverified results carry a plain-language caveat instead of a confident verdict.

interface Payload { report: ImprovementReport; followups: FollowupView[] }

// Isolated left-to-right so a percent sign stays after its number inside Arabic text.
const fmt = (key: MetricKey, v: number) => `⁦${METRICS[key].unit === 'percent' ? `${v}%` : String(v)}⁩`
const chip = (color: string): React.CSSProperties => ({
  fontFamily: 'var(--mono)', fontSize: 12, padding: '2px 8px', borderRadius: 999, border: `1px solid ${color}`, color, whiteSpace: 'nowrap',
})
const VERDICT_COLOR = { better: 'var(--green)', worse: 'var(--red)', same: 'var(--ink-dim)', no_baseline: 'var(--ink-dim)', not_measured: 'var(--ink-dim)' } as const
const TREND_COLOR = { improving: 'var(--green)', declining: 'var(--red)', stable: 'var(--ink-dim)', insufficient: 'var(--ink-dim)' } as const
const heading: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--purple)', margin: '12px 0 6px' }
const box: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }

export default function MyImprovementPlan({ initial }: { initial?: Payload }) {
  const t = useT()
  const [data, setData] = useState<Payload | null>(initial ?? null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (initial) return
    let alive = true
    fetch('/api/improvement').then(r => (r.ok ? r.json() : null)).then(d => { if (alive) setData(d) }).catch(() => {})
    return () => { alive = false }
  }, [initial])

  async function send(url: string, method: string, body: unknown, key: string) {
    setBusy(key)
    try {
      const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      if (res.ok) {
        const fresh = await fetch('/api/improvement').then(r => (r.ok ? r.json() : null)).catch(() => null)
        if (fresh) setData(fresh)
      }
    } finally { setBusy(null) }
  }

  if (!data) return null
  const { report, followups } = data
  const hasAnything = report.evidence.observedPractice.sessions > 0 || followups.length > 0
  const snap = report.snapshot
  const statusById = new Map(report.followups.map(s => [s.followupId, s]))
  const metricName = (k: MetricKey | null) => (k ? t(`improve.metric.${k}`) : '')

  const roadmapLine = (it: RoadmapItem) => {
    if (it.reason === 'needs_more_data') return t('improve.reason.needs_more_data', { n: it.sessionsNeeded ?? 0 })
    if (it.reason === 'objection_pattern')
      return t('improve.reason.objection_pattern', { objection: it.drill.objectionType ? t(`improve.objection.${it.drill.objectionType}`) : '' })
    const e = it.evidence
    return e && it.metricKey && e.earlierAvg !== null && e.recentAvg !== null
      ? t('improve.reason.declining', { from: fmt(it.metricKey, e.earlierAvg), to: fmt(it.metricKey, e.recentAvg) }) : ''
  }

  return (
    <div data-testid="improvement-plan" style={{ border: '1px solid var(--purple)', borderRadius: 14, padding: '14px 16px', background: 'rgba(176,108,255,.06)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--purple)' }}>{t('improve.title')}</div>

      {!hasAnything && <p style={{ fontSize: 15, color: 'var(--ink-dim)', lineHeight: 1.5 }}>{t('improve.empty')}</p>}

      {snap && (
        <section>
          <div style={heading}>{t('improve.snapshot')} · {t(`improve.source.${snap.source}`)} · {snap.at.slice(0, 10)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {snap.metrics.map(m => (
              <div key={m.key} style={{ ...box, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15 }}>{metricName(m.key)}: <strong>{m.value !== null ? fmt(m.key, m.value) : ''}</strong>
                  {m.baseline !== null && <span style={{ color: 'var(--ink-dim)', fontSize: 13 }}> ({t('improve.vsUsual', { baseline: fmt(m.key, m.baseline) })})</span>}
                </span>
                <span style={chip(VERDICT_COLOR[m.verdict])}>{t(`improve.verdict.${m.verdict}`)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {report.evolution.length > 0 && (
        <section>
          <div style={heading}>{t('improve.evolution')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {report.evolution.map(e => (
              <div key={`${e.source}:${e.key}`} style={{ ...box, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15 }}>{metricName(e.key)} <span style={{ color: 'var(--ink-dim)', fontSize: 13 }}>· {t(`improve.source.${e.source}`)}</span></span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={chip(TREND_COLOR[e.trend])}>
                    {e.trend === 'insufficient' ? t('improve.trend.insufficient', { n: e.n, need: 4 }) : t(`improve.trend.${e.trend}`)}
                  </span>
                  {e.trend !== 'insufficient' && <span style={chip('var(--ink-dim)')}>{t(`improve.confidence.${e.confidence}`)}</span>}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {report.roadmap.items.length > 0 && (
        <section>
          <div style={heading}>{t('improve.roadmap')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {report.roadmap.items.map(it => (
              <div key={it.id} style={box}>
                <div style={{ fontSize: 15, lineHeight: 1.5 }}>
                  <strong>{it.metricKey ? metricName(it.metricKey) : t(`improve.drill.${it.drill.kind}`)}</strong>: {roadmapLine(it)}
                </div>
                {it.reason !== 'needs_more_data' && (
                  <>
                    <div style={{ fontSize: 14, color: 'var(--ink-dim)', marginTop: 4 }}>
                      {t(`improve.drill.${it.drill.kind}`)}
                      {it.drill.clearStep && <> · {t('improve.focusStep', { step: t(`improve.step.${it.drill.clearStep}`) })}</>}
                    </div>
                    <div style={{ marginTop: 6 }}><span style={chip('var(--ink-dim)')}>{t('improve.tier.observed_practice')}</span></div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {followups.length > 0 && (
        <section>
          <div style={heading}>{t('improve.followups')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {followups.map(f => {
              const s = statusById.get(f.id)
              return (
                <div key={f.id} style={box}>
                  <div style={{ fontSize: 15, lineHeight: 1.5 }}>
                    <strong>{f.metricKey ? metricName(f.metricKey) : t(`improve.drill.${f.drillKind}`)}</strong> · {t(`improve.drill.${f.drillKind}`)}
                    {f.clearStep && <> · {t('improve.focusStep', { step: t(`improve.step.${f.clearStep}`) })}</>}
                  </div>
                  {f.note && <div style={{ fontSize: 14, color: 'var(--ink-dim)', marginTop: 4 }}>{f.note}</div>}
                  {s && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      <span style={chip('var(--purple)')}>{t(`improve.status.${s.practice.status}`)}</span>
                      <span style={chip('var(--ink-dim)')}>{t('improve.sessionsAfter', { n: s.practice.sessionsAfter })}</span>
                      {f.dueDate && <span style={chip(s.overdue ? 'var(--red)' : 'var(--ink-dim)')}>{s.overdue ? t('improve.overdue') : t('improve.due', { date: f.dueDate })}</span>}
                    </div>
                  )}
                  {s && <div style={{ fontSize: 13, color: 'var(--ink-dim)', marginTop: 6 }}>{t('improve.fieldCounts', { self: s.selfReported.total, verified: s.verified.total })}</div>}
                  {!f.closedAt && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      {!f.acknowledgedAt && (
                        <button disabled={busy === f.id} onClick={() => send('/api/improvement/followups', 'PATCH', { id: f.id, action: 'acknowledge' }, f.id)}>{t('improve.ack')}</button>
                      )}
                      <button disabled={busy === f.id} onClick={() => send('/api/improvement/field-checks', 'POST', { followupId: f.id, kind: 'self_reported', observed: 'seen' }, f.id)}>{t('improve.reportUsed')}</button>
                      <button disabled={busy === f.id} onClick={() => send('/api/improvement/field-checks', 'POST', { followupId: f.id, kind: 'self_reported', observed: 'not_seen' }, f.id)}>{t('improve.reportNot')}</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {report.caveats.length > 0 && (
        <ul style={{ margin: '12px 0 0', paddingInlineStart: 18, fontSize: 13, color: 'var(--ink-dim)', lineHeight: 1.6 }}>
          {report.caveats.map(c => <li key={c}>{t(`improve.caveat.${c}`)}</li>)}
        </ul>
      )}
    </div>
  )
}
