'use client'
import { useState } from 'react'
import { useT } from '@/lib/i18n'
import { useDoctorVisits } from '@/hooks/useDoctorVisits'
import { useDoctorCoachDebriefs } from '@/hooks/useDoctorCoachDebriefs'
import { buildVisitBrief } from '@/lib/visit-brief'
import type { Doctor } from '@/types/game'

const label: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 4, display: 'block' }
const text: React.CSSProperties = { fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }

/** What to know before walking in: the goal, promises still owed, and what happened last time. Hidden when empty. */
export default function VisitBrief({ doctor }: { doctor: Doctor }) {
  const t = useT()
  const { visits, loading, completePromise } = useDoctorVisits(doctor.id)
  const { debriefs, loading: debriefsLoading } = useDoctorCoachDebriefs(doctor.id)
  const [failedId, setFailedId] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
  if (loading || debriefsLoading) return null

  const brief = buildVisitBrief(doctor, visits, debriefs, now)
  if (!brief.hasContent) return null

  return (
    <section aria-label={t('brief.title')} style={{ background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,.45)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.3em', textTransform: 'uppercase', color: 'var(--cyan)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--cyan)', boxShadow: 'var(--glow-cyan)', display: 'inline-block' }} />
        {t('brief.title')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {brief.lastContactDaysAgo !== null && <div style={{ fontSize: 12.5, color: 'var(--ink-dim)' }}>{t('brief.lastContact', { days: brief.lastContactDaysAgo })}</div>}
        {brief.goal && <div><span style={label}>{t('brief.goal')}</span><div style={text}>{brief.goal}</div>{brief.measure && <div style={{ ...text, color: 'var(--ink-dim)', marginTop: 4 }}>{t('brief.measure', { text: brief.measure })}</div>}</div>}
        {brief.promises.length > 0 && <div>
          <span style={label}>{t('brief.promises')}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {brief.promises.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, border: '1px solid var(--amber)', borderRadius: 10, padding: '9px 11px', background: 'rgba(255,206,77,.05)' }}>
                <div style={{ flex: 1 }}>
                  <div style={text}>{p.text}</div>
                  <div style={{ fontSize: 11.5, color: failedId === p.id ? 'var(--red)' : 'var(--ink-dim)', marginTop: 2 }}>{failedId === p.id ? t('brief.promiseError') : t('brief.promiseAge', { days: p.daysAgo })}</div>
                </div>
                <button disabled={p.id.startsWith('offline-')} onClick={async () => setFailedId((await completePromise(p.id)) ? null : p.id)}
                  style={{ cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', border: '1px solid var(--green)', color: 'var(--green)', background: 'transparent', borderRadius: 8, padding: '7px 10px', flexShrink: 0, touchAction: 'manipulation' }}>
                  ✓ {t('brief.kept')}
                </button>
              </div>
            ))}
          </div>
        </div>}
        {brief.lastNextAction && <div><span style={label}>{t('brief.nextAction')}</span><div style={text}>{brief.lastNextAction}</div></div>}
        {brief.lastObjection && <div><span style={label}>{t('brief.objection')}</span><div style={text}>{brief.lastObjection}</div></div>}
        {brief.whatWorked && <div><span style={label}>{t('brief.worked')}</span><div style={text}>{brief.whatWorked}</div></div>}
        {brief.hiddenConcern && <div><span style={label}>{t('brief.concern')}</span><div style={text}>{brief.hiddenConcern}</div></div>}
      </div>
    </section>
  )
}
