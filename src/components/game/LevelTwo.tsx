'use client'
import { useState, useRef } from 'react'
import { XP_VALUES } from '@/lib/game-data'
import { useGameData, useT } from '@/lib/i18n'
import { pickScenarios } from '@/lib/scenario-engine'
import type { BadgeName } from '@/types/game'
import { Topline, OptBtn, Feedback, NextRow, Meter } from './helpers'

const L2_COUNT = 4

interface Props {
  onComplete: (results: boolean[], xpEarned: number, avgReactionMs: number, badgesEarned: BadgeName[]) => void
  onBack: () => void
}

const COLOR: Record<string,string> = { driver:'var(--purple)', expressive:'var(--green)', amiable:'var(--pink)', analytical:'var(--cyan)' }

export default function LevelTwo({ onComplete, onBack }: Props) {
  const t = useT()
  const { L2, STYLES } = useGameData()
  const [sessionIds] = useState<number[]>(() => pickScenarios(L2, L2_COUNT, 2).map(s => s.id))
  const byId = new Map(L2.map(s => [s.id, s]))
  const scenarios = sessionIds.map(id => byId.get(id)!).filter(Boolean)
  const [idx, setIdx] = useState(0)
  const [results, setResults] = useState<boolean[]>([])
  const [chosen, setChosen] = useState<number | null>(null)
  const [stress, setStress] = useState(70)
  const stepShownAt = useRef(Date.now())
  const xpRef = useRef(0)
  const msRef = useRef<number[]>([])
  const badgesRef = useRef<BadgeName[]>([])

  const item = scenarios[idx]
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
    if (idx >= scenarios.length - 1) {
      if (results.filter(Boolean).length === scenarios.length) xpRef.current += XP_VALUES.perfectLevel
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
        <Topline level={2} title={`${t('level.label')} 2 · ${t('l2.title')}`} total={scenarios.length} idx={idx} results={results} />
        <div style={{ display:'flex', gap:14, alignItems:'flex-start', border:'1px solid var(--line)', borderRadius:14, padding:16, background:'linear-gradient(180deg,rgba(255,255,255,.025),rgba(0,0,0,.2))', marginBottom:14 }}>
          <div style={{ width:58, height:58, flexShrink:0, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, border:`2px solid ${c}`, boxShadow:`0 0 16px ${c}`, color:c }}>{s.icon}</div>
          <div><div style={{ fontSize:16, fontWeight:700 }}>{item.name}</div><div style={{ fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.15em', textTransform:'uppercase', color:'var(--ink-dim)' }}>{t('l2.underStress', { style: s.name })}</div></div>
        </div>
        <div style={{ border:'1px solid var(--red)', borderRadius:10, padding:'10px 12px', marginBottom:14, background:'rgba(255,93,108,.08)', color:'#ffd2d6', fontFamily:'var(--mono)', fontSize:13, letterSpacing:'.04em', animation:'pulse 1.4s ease-in-out infinite' }}>⚠ {item.crisis}</div>
        <Meter label={t('l2.stressMeter')} type="stress" val={stress} />
        <div style={{ fontFamily:'var(--mono)', fontSize:13, color:'var(--ink-dim)', letterSpacing:'.04em', marginBottom:10 }}>{item.q}</div>
        {item.opts.map((opt, i) => {
          const state = chosen===null ? 'default' : i===winIdx ? 'correct' : i===chosen ? 'wrong' : 'muted'
          return <OptBtn key={i} text={opt.t} state={state} disabled={chosen!==null} onClick={() => choose(i)} />
        })}
        {chosen !== null && (
          <>
            <Feedback ok={item.opts[chosen].r==='win'} title={item.opts[chosen].r==='win' ? t('l2.win') : t('l2.lose')} body={item.opts[chosen].why} />
            <NextRow onNext={next} onBack={onBack} isLast={idx >= scenarios.length - 1} />
          </>
        )}
      </div>
    </div>
  )
}
