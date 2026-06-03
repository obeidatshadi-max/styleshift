'use client'
import { useState } from 'react'
import { useProfile } from '@/hooks/useProfile'
import GameHome from './GameHome'
import LevelOne from './LevelOne'
import LevelTwo from './LevelTwo'
import LevelThree from './LevelThree'
import LevelFour from './LevelFour'
import LevelResult from './LevelResult'
import type { BadgeName } from '@/types/game'

type Screen = 'home' | 'level' | 'result'

interface LevelState {
  level: number
  results: boolean[]
  xpEarned: number
  avgMs: number
  meters?: { quota: number; morale: number; risk: number }
}

export default function GameShell() {
  const { profile, badges, completedLevels, loading, addXp, earnBadge, saveSession } = useProfile()
  const [screen, setScreen] = useState<Screen>('home')
  const [activeLevel, setActiveLevel] = useState(1)
  const [levelState, setLevelState] = useState<LevelState | null>(null)
  const [sessionEarnedLevels, setSessionEarnedLevels] = useState<number[]>([])
  const earnedLevels = [...new Set([...completedLevels, ...sessionEarnedLevels])]

  // Aggregate session stats (displayed in KpiPanel)
  const [decisions, setDecisions] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [totalMs, setTotalMs] = useState(0)
  const [reactionCount, setReactionCount] = useState(0)
  const [confidence, setConfidence] = useState(0)

  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', fontFamily:'var(--mono)', fontSize:13, color:'var(--ink-dim)', letterSpacing:'.1em' }}>
        Loading…
      </div>
    )
  }

  function startLevel(n: number) {
    setActiveLevel(n)
    setScreen('level')
  }

  async function handleLevelComplete(
    results: boolean[],
    xpEarned: number,
    avgMs: number,
    badgesEarned: BadgeName[],
    meters?: { quota: number; morale: number; risk: number }
  ) {
    const got = results.filter(Boolean).length
    setDecisions(d => d + results.length)
    setCorrect(c => c + got)
    setTotalMs(t => t + avgMs * results.length)
    setReactionCount(r => r + results.length)
    setSessionEarnedLevels(e => [...new Set([...e, activeLevel])])

    const acc = Math.round(got / results.length * 100)
    await addXp(xpEarned)
    await saveSession(activeLevel, acc, xpEarned, avgMs || undefined)
    for (const badge of badgesEarned) await earnBadge(badge)

    const newXp = (profile?.xp ?? 0) + xpEarned
    if (newXp >= 2000) await earnBadge('Style Master')

    setLevelState({ level: activeLevel, results, xpEarned, avgMs, meters })
    setScreen('result')
  }

  function handleHome(conf: number) {
    setConfidence(conf)
    setScreen('home')
  }

  if (screen === 'result' && levelState) {
    return (
      <LevelResult
        level={levelState.level}
        results={levelState.results}
        meters={levelState.meters}
        onHome={handleHome}
      />
    )
  }

  if (screen === 'level') {
    const sharedProps = { onBack: () => setScreen('home') }
    if (activeLevel === 1) return <LevelOne {...sharedProps} onComplete={(r,x,m,b) => handleLevelComplete(r,x,m,b)} />
    if (activeLevel === 2) return <LevelTwo {...sharedProps} onComplete={(r,x,m,b) => handleLevelComplete(r,x,m,b)} />
    if (activeLevel === 3) return <LevelThree {...sharedProps} onComplete={(r,x,m,b) => handleLevelComplete(r,x,m,b)} />
    if (activeLevel === 4) return <LevelFour {...sharedProps} onComplete={(r,x,m,b,meters) => handleLevelComplete(r,x,m,b,meters)} />
  }

  return (
    <GameHome
      xp={profile?.xp ?? 0}
      badges={badges}
      earnedLevels={earnedLevels}
      decisions={decisions}
      correct={correct}
      totalReactionMs={totalMs}
      reactionCount={reactionCount}
      confidence={confidence}
      onStartLevel={startLevel}
    />
  )
}
