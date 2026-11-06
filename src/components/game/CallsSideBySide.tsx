'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useLang, useT } from '@/lib/i18n'
import { buildCallGroups, type CallColumn, type CallGroup, type CallReportRow, type CallSession } from '@/lib/report/callsSideBySide'

const SESSION_LIMIT = 30

const label: React.CSSProperties = { fontSize: 13, color: 'var(--ink-dim)', fontWeight: 600 }
const text: React.CSSProperties = { fontSize: 15, lineHeight: 1.5, margin: 0 }
const note: React.CSSProperties = { fontSize: 13, lineHeight: 1.45, color: 'var(--ink-dim)', margin: '4px 0 0' }

/**
 * One colleague's calls, each with the statements its report quoted, next to each other and grouped by the doctor
 * the colleague played. It shows no score and no count, and reaches no conclusion about a trait: it only lays out
 * what was said so the rep can compare for themselves.
 */
export default function CallsSideBySide({ colleagueId }: { colleagueId: string }) {
  const t = useT()
  const { lang } = useLang()
  const [groups, setGroups] = useState<CallGroup[] | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { if (!cancelled) setGroups([]); return }
        const { data: sessionRows, error: sErr } = await supabase.from('roleplay_sessions')
          .select('id, created_at, doctor_id').eq('colleague_id', colleagueId).eq('rep_id', user.id)
          .order('created_at', { ascending: false }).limit(SESSION_LIMIT)
        if (sErr) throw sErr
        const sessions = (sessionRows ?? []) as CallSession[]
        if (sessions.length === 0) { if (!cancelled) setGroups([]); return }

        const { data: reportRows, error: rErr } = await supabase.from('conversation_reports')
          .select('session_id, created_at, superseded_by, usual:report->socialStyle->usualVsToday')
          .eq('session_type', 'human_partner').eq('rep_id', user.id).eq('status', 'complete')
          .in('session_id', sessions.map(s => s.id))
        if (rErr) throw rErr

        const doctorIds = [...new Set(sessions.map(s => s.doctor_id).filter((id): id is string => !!id))]
        const found: Record<string, string> = {}
        if (doctorIds.length > 0) {
          const { data: doctors } = await supabase.from('doctors').select('id, name').eq('rep_id', user.id).in('id', doctorIds)
          for (const d of (doctors ?? []) as { id: string; name: string }[]) found[d.id] = d.name
        }
        if (cancelled) return
        setNames(found)
        setGroups(buildCallGroups(sessions, (reportRows ?? []) as CallReportRow[]))
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => { cancelled = true }
  }, [colleagueId])

  if (failed) return <p style={note} role="alert">{t('calls.failed')}</p>
  if (groups === null || groups.length === 0) return null
  return <CallsView groups={groups} names={names} />
}

/** Statements from the same line share one quote, so the colleague's words are not repeated. */
function sharedQuotes(observations: CallColumn['observations']) {
  const groups: { quote: string; categories: CallColumn['observations'][number]['category'][] }[] = []
  for (const o of observations) {
    const g = groups.find(x => x.quote === o.quote)
    if (g) { if (!g.categories.includes(o.category)) g.categories.push(o.category) } else groups.push({ quote: o.quote, categories: [o.category] })
  }
  return groups
}

/** The display alone: the groups of calls and the doctor names. Kept apart from loading so it can be checked without a database. */
export function CallsView({ groups, names }: { groups: CallGroup[]; names: Record<string, string> }) {
  const t = useT()
  const { lang } = useLang()
  const ready = groups.reduce((n, g) => n + g.calls.filter(c => c.status === 'ready').length, 0)
  const dateOf = (iso: string) => new Date(iso).toLocaleString(lang === 'ar' ? 'ar' : 'en', { dateStyle: 'short', timeStyle: 'short' })

  return (
    <section aria-labelledby="calls-side-by-side" data-testid="calls-side-by-side" style={{ border: '1px solid var(--line)', borderRadius: 16, padding: 16, background: 'var(--panel)' }}>
      <h3 id="calls-side-by-side" style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>{t('calls.title')}</h3>
      <p style={note}>{t('calls.intro')}</p>
      {ready < 2 && <p style={note}>{t('calls.needTwo')}</p>}

      {groups.map(g => (
        <div key={g.doctorId ?? 'none'} style={{ marginTop: 14 }}>
          <div style={label}>{g.doctorId && names[g.doctorId] ? names[g.doctorId] : t('calls.noDoctor')}</div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, marginTop: 6, scrollSnapType: 'x proximity' }}>
            {g.calls.map(c => (
              <article key={c.sessionId} data-testid="call-column" style={{ flex: '0 0 220px', scrollSnapAlign: 'start', border: '1px solid var(--line)', borderRadius: 12, padding: 12, background: 'var(--surface-subtle)' }}>
                <div style={label}>{dateOf(c.createdAt)}</div>
                {c.practice && <p style={note}>{t('report.usual.practice', { style: t(`report.socialStyle.style.${c.practice.style}`) })}</p>}
                {c.status === 'no_report' && <p style={{ ...text, marginTop: 8, color: 'var(--ink-dim)' }}>{t('calls.noReport')}</p>}
                {c.status === 'older_report' && <p style={{ ...text, marginTop: 8, color: 'var(--ink-dim)' }}>{t('calls.olderReport')}</p>}
                {c.status === 'ready' && c.observations.length === 0 && <p style={{ ...text, marginTop: 8 }}>{t('calls.noObs')}</p>}
                {c.status === 'ready' && sharedQuotes(c.observations).map(g => (
                  <div key={g.quote} style={{ marginTop: 8 }}>
                    {g.categories.map(cat => <p key={cat} style={text}>{t(`report.usual.obs.${cat}`)}</p>)}
                    <p style={{ ...note, borderInlineStart: '3px solid var(--line)', paddingInlineStart: 8 }}>{t('report.usual.said')}: “<bdi>{g.quote}</bdi>”</p>
                  </div>
                ))}
                {c.status === 'ready' && c.limited && <p style={note}>{t('calls.limited')}</p>}
              </article>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
