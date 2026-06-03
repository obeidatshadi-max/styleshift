'use client'
import { useState, useRef } from 'react'
import { L3, STYLES, XP_VALUES } from '@/lib/game-data'
import type { BadgeName } from '@/types/game'
import { Topline, OptBtn, Feedback, NextRow } from './helpers'

interface Props {
  onComplete: (results: boolean[], xpEarned: number, avgReactionMs: number, badgesEarned: BadgeName[]) => void
  onBack: () => void
}

const COLOR: Record<string,string> = { driver:'var(--purple)', expressive:'var(--green)', amiable:'var(--pink)', analytical:'var(--cyan)' }

export default function LevelThree({ onComplete, onBack }: Props) {
  const [idx, setIdx] = useState(0)
  const [results, setResults] = useState<boolean[]>([])
  const [chosen, setChosen] = useState<number | null>(null)
  const stepShownAt = useRef(Date.now())
  const xpRef = useRef(0)
  const msRef = useRef<number[]>([])
  const badgesRef = useRef<BadgeName[]>([])

  const item = L3[idx]

  function choose(i: number) {
    if (chosen !== null) return
    setChosen(i)
    const ok = item.opts[i].correct
    const dt = Date.now() - stepShownAt.current
    if (ok) {
      xpRef.current += XP_VALUES.correct
      if (dt > 0 && dt < 2100) xpRef.current += XP_VALUES.fastBonus
      if (item.multi && !badgesRef.current.includes('Drive Whisperer')) badgesRef.current.push('Drive Whisperer')
    }
    if (dt > 0 && dt < 60000) msRef.current.push(dt)
    setResults(r => [...r, ok])
  }

  function next() {
    if (idx >= L3.length - 1) {
      if (results.filter(Boolean).length === L3.length) xpRef.current += XP_VALUES.perfectLevel
      xpRef.current += XP_VALUES.levelComplete
      const avg = msRef.current.length ? Math.round(msRef.current.reduce((a,b)=>a+b,0)/msRef.current.length) : 0
      onComplete(results, xpRef.current, avg, badgesRef.current)
    } else {
      stepShownAt.current = Date.now()
      setIdx(i => i+1); setChosen(null)
    }
  }

  return (
    <div style={{ position:'relative', zIndex:1, maxWidth:1040, margin:'0 auto', padding:14 }}>
      <div style={{ background:'linear-gradient(180deg,var(--panel),#0a1430)', border:'1px solid var(--line)', borderRadius:16, padding:16, boxShadow:'0 12px 40px rgba(0,0,0,.45)' }}>
        <Topline level={3} title="Level 3 · Drive Decoder" total={L3.length} idx={idx} results={results} />
        {item.multi ? (
          <div style={{ display:'flex', gap:14, alignItems:'flex-start', border:'1px solid var(--line)', borderRadius:14, padding:16, background:'linear-gradient(180deg,rgba(255,255,255,.025),rgba(0,0,0,.2))', marginBottom:14 }}>
            <div style={{ width:58, height:58, flexShrink:0, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, border:'2px solid var(--green)', boxShadow:'0 0 16px var(--green)', color:'var(--green)' }}>{STYLES.expressive.icon}</div>
            <div><div style={{ fontSize:16, fontWeight:700 }}>{item.name}</div><div style={{ fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.15em', textTransform:'uppercase', color:'var(--ink-dim)', marginBottom:8 }}>{item.persona}</div><div style={{ fontSize:14, lineHeight:1.5 }}>{item.situation}</div></div>
          </div>
        ) : (
          <>
            <div style={{ display:'flex', gap:14, alignItems:'flex-start', border:'1px solid var(--line)', borderRadius:14, padding:16, background:'linear-gradient(180deg,rgba(255,255,255,.025),rgba(0,0,0,.2))', marginBottom:14 }}>
              <div style={{ width:58, height:58, flexShrink:0, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, border:`2px solid ${COLOR[item.style!]}`, boxShadow:`0 0 16px ${COLOR[item.style!]}`, color:COLOR[item.style!] }}>{STYLES[item.style!].icon}</div>
              <div><div style={{ fontSize:16, fontWeight:700 }}>{item.name}</div><div style={{ fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.15em', textTransform:'uppercase', color:'var(--ink-dim)', marginBottom:8 }}>{item.persona}</div></div>
            </div>
            <div style={{ fontSize:14, lineHeight:1.5, marginBottom:14 }}>{item.situation}</div>
          </>
        )}
        <div style={{ fontFamily:'var(--mono)', fontSize:13, color:'var(--ink-dim)', letterSpacing:'.04em', marginBottom:10 }}>{item.q}</div>
        {item.opts.map((opt, i) => {
          const state = chosen===null ? 'default' : opt.correct ? 'correct' : i===chosen ? 'wrong' : 'muted'
          return <OptBtn key={i} text={opt.t} state={state} disabled={chosen!==null} onClick={() => choose(i)} />
        })}
        {chosen !== null && (
          <>
            <Feedback ok={item.opts[chosen].correct} title={item.opts[chosen].correct ? 'Drive satisfied' : 'Wrong drive'} body={item.opts[chosen].why} />
            <NextRow onNext={next} onBack={onBack} isLast={idx >= L3.length - 1} />
          </>
        )}
      </div>
    </div>
  )
}
