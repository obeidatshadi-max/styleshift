'use client'
import { useState } from 'react'
import type { RepStat } from '@/app/api/team-stats/route'
import { getRank } from '@/lib/game-logic'

interface Props { reps: RepStat[] }

function AssignButton({ repName }: { repName: string }) {
  const [sent, setSent] = useState(false)
  function assign() {
    const link = `${window.location.origin}/play`
    navigator.clipboard.writeText(`Hi ${repName}, please practice StyleShift today: ${link}`)
    setSent(true)
    setTimeout(() => setSent(false), 2000)
  }
  return (
    <button onClick={assign}
      style={{ background: 'rgba(255,93,108,.12)', border: '1px solid var(--red)', color: 'var(--red)', borderRadius: 8, padding: '3px 8px', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {sent ? '✓ Copied' : '🚩 Assign'}
    </button>
  )
}

export default function Leaderboard({ reps }: Props) {
  if (!reps.length) return (
    <div style={{ textAlign: 'center', color: 'var(--ink-dim)', fontFamily: 'var(--mono)', fontSize: 13, padding: 20 }}>
      No reps yet — share the invite link to add your team.
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px 100px', gap: 8, padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', borderBottom: '1px solid var(--line)' }}>
        <span>Rep</span>
        <span style={{ textAlign: 'center' }}>Rank</span>
        <span style={{ textAlign: 'center' }}>Accuracy</span>
        <span style={{ textAlign: 'center' }}>Sessions</span>
        <span style={{ textAlign: 'center' }}>Status</span>
      </div>
      {reps.map((rep, i) => {
        const rank = getRank(rep.xp)
        const today = new Date().toISOString().slice(0, 10)
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
        const active = rep.last_visit === today || rep.last_visit === yesterday
        return (
          <div key={rep.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px 100px', gap: 8, padding: '12px', borderBottom: '1px solid var(--line)', background: i % 2 === 0 ? 'rgba(0,0,0,.1)' : 'transparent', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{rep.display_name || rep.id.slice(0, 8)}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-dim)' }}>{rep.xp} XP</div>
            </div>
            <div style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--cyan)' }}>{rank.name}</div>
            <div style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: rep.avg_accuracy >= 90 ? 'var(--green)' : rep.avg_accuracy >= 70 ? 'var(--amber)' : rep.avg_accuracy > 0 ? 'var(--red)' : 'var(--ink-dim)' }}>
              {rep.avg_accuracy > 0 ? `${rep.avg_accuracy}%` : '—'}
            </div>
            <div style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--ink-dim)' }}>{rep.total_sessions}</div>
            <div style={{ textAlign: 'center' }}>
              {rep.flag ? <AssignButton repName={rep.display_name || rep.id.slice(0, 8)} /> : active ? '🔥' : '—'}
            </div>
          </div>
        )
      })}
    </div>
  )
}
