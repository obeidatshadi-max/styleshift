import type { VoiceStats } from '@/lib/voice-stats'

const MODE_LABEL: Record<string, string> = {
  objection: 'Objection (CLEAR)', opening: 'Opening Statement', question: 'Question Drill',
  fab: 'Features & Benefits', closing: 'Closing',
}

interface Props {
  stats: VoiceStats
  reps: { id: string; name: string | null }[]
}

export default function VoicePracticePanel({ stats, reps }: Props) {
  if (stats.totalSessions === 0) {
    return (
      <div style={{ color: 'var(--ink-dim)', fontSize: 12.5, lineHeight: 1.5 }}>
        No AI voice-partner sessions completed yet. This panel fills in as reps practice objection handling, opening statements, and the other voice drills.
      </div>
    )
  }

  const th: React.CSSProperties = { textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-dim)', padding: '0 8px 8px' }
  const td: React.CSSProperties = { fontSize: 13, padding: '8px', borderTop: '1px solid var(--line)' }

  const practicedReps = reps
    .map(r => ({ ...r, ...stats.byRep.get(r.id) }))
    .filter((r): r is typeof r & { sessionsCompleted: number; lastPracticed: string } => !!r.sessionsCompleted)
    .sort((a, b) => b.sessionsCompleted - a.sessionsCompleted)
  const silentCount = reps.length - practicedReps.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 8 }}>By mode</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Mode</th><th style={th}>Completed</th><th style={th}>Errors</th></tr></thead>
            <tbody>
              {stats.byMode.map(m => (
                <tr key={m.mode}>
                  <td style={td}>{MODE_LABEL[m.mode]}</td>
                  <td style={{ ...td, fontFamily: 'var(--mono)', color: 'var(--cyan)' }}>{m.sessionsCompleted}</td>
                  <td style={{ ...td, fontFamily: 'var(--mono)', color: m.errorEvents > 0 ? 'var(--red)' : 'var(--ink-dim)' }}>{m.errorEvents}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {stats.byLang.some(l => l.sessionsCompleted + l.errorEvents > 0) && (
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 8 }}>By language</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {stats.byLang.map(l => {
              const total = l.sessionsCompleted + l.errorEvents
              const errorRate = total ? Math.round((l.errorEvents / total) * 100) : 0
              return (
                <div key={l.lang} style={{ flex: '1 1 140px', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 12px', background: 'rgba(0,0,0,.18)' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 4 }}>{l.lang === 'ar' ? 'Arabic' : 'English'}</div>
                  <div style={{ fontSize: 13 }}>
                    {l.sessionsCompleted} completed · <span style={{ color: errorRate > 20 ? 'var(--red)' : 'var(--ink-dim)' }}>{errorRate}% error rate</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {practicedReps.length > 0 && (
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 8 }}>By rep</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {practicedReps.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'rgba(0,0,0,.18)' }}>
                <span style={{ fontSize: 13 }}>{r.name ?? 'Rep'}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-dim)' }}>
                  {r.sessionsCompleted} session{r.sessionsCompleted === 1 ? '' : 's'} · last {new Date(r.lastPracticed).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {silentCount > 0 && (
        <div style={{ fontSize: 12, color: 'var(--amber)' }}>
          {silentCount} rep{silentCount === 1 ? '' : 's'} with no completed voice sessions yet.
        </div>
      )}
    </div>
  )
}
