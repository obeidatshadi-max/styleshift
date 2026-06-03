'use client'

interface LevelStat { level: number; title: string; avg: number }
interface Props { levelAccuracy: LevelStat[] }

const LEVEL_COLORS = ['var(--purple)', 'var(--red)', 'var(--pink)', 'var(--cyan)']

export default function SkillHeatmap({ levelAccuracy }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {levelAccuracy.map((l, i) => (
        <div key={l.level}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em', marginBottom: 5 }}>
            <span style={{ color: LEVEL_COLORS[i] }}>L{l.level} · {l.title}</span>
            <span style={{ color: l.avg >= 90 ? 'var(--green)' : l.avg >= 70 ? 'var(--amber)' : l.avg > 0 ? 'var(--red)' : 'var(--ink-dim)' }}>
              {l.avg > 0 ? `${l.avg}%` : 'No data'}
            </span>
          </div>
          <div style={{ height: 10, borderRadius: 6, background: 'rgba(0,0,0,.4)', border: '1px solid var(--line)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${l.avg}%`, borderRadius: 6, background: l.avg >= 90 ? 'var(--green)' : l.avg >= 70 ? 'var(--amber)' : 'var(--red)', transition: 'width .6s ease' }} />
          </div>
          {l.avg > 0 && l.avg < 70 && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)', marginTop: 3 }}>⚠ Below 70% — recommend drilling this level</div>
          )}
        </div>
      ))}
    </div>
  )
}
