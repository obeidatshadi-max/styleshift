'use client'

interface DayStat { day: string; count: number }
interface Props { activity: DayStat[] }

export default function ActivityBar({ activity }: Props) {
  const max = Math.max(...activity.map(d => d.count), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60 }}>
      {activity.map(d => {
        const pct = Math.round((d.count / max) * 100)
        const label = new Date(d.day + 'T12:00:00').toLocaleDateString('en', { weekday: 'short' })
        const isToday = d.day === new Date().toISOString().slice(0, 10)
        return (
          <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: d.count > 0 ? 'var(--cyan)' : 'var(--ink-dim)' }}>{d.count || ''}</div>
            <div style={{ width: '100%', height: `${Math.max(pct, 8)}%`, minHeight: d.count > 0 ? 6 : 2, borderRadius: 4, background: isToday ? 'var(--cyan)' : d.count > 0 ? 'rgba(56,214,255,.45)' : 'var(--line)', transition: 'height .4s ease', boxShadow: isToday ? 'var(--glow-cyan)' : 'none' }} />
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: isToday ? 'var(--cyan)' : 'var(--ink-dim)', fontWeight: isToday ? 700 : 400 }}>{label}</div>
          </div>
        )
      })}
    </div>
  )
}
