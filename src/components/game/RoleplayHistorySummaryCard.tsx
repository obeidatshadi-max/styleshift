'use client'
import { useT, useLang } from '@/lib/i18n'
import { summarizeRoleplayHistory, type RoleplayMetricKey } from '@/lib/roleplay-aggregate'
import { buildRoleplayBriefing, displayValue, meetsGoal, metricUnit, missedLanguageSkills } from '@/lib/roleplay-briefing'
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

const TREND_TIP_KEY: Record<RoleplayMetricKey, string> = {
  talkRatio: 'roleplay.trendTip.talkRatio',
  questionRatio: 'roleplay.trendTip.questionRatio',
  openQuestionRatio: 'roleplay.trendTip.openQuestionRatio',
  paraphraseScore: 'roleplay.trendTip.paraphraseScore',
  activeListening: 'roleplay.trendTip.activeListening',
  adaptationScore: 'roleplay.trendTip.adaptationScore',
}

type LanguageSkillKey = ReturnType<typeof missedLanguageSkills>[number]

const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 2 }
const label: React.CSSProperties = { color: 'var(--ink-dim)' }
const note: React.CSSProperties = { fontSize: 14, color: 'var(--ink-dim)', lineHeight: 1.45, marginBottom: 9, opacity: .85 }
const mono: React.CSSProperties = { fontFamily: 'var(--mono)' }

/**
 * Cumulative profiling summary across every saved roleplay session for one
 * doctor or colleague. Opens with a short "remember before you record again"
 * briefing, then explains each average (what it measures and the goal) so no
 * number appears without a meaning.
 */
export default function RoleplayHistorySummaryCard({ sessions, name }: { sessions: RoleplaySessionSummary[]; name?: string }) {
  const t = useT()
  const { lang } = useLang()
  const summary = summarizeRoleplayHistory(sessions)
  const brief = buildRoleplayBriefing(sessions)
  if (!summary || !brief) return null

  const lastDate = new Date(brief.lastAt).toLocaleDateString(lang === 'ar' ? 'ar' : 'en', { dateStyle: 'medium' })
  const who = name ?? t('roleplay.brief.thisPerson')
  const fmt = (metric: RoleplayMetricKey, value: number) => `${value}${metricUnit(metric)}`

  return (
    <div style={{ border: '1px solid var(--cyan)', borderRadius: 12, padding: '13px 14px', marginBottom: 12, background: 'rgba(56,214,255,.05)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 14, letterSpacing: 'normal', textTransform: 'none', color: 'var(--cyan)', marginBottom: 8 }}>
        {t('roleplay.brief.title')}
      </div>
      <div style={{ fontSize: 16, lineHeight: 1.55, marginBottom: 12 }}>
        <p style={{ margin: '0 0 6px' }}>
          {brief.count === 1 ? t('roleplay.brief.introOne', { name: who, date: lastDate }) : t('roleplay.brief.intro', { name: who, n: brief.count, date: lastDate })}
        </p>
        {brief.focus ? (
          <p style={{ margin: '0 0 6px', color: 'var(--amber)' }}>
            <strong>{t('roleplay.brief.workOn')}</strong> {t(`roleplay.insight.${brief.focus.metric}`, { value: brief.focus.value })}
          </p>
        ) : (
          <p style={{ margin: '0 0 6px', color: 'var(--green)' }}>{t('roleplay.brief.allGood')}</p>
        )}
        {brief.missedSkills.length > 0 && (
          <p style={{ margin: '0 0 6px', color: 'var(--amber)' }}>
            <strong>{t('roleplay.brief.skills')}</strong> {brief.missedSkills.map(k => t(`roleplay.brief.skill.${k}`)).join('; ')}.
          </p>
        )}
        {brief.strength && (
          <p style={{ margin: 0, color: 'var(--green)' }}>
            <strong>{t('roleplay.brief.didWell')}</strong> {t('roleplay.brief.strength', { metric: t(METRIC_LABEL_KEY[brief.strength.metric]), value: fmt(brief.strength.metric, brief.strength.value) })}
          </p>
        )}
      </div>

      <div style={{ fontFamily: 'var(--mono)', fontSize: 14, letterSpacing: 'normal', textTransform: 'none', color: 'var(--ink-dim)', marginBottom: 2 }}>
        {t('roleplay.summaryTitle')}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--ink-dim)', marginBottom: 10 }}>
        {t('roleplay.summarySessionCount', { n: summary.count })}
      </div>
      {METRIC_ORDER.filter(k => summary.averages[k] != null).map(k => {
        const avg = Math.round(summary.averages[k]!)
        return (
          <div key={k}>
            <div style={row}>
              <span style={label}>{t(METRIC_LABEL_KEY[k])}</span>
              <span style={{ ...mono, color: meetsGoal(k, avg) ? 'var(--green)' : 'var(--amber)' }}>{fmt(k, avg)}</span>
            </div>
            <div style={note}>{t(`roleplay.meaning.${k}`)} {t(`roleplay.goal.${k}`)}</div>
          </div>
        )
      })}
      {summary.trend && (
        <div style={{ marginTop: 8, fontSize: 14, color: summary.trend.direction === 'improving' ? 'var(--green)' : 'var(--amber)' }}>
          {t(summary.trend.direction === 'improving' ? 'roleplay.trendImproving' : 'roleplay.trendDeclining', {
            metric: t(METRIC_LABEL_KEY[summary.trend.metric]),
            delta: summary.trend.delta,
          })}
        </div>
      )}
      {/* Only on a decline — an improving trend needs no fix, and manufacturing
          one here would repeat buildRoleplayInsight's same "don't invent a
          critique when things are fine" rule at the history level. */}
      {summary.trend?.direction === 'declining' && (
        <div style={{ marginTop: 4, fontSize: 14, color: 'var(--ink-dim)', lineHeight: 1.5 }}>
          {t(TREND_TIP_KEY[summary.trend.metric])}
        </div>
      )}
    </div>
  )
}

/**
 * One saved roleplay session: each number says what it is and whether it met
 * its goal. Shared by doctor and colleague history so the two never drift.
 */
export function RoleplaySessionCard({ session, dateText }: { session: RoleplaySessionSummary; dateText: string }) {
  const t = useT()
  const minutes = Math.max(1, Math.round(session.duration_sec / 60))
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', background: 'var(--surface-subtle)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--ink-dim)', marginBottom: 6 }}>
        {dateText} · {t('roleplay.lengthMin', { n: minutes })}
      </div>
      {METRIC_ORDER.map(k => {
        const v = displayValue(session, k)
        if (v == null) return null
        const ok = meetsGoal(k, v)
        return (
          <div key={k} style={{ ...row, fontSize: 16, marginBottom: 3 }}>
            <span style={{ ...label, fontWeight: 600 }}>{t(METRIC_LABEL_KEY[k])}</span>
            <span>
              <span style={mono}>{v}{metricUnit(k)}</span>
              <span style={{ marginInlineStart: 8, fontSize: 14, color: ok ? 'var(--green)' : 'var(--amber)' }}>{t(ok ? 'roleplay.status.good' : 'roleplay.status.work')}</span>
            </span>
          </div>
        )
      })}
      {session.language && <SkillRows session={session} />}
    </div>
  )
}

