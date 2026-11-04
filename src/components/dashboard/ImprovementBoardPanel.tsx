'use client'
import { useEffect, useState } from 'react'
import type { BoardRow } from '@/lib/improvement/server'
import type { RoadmapItem } from '@/lib/improvement'

// Manager view of the Behavioral Improvement Engine: per rep, what the roadmap says to work on,
// what has been assigned, and the THREE evidence streams side by side - measured in practice,
// reported by the rep, and confirmed in the field by a manager. English-only, like the rest of
// the dashboard. A manager can assign a roadmap item, record a field confirmation, or close it.

const METRIC_LABEL: Record<string, string> = {
  open_question_ratio: 'Open questions', paraphrase_score: 'Paraphrasing', active_listening: 'Active listening',
  talk_ratio: 'Share of talking', adaptation_score: 'Adapting to the doctor', clear_steps_per_turn: 'CLEAR steps per reply', drill_score: 'Drill score',
}
const DRILL_LABEL: Record<string, string> = {
  precision_drill: 'Precision question drill', ai_doctor_objection: 'AI Doctor practice', colleague_roleplay: 'Colleague roleplay', micro_practice: 'Quick drill',
}
const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started', practising: 'Practising', improved: 'Improved', no_change: 'No clear change',
  declined: 'Lower than before', no_baseline: 'No starting point', closed: 'Closed',
}
const CAVEAT_LABEL: Record<string, string> = {
  no_sessions: 'No practice measured yet', few_sessions: 'Only a few sessions: early read', no_comparison_yet: 'Latest session has nothing to compare with',
  self_report_not_verified: 'Rep-reported visits are not yet confirmed', no_verified_field_evidence: 'No manager-confirmed field result yet',
  check_rejected: 'Some field entries were ignored (wrong author)',
}
const REASON_LABEL: Record<string, string> = {
  declining: 'Dropping across recent sessions', objection_pattern: 'Repeating pattern with one objection type', needs_more_data: 'Needs more sessions before a focus',
}
const CONFIDENCE_LABEL: Record<string, string> = { established: 'solid signal', emerging: 'early signal', insufficient: 'too early' }

const card: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', background: 'var(--surface-subtle)' }
const chip = (c: string): React.CSSProperties => ({ fontFamily: 'var(--mono)', fontSize: 11, padding: '1px 7px', borderRadius: 999, border: `1px solid ${c}`, color: c })

function dueIn(days: number): string {
  const d = new Date(Date.now() + days * 86400000)
  return d.toISOString().slice(0, 10)
}

export default function ImprovementBoardPanel({ initial }: { initial?: BoardRow[] }) {
  const [rows, setRows] = useState<BoardRow[] | null>(initial ?? null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/improvement/board').catch(() => null)
    if (res?.ok) setRows((await res.json()).reps)
  }
  useEffect(() => { if (!initial) void load() }, [initial])

  async function act(key: string, url: string, method: string, body: unknown) {
    setBusy(key); setError(null)
    try {
      const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) setError('That did not go through. Check your connection and try again.')
      else await load()
    } finally { setBusy(null) }
  }

  const assign = (repId: string, it: RoadmapItem) => act(`a:${repId}:${it.id}`, '/api/improvement/followups', 'POST', {
    repId, metricKey: it.metricKey, source: it.source, drillKind: it.drill.kind,
    objectionType: it.drill.objectionType, clearStep: it.drill.clearStep, dueDate: dueIn(7),
  })

  if (!rows) return <div style={{ color: 'var(--ink-dim)', fontSize: 13 }}>Loading…</div>
  if (rows.length === 0) return <div style={{ color: 'var(--ink-dim)', fontSize: 13 }}>No reps in your team yet.</div>

  return (
    <div data-testid="improvement-board" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {error && <div role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
      {rows.map(({ repId, name, report, followups }) => (
        <div key={repId} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13.5 }}>{name ?? 'Rep'}</strong>
            <span style={{ fontSize: 12, color: 'var(--ink-dim)' }}>
              {report.evidence.observedPractice.sessions} practice session(s) measured
            </span>
          </div>

          {report.roadmap.items.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--ink-dim)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Suggested focus</div>
              {report.roadmap.items.map(it => {
                const alreadyOpen = followups.some(f => !f.closedAt && f.metricKey === it.metricKey && f.drillKind === it.drill.kind
                  && f.objectionType === it.drill.objectionType && f.clearStep === it.drill.clearStep)
                return (
                  <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, lineHeight: 1.5 }}>
                      <strong>{it.metricKey ? METRIC_LABEL[it.metricKey] : DRILL_LABEL[it.drill.kind]}</strong> · {DRILL_LABEL[it.drill.kind]}
                      {it.drill.clearStep ? ` · ${it.drill.clearStep}` : ''} · {REASON_LABEL[it.reason]} <span style={{ color: 'var(--ink-dim)' }}>({CONFIDENCE_LABEL[it.confidence]})</span>
                    </span>
                    {it.reason !== 'needs_more_data' && (
                      <button disabled={alreadyOpen || busy === `a:${repId}:${it.id}`} onClick={() => assign(repId, it)}>
                        {alreadyOpen ? 'Assigned' : 'Assign (due in 7 days)'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {followups.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--ink-dim)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Follow-ups</div>
              {followups.map(f => {
                const s = report.followups.find(x => x.followupId === f.id)
                if (!s) return null
                return (
                  <div key={f.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                    <div style={{ fontSize: 13 }}>
                      <strong>{f.metricKey ? METRIC_LABEL[f.metricKey] : DRILL_LABEL[f.drillKind]}</strong> · {DRILL_LABEL[f.drillKind]}
                      {f.baselineValue !== null && <span style={{ color: 'var(--ink-dim)' }}> · started at {f.baselineValue}</span>}
                      {f.dueDate && <span style={{ color: s.overdue ? 'var(--red)' : 'var(--ink-dim)' }}> · {s.overdue ? 'overdue' : `due ${f.dueDate}`}</span>}
                      {!f.acknowledgedAt && !f.closedAt && <span style={{ color: 'var(--ink-dim)' }}> · not yet seen by rep</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      <span style={chip('var(--purple)')}>Practice: {STATUS_LABEL[s.practice.status]}
                        {s.practice.change !== null ? ` (${s.practice.change > 0 ? '+' : ''}${s.practice.change})` : ''} · {s.practice.sessionsAfter} session(s)</span>
                      <span style={chip('var(--cyan)')}>Rep reported: {s.selfReported.seen} used, {s.selfReported.notSeen} not used</span>
                      <span style={chip('var(--green)')}>Confirmed in field: {s.verified.seen} seen, {s.verified.notSeen} not seen</span>
                    </div>
                    {!f.closedAt && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                        <button disabled={busy === f.id} onClick={() => act(f.id, '/api/improvement/field-checks', 'POST', { followupId: f.id, kind: 'verified', observed: 'seen' })}>I saw it in the field</button>
                        <button disabled={busy === f.id} onClick={() => act(f.id, '/api/improvement/field-checks', 'POST', { followupId: f.id, kind: 'verified', observed: 'not_seen' })}>I did not see it</button>
                        <button disabled={busy === f.id} onClick={() => act(f.id, '/api/improvement/followups', 'PATCH', { id: f.id, action: 'close' })}>Close</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {report.caveats.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingInlineStart: 16, fontSize: 12, color: 'var(--ink-dim)', lineHeight: 1.6 }}>
              {report.caveats.map(c => <li key={c}>{CAVEAT_LABEL[c]}</li>)}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
