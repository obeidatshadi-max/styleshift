'use client'
import { useState, useRef } from 'react'
import { L1, STYLES, STYLE_ORDER, XP_VALUES } from '@/lib/game-data'
import type { StyleKey, BadgeName } from '@/types/game'
import { Topline, OptBtn, Feedback, NextRow } from './helpers'

interface Props {
  onComplete: (results: boolean[], xpEarned: number, avgReactionMs: number, badgesEarned: BadgeName[]) => void
  onBack: () => void
}

const COLOR: Record<string,string> = { driver:'var(--purple)', expressive:'var(--green)', amiable:'var(--pink)', analytical:'var(--cyan)' }

export default function LevelOne({ onComplete, onBack }: Props) {
  const [idx, setIdx] = useState(0)
  const [results, setResults] = useState<boolean[]>([])
  const [chosen, setChosen] = useState<StyleKey | null>(null)
  const stepShownAt = useRef(Date.now())
  const xpRef = useRef(0)
  const msRef = useRef<number[]>([])
  const badgesRef = useRef<BadgeName[]>([])

  const item = L1[idx]

  function choose(k: StyleKey) {
    if (chosen) return
    setChosen(k)
    const dt = Date.now() - stepShownAt.current
    const ok = k === item.style
    if (ok) {
      xpRef.current += XP_VALUES.correct
      if (dt > 0 && dt < 2100) xpRef.current += XP_VALUES.fastBonus
      if (!badgesRef.current.includes('First Scan')) badgesRef.current.push('First Scan')
    }
    if (dt > 0 && dt < 60000) msRef.current.push(dt)
    setResults(r => [...r, ok])
  }

  function next() {
    if (idx >= L1.length - 1) {
      const allResults = [...results]
      if (allResults.filter(Boolean).length === L1.length) xpRef.current += XP_VALUES.perfectLevel
      xpRef.current += XP_VALUES.levelComplete
      const avg = msRef.current.length ? Math.round(msRef.current.reduce((a,b)=>a+b,0)/msRef.current.length) : 0
      onComplete(allResults, xpRef.current, avg, badgesRef.current)
    } else {
      stepShownAt.current = Date.now()
      setIdx(i => i+1); setChosen(null)
    }
  }

  const s = STYLES[item.style]

  return (
    <div style={{ position:'relative', zIndex:1, maxWidth:1040, margin:'0 auto', padding:14 }}>
      <div style={{ background:'linear-gradient(180deg,var(--panel),#0a1430)', border:'1px solid var(--line)', borderRadius:16, padding:16, boxShadow:'0 12px 40px rgba(0,0,0,.45)' }}>
        <Topline level={1} title="Level 1 · Style Scan" total={L1.length} idx={idx} results={results} />
        <div style={{ display:'flex', gap:14, alignItems:'flex-start', border:'1px solid var(--line)', borderRadius:14, padding:16, background:'linear-gradient(180deg,rgba(255,255,255,.025),rgba(0,0,0,.2))', marginBottom:14 }}>
          <div style={{ width:58, height:58, flexShrink:0, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, border:'2px solid var(--ink-dim)', color:'var(--ink-dim)' }}>?</div>
          <div>
            <div style={{ fontSize:16, fontWeight:700 }}>{item.name}</div>
            <div style={{ fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.15em', textTransform:'uppercase', color:'var(--ink-dim)', marginBottom:8 }}>Unidentified profile · read the cues</div>
            <ul style={{ listStyle:'none', display:'flex', flexDirection:'column', gap:6 }}>
              {item.cues.map((c,i) => <li key={i} style={{ fontSize:13.5, paddingLeft:16, position:'relative', lineHeight:1.4 }}><span style={{ position:'absolute', left:0, color:'var(--cyan)', fontWeight:700 }}>›</span>{c}</li>)}
            </ul>
          </div>
        </div>
        <div style={{ fontFamily:'var(--mono)', fontSize:13, color:'var(--ink-dim)', letterSpacing:'.04em', marginBottom:10 }}>CLASSIFY THIS PERSON&apos;S SOCIAL STYLE</div>
        {STYLE_ORDER.map(k => {
          const state = !chosen ? 'default' : k===item.style ? 'correct' : k===chosen ? 'wrong' : 'muted'
          return <OptBtn key={k} text={STYLES[k].name} state={state} disabled={!!chosen} onClick={() => choose(k)} />
        })}
        {chosen && (
          <>
            <Feedback ok={chosen===item.style} title={chosen===item.style ? 'Correct read' : 'Re-read the cues'} body={`This is <b>${item.name}</b> — a <b style="color:var(--ink)">${s.name}</b>. Tell-tale signal: their drive is <b>${s.drive}</b>.`} />
            <NextRow onNext={next} onBack={onBack} isLast={idx >= L1.length - 1} />
          </>
        )}
      </div>
    </div>
  )
}
