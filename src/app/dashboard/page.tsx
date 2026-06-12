import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getTeamStatsForUser } from '@/lib/team-stats'
import { getAssignmentForManager } from '@/lib/assignments'
import { getTeamPulse } from '@/lib/team-pulse'
import Leaderboard from '@/components/dashboard/Leaderboard'
import SkillHeatmap from '@/components/dashboard/SkillHeatmap'
import ActivityBar from '@/components/dashboard/ActivityBar'
import AssignPanel from '@/components/dashboard/AssignPanel'
import TeamPulsePanel from '@/components/dashboard/TeamPulse'

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,.45)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.3em', textTransform: 'uppercase', color: 'var(--cyan)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--cyan)', boxShadow: 'var(--glow-cyan)', display: 'inline-block' }} />
        {title}
      </div>
      {children}
    </section>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const stats = await getTeamStatsForUser(user.id)
  // Not a manager (or no company yet) → send them to create a team
  if (!stats) redirect('/onboarding')

  const assignment = await getAssignmentForManager(user.id)
  const pulse = await getTeamPulse(user.id, stats, assignment)

  const flagCount = stats?.reps.filter(r => r.flag).length ?? 0
  const avgAccuracy = stats?.reps.length
    ? Math.round(stats.reps.reduce((s, r) => s + r.avg_accuracy, 0) / stats.reps.length)
    : 0
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://style-shift.netlify.app'

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 1040, margin: '0 auto', padding: 14 }}>

      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0 18px', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.45em', color: 'var(--cyan)', textTransform: 'uppercase' }}>Manager Dashboard</div>
          <h1 style={{ fontSize: 'clamp(20px,4vw,32px)', fontWeight: 800, marginTop: 4 }}>
            STYLE<span style={{ color: 'var(--cyan)' }}>SHIFT</span>
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a href="/dashboard/recognition" style={{ background: '#e8c060', color: '#1a1402', border: '1px solid #e8c060', borderRadius: 10, padding: '10px 16px', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', fontWeight: 700 }}>
            🏆 Recognize #1
          </a>
          <a href="/dashboard/report" style={{ background: 'var(--cyan)', color: '#04121f', border: '1px solid var(--cyan)', borderRadius: 10, padding: '10px 16px', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', fontWeight: 700 }}>
            🖨 Report
          </a>
          <a href="/play" style={{ background: 'transparent', color: 'var(--cyan)', border: '1px solid var(--cyan)', borderRadius: 10, padding: '10px 16px', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            ← Game
          </a>
        </div>
      </header>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 14 }}>
        {[
          { label: 'Total Reps', val: stats?.reps.length ?? 0, color: 'var(--cyan)' },
          { label: 'Avg Accuracy', val: stats?.reps.length ? `${avgAccuracy}%` : '—', color: 'var(--green)' },
          { label: 'Need Coaching', val: flagCount, color: flagCount > 0 ? 'var(--red)' : 'var(--green)' },
        ].map(k => (
          <div key={k.label} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, background: 'rgba(0,0,0,.2)', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-dim)' }}>{k.label}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700, margin: '6px 0 2px', color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Panel title="Team Pulse"><TeamPulsePanel pulse={pulse} siteUrl={siteUrl} /></Panel>
        <Panel title="Coach Assignment">
          <AssignPanel current={assignment} reps={stats.reps.map(r => ({ id: r.id, name: r.display_name }))} />
        </Panel>
        <Panel title="Team Leaderboard"><Leaderboard reps={stats?.reps ?? []} /></Panel>
        <Panel title="Skill Gap Heatmap"><SkillHeatmap levelAccuracy={stats?.levelAccuracy ?? []} /></Panel>
        <Panel title="Activity This Week"><ActivityBar activity={stats?.activity ?? []} /></Panel>
        {stats?.inviteCode && (
          <Panel title="Invite Link">
            <div style={{ background: 'rgba(0,0,0,.3)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--cyan)', wordBreak: 'break-all' }}>
              {siteUrl}/invite/{stats.inviteCode}
            </div>
            <div style={{ color: 'var(--ink-dim)', fontSize: 12, marginTop: 8 }}>Share this link with reps to join your team.</div>
          </Panel>
        )}
      </div>
    </div>
  )
}
