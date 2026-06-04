import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getTeamStatsForUser } from '@/lib/team-stats'
import PrintButton from '@/components/dashboard/PrintButton'

// Light-themed, print-optimized snapshot of the team's performance, meant to be
// saved as PDF (or printed) and shared with upper management. Separate from the
// dark interactive dashboard so it reads cleanly on paper.
export default async function ReportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const stats = await getTeamStatsForUser(user.id)
  if (!stats) redirect('/onboarding')

  const flagCount = stats.reps.filter(r => r.flag).length
  const avgAccuracy = stats.reps.length
    ? Math.round(stats.reps.reduce((s, r) => s + r.avg_accuracy, 0) / stats.reps.length)
    : 0
  const totalSessions = stats.reps.reduce((s, r) => s + r.total_sessions, 0)
  const generated = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const ink = '#0f1c33'
  const dim = '#5b6b85'
  const line = '#dde3ec'
  const accent = '#0a7ea4'

  const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: dim, padding: '8px 10px', borderBottom: `2px solid ${line}` }
  const td: React.CSSProperties = { fontSize: 13, color: ink, padding: '9px 10px', borderBottom: `1px solid ${line}` }

  return (
    <div style={{ background: '#fff', color: ink, minHeight: '100vh' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { margin: 14mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div style={{ maxWidth: 820, margin: '0 auto', padding: 28, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>

        {/* Toolbar (screen only) */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <a href="/dashboard" style={{ color: accent, textDecoration: 'none', fontSize: 14 }}>← Back to dashboard</a>
          <PrintButton label="Print / Save as PDF" />
        </div>

        {/* Report header */}
        <header style={{ borderBottom: `3px solid ${accent}`, paddingBottom: 14, marginBottom: 22 }}>
          <div style={{ fontSize: 12, letterSpacing: '.3em', textTransform: 'uppercase', color: accent, fontWeight: 700 }}>StyleShift · Team Performance Report</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: '6px 0 2px' }}>{stats.companyName}</h1>
          <div style={{ fontSize: 13, color: dim }}>Generated {generated} · {stats.reps.length} reps · {totalSessions} sessions played</div>
        </header>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 26 }}>
          {[
            { label: 'Total Reps', val: String(stats.reps.length) },
            { label: 'Avg Accuracy', val: stats.reps.length ? `${avgAccuracy}%` : '—' },
            { label: 'Need Coaching', val: String(flagCount) },
          ].map(k => (
            <div key={k.label} style={{ border: `1px solid ${line}`, borderRadius: 10, padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: dim }}>{k.label}</div>
              <div style={{ fontSize: 30, fontWeight: 800, margin: '4px 0', color: accent }}>{k.val}</div>
            </div>
          ))}
        </div>

        {/* Leaderboard */}
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 10px' }}>Team Leaderboard</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 26 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 36 }}>#</th>
              <th style={th}>Rep</th>
              <th style={{ ...th, textAlign: 'right' }}>XP</th>
              <th style={{ ...th, textAlign: 'right' }}>Sessions</th>
              <th style={{ ...th, textAlign: 'right' }}>Avg Acc.</th>
              <th style={{ ...th, textAlign: 'right' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {stats.reps.length === 0 ? (
              <tr><td style={td} colSpan={6}>No reps have joined yet.</td></tr>
            ) : stats.reps.map((r, i) => (
              <tr key={r.id}>
                <td style={{ ...td, color: dim }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                <td style={{ ...td, fontWeight: 600 }}>{r.display_name || '—'}</td>
                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.xp.toLocaleString()}</td>
                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.total_sessions}</td>
                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.total_sessions ? `${r.avg_accuracy}%` : '—'}</td>
                <td style={{ ...td, textAlign: 'right', color: r.flag ? '#c0392b' : '#1e8e5a', fontWeight: 600 }}>{r.flag ? 'Coaching' : r.total_sessions ? 'On track' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Skill gaps */}
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 10px' }}>Skill Gap by Level</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 26 }}>
          <thead>
            <tr><th style={th}>Level</th><th style={{ ...th, textAlign: 'right' }}>Team Avg Accuracy</th></tr>
          </thead>
          <tbody>
            {stats.levelAccuracy.map(l => (
              <tr key={l.level}>
                <td style={td}>{l.level}. {l.title}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: l.avg === 0 ? dim : l.avg < 70 ? '#c0392b' : '#1e8e5a' }}>{l.avg === 0 ? '—' : `${l.avg}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Activity */}
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 10px' }}>Activity · Last 7 Days</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 26 }}>
          <thead>
            <tr><th style={th}>Day</th><th style={{ ...th, textAlign: 'right' }}>Sessions</th></tr>
          </thead>
          <tbody>
            {stats.activity.map(a => (
              <tr key={a.day}>
                <td style={td}>{new Date(a.day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{a.count}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer style={{ borderTop: `1px solid ${line}`, paddingTop: 12, fontSize: 11, color: dim }}>
          StyleShift — Social Style training (Driver · Expressive · Amiable · Analytical) · psychologytobusiness.com
        </footer>
      </div>
    </div>
  )
}
