'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useProfile } from '@/hooks/useProfile'
import { useGameData, useT } from '@/lib/i18n'
import { DAILY_TOTAL } from '@/lib/daily'
import { L2_OBJECTION } from '@/lib/scenario-meta'
import { shuffle } from '@/lib/scenario-engine'
import { XP_VALUES } from '@/lib/game-data'
import GameHome from './GameHome'
import LevelOne from './LevelOne'
import LevelTwo from './LevelTwo'
import LevelThree from './LevelThree'
import LevelFour from './LevelFour'
import LevelResult from './LevelResult'
import DailyChallenge from './DailyChallenge'
import HowItWorks from './HowItWorks'
import VisitPrep from './VisitPrep'
import Colleagues from './Colleagues'
import SpsAssessment from './SpsAssessment'
import type { BadgeName, RepAssignment } from '@/types/game'
import type { DailyLeaderboard } from '@/lib/daily-leaderboard'
import type { Standings } from '@/lib/standings'

type Screen = 'home' | 'level' | 'result' | 'daily' | 'how' | 'prep' | 'perform' | 'assignment' | 'sps'
const INTRO_KEY = 'styleshift_intro_done'

interface LevelState {
  level: number
  results: boolean[]
  xpEarned: number
  avgMs: number
  meters?: { quota: number; morale: number; risk: number }
}

