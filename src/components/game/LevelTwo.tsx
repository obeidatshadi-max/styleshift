'use client'
import { useState, useRef } from 'react'
import { L2, STYLES, XP_VALUES } from '@/lib/game-data'
import type { BadgeName } from '@/types/game'
import { Topline, OptBtn, Feedback, NextRow, Meter } from './helpers'

interface Props {
  onComplete: (results: boolean[], xpEarned: number, avgReactionMs: number, badgesEarned: BadgeName[]) => void
  onBack: () => void
}

const COLOR: Record<string,string> = { driver:'var(--purple)', expressive:'var(--green)', amiable:'var(--pink)', analytical:'var(--cyan)' }

export default function LevelTwo({ onComplete, onBack }: Props) {
  const [idx, setIdx] = useState(0)
  const [results, setResults] = useState<boolean[]>([])
  const [chosen, setChosen] = useState<number | null>(null)
  const [stress, setStress] = useState(70)
  const stepShownAt = useRef(Date.now())
  const xpRef = useRef(0)
  const msRef = useRef<number[]>([])
  const badgesRef = useRef<BadgeName[]>([])

  const item = L2[idx]
  const winIdx = item.opts.findIndex(o => o.r === 'win')

  function choose(i: number) {
    if (chosen !== null) return
    setChosen(i)
    const win = item.opts[i].r === 'win'
    const dt = Date.now() - stepShownAt.current
    if (win) {
      xpRef.current += XP_VALUES.correct
      if (dt > 0 && dt < 2100) xpRef.current += XP_VALUES.fastBonus
      if (!badgesRef.current.includes('Crisis Tamer')) badgesRef.current.push('Crisis Tamer')
    }
    if (dt > 0 && dt < 60000) msRef.current.push(dt)
    setStress(s => Math.max(0, Math.min(100, s + (win ? -45 : +22))))
    setResults(r => [...r, win])
  }

  function next() {
    if (idx >= L2.length - 1) {
      if (results.filter(Boolean).length === L2.length) xpRef.current += XP_VALUES.perfectLevel
      xpRef.current += XP_VALUES.levelComplete
      const avg = msRef.current.length ? Math.round(msRef.current.reduce((a,b)=>a+b,0)/msRef.current.length) : 0
      onComplete(results, xpRef.current, avg, badgesRef.current)
    } else {
      stepShownAt.current = Date.now()
      setIdx(i => i+1); setChosen(null)
    }
  }

  const s = STYLES[item.style]
  const c = COLOR[item.style]

  return (
    <div style={{ position:'relative', zIndex:1, maxWidth:1040, margin:'0 auto', padding:14 }}>
      <div style={{ background:'linear-gradient(180deg,var(--panel),#0a1430)', border:'1px solid var(--line)', borderRadius:16, padding:16, boxShadow:'0 12px 40px rgba(0,0,0,.45)' }}>
        <Topline level={2} title="Level 2 · Crisis Mode" total={L2.length} idx={idx} results={results} />
        <div style={{ display:'flex', gap:14, alignItems:'flex-start', border:'1px solid var(--line)', borderRadius:14, padding:16, background:'linear-gradient(180deg,rgba(255,255,255,.025),rgba(0,0,0,.2))', marginBottom:14 }}>
          <div style={{ width:58, height:58, flexShrink:0, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, border:`2px solid ${c}`, boxShadow:`0 0 16px ${c}`, color:c }}>{s.icon}</div>
          <div><div style={{ fontSize:16, fontWeight:700 }}>{item.name}</div><div style={{ fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.15em', textTransform:'uppercase', color:'var(--ink-dim)' }}>{s.name} — under stress</div></div>
        </div>
        <div style={{ border:'1px solid var(--red)', borderRadius:10, padding:'10px 12px', marginBottom:14, background:'rgba(255,93,108,.08)', color:'#ffd2d6', fontFamily:'var(--mono)', fontSize:13, letterSpacing:'.04em', animation:'pulse 1.4s ease-in-out infinite' }}>⚠ {item.crisis}</div>
        <Meter label="Stress Meter" type="stress" val={stress} />
        <div style={{ fontFamily:'var(--mono)', fontSize:13, color:'var(--ink-dim)', letterSpacing:'.04em', marginBottom:10 }}>{item.q}</div>
        {item.opts.map((opt, i) => {
          const state = chosen===null ? 'default' : i===winIdx ? 'correct' : i===chosen ? 'wrong' : 'muted'
          return <OptBtn key={i} text={opt.t} state={state} disabled={chosen!==null} onClick={() => choose(i)} />
        })}
        {chosen !== null && (
          <>
            <Feedback ok={item.opts[chosen].r==='win'} title={item.opts[chosen].r==='win' ? 'Winning Strategy — stress down' : 'Escalation — stress up'} body={item.opts[chosen].why} />
            <NextRow onNext={next} onBack={onBack} isLast={idx >= L2.length - 1} />
          </>
        )}
      </div>
    </div>
  )
}
