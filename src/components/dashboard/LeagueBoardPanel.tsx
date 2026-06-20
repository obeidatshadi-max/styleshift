import type { LeagueBoard } from '@/lib/leagues'

// Presentational full league table for managers. English copy to match the
// rest of the dashboard. Team name + avg score only — no cross-team rep detail.
export default function LeagueBoardPanel({ board }: { board: LeagueBoard }) {
  const gold = '#e8c060'
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--ink-dim)', marginBottom: 12 }}>{board.leagueName}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: 'var(--ink-dim)', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px' }}>Rank</th>
            <th style={{ padding: '6px 8px' }}>Team</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Avg XP / rep</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Reps</th>
          </tr>
        </thead>
        <tbody>
          {board.teams.map(team => (
            <tr key={team.companyId}
              style={{ background: team.isSelf ? 'rgba(232,192,96,.1)' : 'transparent', borderTop: '1px solid var(--line)' }}>
              <td style={{ padding: '8px', fontWeight: 800, color: team.rank === 1 ? gold : 'var(--ink)' }}>#{team.rank}</td>
              <td style={{ padding: '8px', fontWeight: team.isSelf ? 800 : 600 }}>{team.name}{team.isSelf ? ' (you)' : ''}</td>
              <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800 }}>{team.avgXp.toLocaleString()}</td>
              <td style={{ padding: '8px', textAlign: 'right', color: 'var(--ink-dim)' }}>{team.repCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
