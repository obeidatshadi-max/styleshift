import type { RepBehavioralTrends } from '@/lib/behavioral-trends-dashboard'
import type { GravityMetricKey } from '@/lib/behavioral-gravity'
import type { ObjectionType, ClearStep } from '@/lib/voice-partner-core'

// Manager-dashboard panel for AI Doctor Phase 5 (Behavioral Gravity +
// Unused Resource Detector). Server-rendered — data is fetched in
// dashboard/page.tsx via getBehavioralTrendsForReps and handed down as
// props, same convention as VoicePracticePanel/SkillHeatmap. Dashboard is
// English-only by existing convention (see CoachingQueuePanel's comment:
// "the dashboard is English; reps see localized names in-game") — no i18n
// keys added here, matching that.

const OBJECTION_LABEL: Record<ObjectionType, string> = {
  wrong_info: 'Wrong Info', doubt: 'Doubt', true_objection: 'True Objection',
  indifference: 'Indifference', false_objection: 'False Objection',
}
const CLEAR_STEP_LABEL: Record<ClearStep, string> = {
  clarify: 'Clarify', listen: 'Listen', empathy: 'Empathy', answer: 'Answer', recheck: 'Recheck',
}
const METRIC_LABEL: Record<GravityMetricKey, string> = {
  avgRepTurnLength: 'reply length', openQuestionRatio: 'open-question rate', clearStepsPerTurn: 'CLEAR steps/turn',
}

interface Props {
  reps: { id: string; name: string | null }[]
  trendsByRep: Map<string, RepBehavioralTrends>
}

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', background: 'rgba(0,0,0,.18)',
}
const repNameStyle: React.CSSProperties = { fontSize: 13.5, fontWeight: 700 }
const metaStyle: React.CSSProperties = { fontSize: 12, color: 'var(--ink-dim)', marginTop: 4, lineHeight: 1.5 }
const sectionLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 8,
}

export default function BehavioralTrendsPanel({ reps, trendsByRep }: Props) {
  const gravityRows = reps
    .map(r => ({ rep: r, patterns: trendsByRep.get(r.id)?.gravity?.patterns ?? [] }))
    .filter(r => r.patterns.length > 0)

  const unusedRows = reps
    .map(r => ({ rep: r, findings: trendsByRep.get(r.id)?.unusedResources ?? [] }))
    .filter(r => r.findings.length > 0)

  const mastermindRows = reps
    .map(r => ({ rep: r, insights: trendsByRep.get(r.id)?.mastermindInsights ?? [] }))
    .filter(r => r.insights.length > 0)

  const anyRepHasEnoughHistory = reps.some(r => (trendsByRep.get(r.id)?.gravity?.overallSessionCount ?? 0) > 0)

  if (!anyRepHasEnoughHistory) {
    return (
      <div style={{ color: 'var(--ink-dim)', fontSize: 12.5, lineHeight: 1.5 }}>
        No patterns detected yet — Behavioral Gravity and Unused Resource findings need at least a few completed AI Doctor sessions per rep with Deep Analysis run. This fills in as reps practice and review their sessions.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={sectionLabelStyle}>Behavioral Gravity</div>
        {gravityRows.length === 0 ? (
          <div style={{ color: 'var(--ink-dim)', fontSize: 12.5 }}>No recurring maladaptive pattern found yet for any rep.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {gravityRows.map(({ rep, patterns }) => (
              <div key={rep.id} style={cardStyle}>
                <div style={repNameStyle}>{rep.name ?? 'Rep'}</div>
                {patterns.map(p => (
                  <div key={p.trigger} style={metaStyle}>
                    Under <strong>{OBJECTION_LABEL[p.trigger]}</strong> objections: {METRIC_LABEL[p.metric]} shifts {p.deviationPct > 0 ? '+' : ''}{p.deviationPct}% vs. baseline,
                    {' '}win rate {p.winRate}% vs. {p.baselineWinRate}% overall ({p.winRateGapPts}pt gap, {p.sessionCount} sessions).
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={sectionLabelStyle}>Unused Resources</div>
        {unusedRows.length === 0 ? (
          <div style={{ color: 'var(--ink-dim)', fontSize: 12.5 }}>No idle capability found yet for any rep.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {unusedRows.map(({ rep, findings }) => (
              <div key={rep.id} style={cardStyle}>
                <div style={repNameStyle}>{rep.name ?? 'Rep'}</div>
                {findings.map(f => (
                  <div key={f.step} style={metaStyle}>
                    <strong>{CLEAR_STEP_LABEL[f.step]}</strong> — proven in {OBJECTION_LABEL[f.provenContext]} ({f.provenRate}% of {f.provenSessionCount} sessions),
                    {' '}rarely used in {OBJECTION_LABEL[f.underusedContext]} ({f.underusedRate}% of {f.underusedSessionCount} sessions).
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={sectionLabelStyle}>Mastermind Coach</div>
        {mastermindRows.length === 0 ? (
          <div style={{ color: 'var(--ink-dim)', fontSize: 12.5 }}>No coaching insight generated yet for any rep.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mastermindRows.map(({ rep, insights }) => (
              <div key={rep.id} style={cardStyle}>
                <div style={repNameStyle}>{rep.name ?? 'Rep'}</div>
                {insights.map((insight, i) => (
                  <div key={i} style={{ ...metaStyle, marginTop: i === 0 ? 4 : 10, paddingTop: i === 0 ? 0 : 10, borderTop: i === 0 ? undefined : '1px solid var(--line)' }}>
                    <div><strong>Observation:</strong> {insight.observation}</div>
                    <div><strong>Pattern:</strong> {insight.pattern}</div>
                    <div><strong>Impact:</strong> {insight.impact}</div>
                    <div><strong>Alternative:</strong> {insight.alternative}</div>
                    <div><strong>Experiment:</strong> {insight.experiment.label}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