/** Word-level skills for one session; amber when the rep did not show the skill. */
function SkillRows({ session }: { session: RoleplaySessionSummary }) {
  const t = useT()
  const l = session.language!
  const missed = new Set(missedLanguageSkills(session))
  const rows: { key: LanguageSkillKey; title: string; value: string }[] = [
    { key: 'empathy', title: t('lang.empathy.title'), value: l.empathy.needed === undefined ? String(l.empathy.count) : l.empathy.needed === 0 ? '—' : `${l.empathy.met ?? 0}/${l.empathy.needed}` },
    { key: 'paraphrasing', title: t('lang.paraphrasing.title'), value: l.paraphrasing.needed === undefined ? String(l.paraphrasing.count) : l.paraphrasing.needed === 0 ? '—' : `${l.paraphrasing.met ?? 0}/${l.paraphrasing.needed}` },
    { key: 'andBut', title: t('lang.andBut.title'), value: t('roleplay.skillAndBut', { and: l.andBut.and, but: l.andBut.but }) },
    { key: 'buildOnPositive', title: t('lang.build.title'), value: l.buildOnPositive.positives === 0 ? '—' : `${l.buildOnPositive.builtOn}/${l.buildOnPositive.positives}` },
  ]
  return (
    <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--line)' }}>
      {rows.map(r => (
        <div key={r.key} style={{ ...row, fontSize: 16, marginBottom: 3 }}>
          <span style={{ ...label, fontWeight: 600 }}>{r.title}</span>
          <span style={{ ...mono, color: missed.has(r.key) ? 'var(--amber)' : 'var(--green)' }}>{r.value}</span>
        </div>
      ))}
    </div>
  )
}
