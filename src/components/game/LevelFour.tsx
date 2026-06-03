'use client'
import { useState, useRef } from 'react'
import { XP_VALUES } from '@/lib/game-data'
import { bestL4Index, clamp, sign } from '@/lib/game-logic'
import { useGameData, useT } from '@/lib/i18n'
import { pickScenarios } from '@/lib/scenario-engine'
import type { BadgeName } from '@/types/game'
import { Topline, OptBtn, Feedback, NextRow, Meter } from './helpers'

const L4_COUNT = 4

interface Props {
  onComplete: (results: boolean[], xpEarned: number, avgReactionMs: number, badgesEarned: BadgeName[], meters: {quota:number;morale:number;risk:number}) => void
  onBack: () => void
}

export default function LevelFour({ onComplete, onBack }: Props) {
  const t = useT()
  const { L4 } = useGameData()
  const [sessionIds] = useState<number[]>(() => pickScenarios(L4, L4_COUNT, 4).map(s => s.id))
  const byId = new Map(L4.map(s => [s.id, s]))
  const scenarios = sessionIds.map(id => byId.get(id)!).filter(Boolean)
  const [idx, setIdx] = useState(0)
  const [results, setResults] = useState<boolean[]>([])
  const [chosen, setChosen] = useState<number | null>(null)
  const [meters, setMeters] = useState({ quota:50, morale:60, risk:35 })
  const stepShownAt = useRef(Date.now())
  const xpRef = useRef(0)
  const msRef = useRef<number[]>([])
  const badgesRef = useRef<BadgeName[]>([])

  const item = scenarios[idx]
  const best = bestL4Index(item.opts)

  function choose(i: number) {
    if (chosen !== null) return
    setChosen(i)
    const opt = item.opts[i]
    const good = i === best
    const dt = Date.now() - stepShownAt.current
    if (good) {
      xpRef.current += XP_VALUES.correct
      if (dt > 0 && dt < 2100) xpRef.current += XP_VALUES.fastBonus
    }
    if (dt > 0 && dt < 60000) msRef.current.push(dt)
    setMeters(m => ({ quota: clamp(m.quota+opt.quota), morale: clamp(m.morale+opt.morale), risk: clamp(m.risk+opt.risk) }))
    setResults(r => [...r, good])
  }

  function next() {
    if (idx >= scenarios.length - 1) {
      const apex = meters.quota >= 60 && meters.morale >= 50 && meters.risk <= 50
      if (apex && !badgesRef.current.includes('Boardroom Ace')) badgesRef.current.push('Boardroom Ace')
      if (results.filter(Boolean).length === scenarios.length) xpRef.current += XP_VALUES.perfectLevel
      xpRef.current += XP_VALUES.levelComplete
      const avg = msRef.current.length ? Math.round(msRef.current.reduce((a,b)=>a+b,0)/msRef.current.length) : 0
      onComplete(results, xpRef.current, avg, badgesRef.current, meters)
    } else {
      stepShownAt.current = Date.now()
      setIdx(i => i+1); setChosen(null)
    }
  }

  return (
    <div style={{ position:'relative', zIndex:1, maxWidth:1040, margin:'0 auto', padding:14 }}>
      <div style={{ background:'linear-gradient(180deg,var(--panel),#0a1430)', border:'1px solid var(--line)', borderRadius:16, padding:16, boxShadow:'0 12px 40px rgba(0,0,0,.45)' }}>
        <Topline level={4} title={`${t('level.label')} 4 · ${t('l4.title')}`} total={scenarios.length} idx={idx} results={results} />
        <div style={{ marginBottom:14 }}>
          <Meter label={t('l4.globalQuota')} type="quota" val={meters.quota} />
          <Meter label={t('l4.teamMorale')} type="morale" val={meters.morale} />
          <Meter label={t('l4.riskAssessment')} type="risk" val={meters.risk} />
        </div>
        <div style={{ fontFamily:'var(--mono)', fontSize:13, color:'var(--ink-dim)', letterSpacing:'.04em', marginBottom:10 }}>{item.q}</div>
        {item.opts.map((opt, i) => {
          const state = chosen===null ? 'default' : i===best ? 'correct' : i===chosen ? 'wrong' : 'muted'
          return <OptBtn key={i} text={opt.t} state={state} disabled={chosen!==null} onClick={() => choose(i)} />
        })}
        {chosen !== null && (
          <>
            <Feedback ok={chosen===best} title={chosen===best ? t('l4.balanced') : t('l4.offBalance')}
              body={item.opts[chosen].why + t('l4.metersTag', { quota: sign(item.opts[chosen].quota), morale: sign(item.opts[chosen].morale), risk: sign(item.opts[chosen].risk) })} />
            <NextRow onNext={next} onBack={onBack} isLast={idx >= scenarios.length - 1} />
          </>
        )}
      </div>
    </div>
  )
}
