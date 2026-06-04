import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getTeamStatsForUser } from '@/lib/team-stats'
import { RANKS } from '@/lib/game-data'
import RecognitionCard from '@/components/dashboard/RecognitionCard'

function rankTitle(xp: number): string {
  return [...RANKS].reverse().find(r => xp >= r.minXp)?.name ?? RANKS[0].name
}

// Manager-triggered recognition card for the current #1 rep (top of the XP
// leaderboard), ready to download as an image and share company-wide.
export default async function RecognitionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const stats = await getTeamStatsForUser(user.id)
  if (!stats) redirect('/onboarding')

  const top = stats.reps.find(r => r.xp > 0) ?? null
  const period = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <div style={{ minHeight: '100vh', padding: 24 }}>
      <style>{`@media print { .no-print { display: none !important; } }`}</style>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <a href="/dashboard" style={{ color: 'var(--cyan)', textDecoration: 'none', fontSize: 14 }}>← Back to dashboard</a>
          <a href="/dashboard/report" style={{ color: 'var(--ink-dim)', textDecoration: 'none', fontSize: 13 }}>Team report →</a>
        </div>

        {top ? (
          <RecognitionCard
            name={top.display_name || 'Top Performer'}
            avatarUrl={top.avatar_url}
            xp={top.xp}
            rankTitle={rankTitle(top.xp)}
            companyName={stats.companyName}
            period={period}
          />
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--ink-dim)', padding: '60px 20px', border: '1px solid var(--line)', borderRadius: 16 }}>
            No one has earned XP yet. Once your reps start playing, the top performer&rsquo;s card will appear here.
          </div>
        )}

        {top && !top.avatar_url && (
          <p className="no-print" style={{ textAlign: 'center', color: 'var(--ink-dim)', fontSize: 12.5, marginTop: 16, lineHeight: 1.5 }}>
            {top.display_name || 'This rep'} hasn&rsquo;t added a photo yet — the card shows a monogram. Reps can add a photo from their game home screen (&ldquo;Track Your Mastery&rdquo;).
          </p>
        )}
      </div>
    </div>
  )
}
