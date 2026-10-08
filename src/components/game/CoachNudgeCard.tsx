'use client'
import { useT } from '@/lib/i18n'
import { useCoachNudge } from '@/hooks/useCoachNudge'

interface Props { onOpenCoach: (doctorId?: string) => void; onOpenDoctor: (doctorId: string) => void }

/** A single, snoozable reminder to debrief a visit; renders nothing when there is nothing to say. */
export default function CoachNudgeCard({ onOpenCoach, onOpenDoctor }: Props) {
  const t = useT()
  const { nudge, dismiss } = useCoachNudge()
  if (!nudge) return null

  const title = nudge.kind === 'planned_visit' ? t('nudge.plannedTitle', { name: nudge.doctorName })
    : nudge.kind === 'open_promise' ? t('nudge.promiseTitle', { name: nudge.doctorName })
    : nudge.kind === 'open_action' ? t('nudge.actionTitle', { name: nudge.doctorName })
    : t('nudge.quietTitle')
  const body = nudge.kind === 'planned_visit' ? t('nudge.plannedBody', { text: nudge.text })
    : nudge.kind === 'open_promise' ? t('nudge.promiseBody', { text: nudge.text, days: nudge.days })
    : nudge.kind === 'open_action' ? nudge.text
    : t('nudge.quietBody', { days: nudge.days })

  return (
    <section role="region" aria-label={title} style={{ border: '1px solid var(--amber)', borderRadius: 16, padding: 16, background: 'rgba(255,206,77,.06)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: 8 }}>🔔 {title}</div>
      <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{body}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={() => (nudge.kind === 'open_promise' ? onOpenDoctor(nudge.doctorId) : onOpenCoach(nudge.kind === 'quiet' ? undefined : nudge.doctorId))}
          style={{ cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--amber)', color: '#1a1200', background: 'var(--amber)', borderRadius: 10, padding: '11px 16px', touchAction: 'manipulation' }}>
          {nudge.kind === 'open_promise' ? t('nudge.openDoctor') : t('nudge.debrief')}
        </button>
        <button onClick={() => dismiss(nudge.key)}
          style={{ cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--line)', color: 'var(--ink-dim)', background: 'transparent', borderRadius: 10, padding: '11px 16px', touchAction: 'manipulation' }}>
          {t('nudge.later')}
        </button>
      </div>
    </section>
  )
}