export default function GameShell() {
  const { profile, badges, completedLevels, loading, addXp, earnBadge, saveSession, recordDaily, updateAvatar, saveSpsAssessment } = useProfile()
  const t = useT()
  const { L2 } = useGameData()
  const [screen, setScreen] = useState<Screen>('home')
  const [daily, setDaily] = useState<DailyLeaderboard | null>(null)
  const [standings, setStandings] = useState<Standings | null>(null)
  const [assignment, setAssignment] = useState<RepAssignment | null>(null)

  const loadDaily = useCallback(async () => {
    try {
      const res = await fetch('/api/daily-leaderboard')
      if (res.ok) setDaily(await res.json())
    } catch { /* offline — daily panel just won't show */ }
  }, [])
  const loadStandings = useCallback(async () => {
    try {
      const res = await fetch('/api/standings')
      if (res.ok) setStandings(await res.json())
    } catch { /* offline — ranking panel just won't show */ }
  }, [])
  const loadAssignment = useCallback(async () => {
    try {
      const res = await fetch('/api/assignments')
      if (res.ok) setAssignment(await res.json())
    } catch { /* offline — assignment banner just won't show */ }
  }, [])
  useEffect(() => { loadDaily(); loadStandings(); loadAssignment() }, [loadDaily, loadStandings, loadAssignment])

  // First-run routing, decided once per session-load (guarded by the ref
  // below, not by [loading, profile] alone) — playing Level 1 changes
  // `profile` via addXp/saveSession, and a reactive effect would re-fire
  // mid-playthrough and yank a brand-new rep back out of their first level.
  //
  // Order for a brand-new rep: the one-time intro carousel (localStorage,
  // reopenable from the home screen) -> Level 1 (a real, XP-earning taste
  // of the game, now with context for what it's building toward) -> its
  // result screen -> the SPS assessment (DB-persisted, so it survives
  // across devices). A rep who already finished Level 1 but closed the app
  // before finishing SPS resumes straight into SPS, without being forced
  // to replay Level 1 or re-see an intro they've already seen.
  const initialRouteRef = useRef(false)
  useEffect(() => {
    if (loading || initialRouteRef.current) return
    initialRouteRef.current = true
    const seenIntro = typeof window !== 'undefined' && !!localStorage.getItem(INTRO_KEY)
    if (profile && !profile.sps_top_key && !completedLevels.includes(1)) {
      if (!seenIntro) { setScreen('how'); return }
      startLevel(1); return
    }
    if (profile && !profile.sps_top_key) { setScreen('sps'); return }
    if (!seenIntro) setScreen('how')
  }, [loading, profile, completedLevels])

  function finishIntro() {
    try { localStorage.setItem(INTRO_KEY, '1') } catch { /* ignore */ }
    if (profile && !profile.sps_top_key && !completedLevels.includes(1)) { startLevel(1); return }
    if (profile && !profile.sps_top_key) { setScreen('sps'); return }
    setScreen('home')
  }

  // Today's remaining daily questions, captured when the rep opens the set, plus
  // the position within them — so a partly-done day resumes at the next unanswered.
  const [dailyQueue, setDailyQueue] = useState<{ level: number; scenarioId: number }[]>([])
  const [dailyPos, setDailyPos] = useState(0)

  function startDaily() {
    if (!daily) return
    const remaining = daily.picks.filter(p => !daily.todayLevelsDone.includes(p.level))
    if (remaining.length === 0) return // whole set already done today
    setDailyQueue(remaining)
    setDailyPos(0)
    setScreen('daily')
  }

  async function handleDailyComplete(correct: boolean, reactionMs: number) {
    const pick = dailyQueue[dailyPos]
    if (pick) await recordDaily(pick.level, pick.scenarioId, correct, reactionMs)
    if (dailyPos + 1 < dailyQueue.length) {
      setDailyPos(dailyPos + 1) // next question in the set
    } else {
      await loadDaily() // set finished — refresh streak/progress and go home
      setScreen('home')
    }
  }

  // Coach assignment: a category assignment plays a short set of matching
  // Crisis Mode drills; a level assignment routes to the normal level and is
  // marked done when that level is completed.
  const ASSIGNMENT_SET = 3
  const [assignQueue, setAssignQueue] = useState<number[]>([])
  const [assignPos, setAssignPos] = useState(0)

  async function markAssignmentDone() {
    try { await fetch('/api/assignments', { method: 'PATCH' }) } catch { /* retried next load */ }
    await addXp(XP_VALUES.levelComplete)
    await loadAssignment()
  }

  function startAssignment() {
    if (!assignment || assignment.completed) return
    const { target_type, target_key } = assignment.assignment
    if (target_type === 'level') {
      startLevel(Number(target_key))
      return
    }
    const matching = L2.filter(s => L2_OBJECTION[s.id] === target_key)
    const ids = shuffle(matching).slice(0, ASSIGNMENT_SET).map(s => s.id)
    if (ids.length === 0) return // category has no scenarios — nothing to play
    setAssignQueue(ids)
    setAssignPos(0)
    setScreen('assignment')
  }

  async function handleAssignmentDrillComplete() {
    if (assignPos + 1 < assignQueue.length) {
      setAssignPos(assignPos + 1)
    } else {
      await markAssignmentDone()
      setScreen('home')
    }
  }
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

    // A level run satisfies a matching level-type coach assignment.
    if (assignment && !assignment.completed &&
        assignment.assignment.target_type === 'level' &&
        Number(assignment.assignment.target_key) === activeLevel) {
      await markAssignmentDone()
    }

    setLevelState({ level: activeLevel, results, xpEarned, avgMs, meters })
    setScreen('result')
  }

  function handleHome(conf: number) {
    setConfidence(conf)
    loadStandings() // XP changed this session — refresh the team ranking
    // Brand-new rep coming off their first (pre-SPS) Level 1 result: send
    // them into the assessment next, instead of the dashboard.
    if (profile && !profile.sps_top_key) { setScreen('sps'); return }
    setScreen('home')
  }

  if (screen === 'sps') {
    return (
      <SpsAssessment
        onComplete={async (result) => {
          await saveSpsAssessment(result)
          if (typeof window !== 'undefined' && !localStorage.getItem(INTRO_KEY)) setScreen('how')
          else setScreen('home')
        }}
      />
    )
  }

  if (screen === 'how') {
    return <HowItWorks onDone={finishIntro} />
  }

  if (screen === 'prep') {
    return <VisitPrep onExit={() => setScreen('home')} />
  }

  if (screen === 'perform') {
    return <Colleagues onExit={() => setScreen('home')} />
  }

  if (screen === 'assignment' && assignQueue[assignPos]) {
    return (
      <DailyChallenge
        key={assignQueue[assignPos]}
        level={2}
        scenarioId={assignQueue[assignPos]}
        title={t('assign.progressTitle', { n: assignPos + 1, total: assignQueue.length })}
        onComplete={handleAssignmentDrillComplete}
        onExit={() => setScreen('home')}
      />
    )
  }

  if (screen === 'daily' && dailyQueue[dailyPos]) {
    const pick = dailyQueue[dailyPos]
    const total = daily?.picks.length ?? DAILY_TOTAL
    const num = total - dailyQueue.length + dailyPos + 1 // 1-based across the full set
    return (
      <DailyChallenge
        key={pick.level}
        level={pick.level}
        scenarioId={pick.scenarioId}
        title={t('daily.progress', { n: num, total })}
        onComplete={handleDailyComplete}
        onExit={() => setScreen('home')}
      />
    )
  }

  if (screen === 'result' && levelState) {
    return (
      <LevelResult
        level={levelState.level}
        results={levelState.results}
        meters={levelState.meters}
        spsKey={profile?.sps_top_key}
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
      role={profile?.role ?? 'rep'}
      daily={daily}
      standings={standings}
      assignment={assignment}
      onStartAssignment={startAssignment}
      avatarUrl={profile?.avatar_url ?? null}
      displayName={profile?.display_name ?? null}
      onUploadAvatar={updateAvatar}
      onStartDaily={startDaily}
      onShowHow={() => setScreen('how')}
      onShowPrep={() => setScreen('prep')}
      onShowPerform={() => setScreen('perform')}
      onStartLevel={startLevel}
    />
  )
}
