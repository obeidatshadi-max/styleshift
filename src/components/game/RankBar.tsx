'use client'
import { getRank, getNextRank, calcXpPct } from '@/lib/game-logic'

interface Props { xp: number }

export default function RankBar({ xp }: Props) {
  const rank = getRank(xp)
  const next = getNextRank(xp)
  const isMaster = !next
  const pct = calcXpPct(xp)
  const xpLabel = isMaster ? `${xp} XP` : `${xp} / ${next!.minXp} XP`
  const nextLabel = isMaster ? 'MAX' : next!.name

  return (
    <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:14, flexWrap:'wrap' }}>
      <div style={{
        fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.18em', textTransform:'uppercase',
        border:`1px solid ${isMaster ? 'var(--amber)' : 'var(--cyan)'}`,
        color: isMaster ? 'var(--amber)' : 'var(--cyan)',
        borderRadius:20, padding:'6px 14px',
        background: isMaster ? 'rgba(255,206,77,.08)' : 'rgba(56,214,255,.08)',
        whiteSpace:'nowrap' as const,
      }}>
        {rank.name}
      </div>
      <div style={{ flex:1, minWidth:160 }}>
        <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.12em', color:'var(--ink-dim)', marginBottom:4 }}>
          <span>{xpLabel}</span><span>→ {nextLabel}</span>
        </div>
        <div style={{ height:10, borderRadius:6, background:'rgba(0,0,0,.4)', border:'1px solid var(--line)', overflow:'hidden' }}>
          <div style={{ height:'100%', borderRadius:6, background:'linear-gradient(90deg,var(--cyan),var(--purple))', width:`${pct}%`, transition:'width .6s cubic-bezier(.2,.8,.2,1)' }} />
        </div>
      </div>
    </div>
  )
}
