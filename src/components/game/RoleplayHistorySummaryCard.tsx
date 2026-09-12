'use client'
import { useT } from '@/lib/i18n'
import { summarizeRoleplayHistory, type RoleplayMetricKey } from '@/lib/roleplay-aggregate'
import type { RoleplaySessionSummary } from '@/types/game'

const METRIC_LABEL_KEY: Record<RoleplayMetricKey, string> = {
  talkRatio: 'roleplay.talkRatio',
  questionRatio: 'roleplay.questionRatio',
  openQuestionRatio: 'roleplay.openQuestionRatio',
  paraphraseScore: 'roleplay.paraphraseScore',
  activeListening: 'roleplay.activeListeningTitle',
  adaptationScore: 'roleplay.adaptationTitle',
}

const METRIC_ORDER: RoleplayMetricKey[] = ['talkRatio', 'questionRatio', 'openQuestionRatio', 'paraphraseScore', 'activeListening', 'adaptationScore']

const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }
const label: React.CSSProperties = { color: 'var(--ink-dim)' }

/**
 * Cumulative profiling summary across every saved roleplay session for one
 * doctor or colleague — averages plus the single most notable trend, so
 * multiple sessions become one report instead of a raw list.
 */
export default function RoleplayHistorySummaryCard({ sessions }: { sessions: RoleplaySessionSummary[] }) {
  const t = useT()
  const summary = summarizeRoleplayHistory(sessions)
  if (!summary) return null

  return (
    <div style={{ border: '1px solid var(--cyan)', borderRadius: 12, padding: '13px 14px', marginBottom: 12, background: 'rgba(56,214,255,.05)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 4 }}>
        {t('roleplay.summaryTitle')}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-dim)', marginBottom: 10 }}>
        {t('roleplay.summarySessionCount', { n: summary.count })}
      </div>
      {METRIC_ORDER.filter(k => summary.averages[k] != null).map(k => (
        <div key={k} style={row}>
          <span style={label}>{t(METRIC_LABEL_KEY[k])}</span>
          <span style={{ fontFamily: 'var(--mono)' }}>{Math.round(summary.averages[k]!)}{k === 'activeListening' ? '' : '%'}</span>
        </div>
      ))}
      {summary.trend && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: summary.trend.direction === 'improving' ? 'var(--green)' : 'var(--amber)' }}>
          {t(summary.trend.direction === 'improving' ? 'roleplay.trendImproving' : 'roleplay.trendDeclining', {
            metric: t(METRIC_LABEL_KEY[summary.trend.metric]),
            delta: summary.trend.delta,
          })}
        </div>
      )}
    </div>
  )
}
