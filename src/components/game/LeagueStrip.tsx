'use client'
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n'
import type { LeagueBoard } from '@/lib/leagues'

export default function LeagueStrip() {
  const t = useT()
  const [board, setBoard] = useState<LeagueBoard | null>(null)
  const [open, setOpen] = useState(false)
  const gold = 'var(--amber)'

  useEffect(() => {
    let alive = true
    fetch('/api/league')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive) setBoard(d) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  if (!board) return null

  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', textAlign: 'start', cursor: 'pointer',
          background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 18px', color: 'var(--ink)' }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>🏅 {board.leagueName}</span>
        <span style={{ fontSize: 16, color: gold, fontWeight: 800 }}>
          {board.selfRank ? t('league.yourRank', { n: board.selfRank, total: board.teams.length }) : ''}
        </span>
      </button>

      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,18,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 'min(440px,92vw)', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 16, padding: 18 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 14, letterSpacing: 'normal', textTransform: 'none', color: 'var(--cyan)', marginBottom: 14 }}>
              🏅 {board.leagueName}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {board.teams.map(team => (
                <div key={team.companyId}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10,
                    background: team.isSelf ? 'rgba(232,192,96,.12)' : 'transparent',
                    border: team.isSelf ? '1px solid var(--amber)' : '1px solid var(--line)' }}>
                  <span style={{ fontSize: 16, fontWeight: 800, width: 26, color: team.rank === 1 ? 'var(--amber)' : 'var(--ink-dim)' }}>#{team.rank}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: team.isSelf ? 800 : 600 }}>{team.name}</span>
                  <span style={{ fontSize: 16, fontWeight: 800 }}>{team.avgXp.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, fontSize: 14, color: 'var(--ink-dim)', textAlign: 'center' }}>{t('league.avgPerRep')}</div>
          </div>
        </div>
      )}
    </>
  )
}
