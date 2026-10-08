'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useProfile } from '@/hooks/useProfile'
import { useGameData, useT } from '@/lib/i18n'
import { DAILY_TOTAL } from '@/lib/daily'
import { L2_OBJECTION } from '@/lib/scenario-meta'
import { shuffle } from '@/lib/scenario-engine'
import { XP_VALUES } from '@/lib/game-data'
import GameHome from './GameHome'
import AICoach from './AICoach'
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
import FieldCards from './FieldCards'
import AppNav, { type Section } from './AppNav'
import type { BadgeName, RepAssignment } from '@/types/game'
import type { DailyLeaderboard } from '@/lib/daily-leaderboard'
import type { Standings } from '@/lib/standings'

type Screen = 'home' | 'level' | 'result' | 'daily' | 'how' | 'prep' | 'perform' | 'assignment' | 'sps' | 'fieldcards'
// Screens shown without the nav: the one-time intro carousel. The style quiz keeps the nav so
// a rep who opens it from the home screen can still leave without answering every question.
const NO_NAV_SCREENS: Screen[] = ['how']
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
  const [section, setSection] = useState<Section>('train')
  // Set when the Home nudge opens the Coach on a particular doctor; cleared when the rep navigates by tab.
  const [coachDoctorId, setCoachDoctorId] = useState('')
  // Set when a Home nudge opens Visit Prep on a particular doctor.
  const [prepDoctorId, setPrepDoctorId] = useState('')

  function goToSection(s: Section) {
    setCoachDoctorId('')
    setPrepDoctorId('')
    setSection(s)
    setScreen('home')
  }
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

  // First-run routing, decided once per session-load (guarded by the ref below, not by
  // [loading, profile] alone: playing a level changes `profile` via addXp/saveSession, and a
  // reactive effect would re-fire mid-playthrough).
  //
  // A brand-new rep sees the one-time intro carousel (localStorage, reopenable from the home
  // screen) and then the home screen. The SPS style quiz and Level 1 used to be forced in
  // that order; they are now offered from the home screen instead. A facilitator who wants
  // every trainee's style before pairing them for Live Roleplay can ask for the quiz.
  const initialRouteRef = useRef(false)
  useEffect(() => {
    if (loading || initialRouteRef.current) return
    initialRouteRef.current = true
    // Only the short "How it works" intro is shown first. The style quiz and Level 1 are
    // offered from the home screen, never forced: a rep must be able to open the AI Coach,
    // AI Doctor or Live Roleplay without finishing either.
    const seenIntro = typeof window !== 'undefined' && !!localStorage.getItem(INTRO_KEY)
    if (!seenIntro) setScreen('how')
  }, [loading])

  function finishIntro() {
    try { localStorage.setItem(INTRO_KEY, '1') } catch { /* ignore */ }
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

  function withNav(el: React.ReactNode) {
    if (NO_NAV_SCREENS.includes(screen)) return <>{el}</>
    return (
      <>
        <AppNav activeSection={section} onSelectSection={goToSection} showBack={screen !== 'home'} onBack={() => setScreen('home')} />
        {el}
      </>
    )
  }

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
    setScreen('home')
  }

  if (screen === 'sps') {
    return withNav(
      <SpsAssessment
        onComplete={async (result) => {
          await saveSpsAssessment(result)
          setScreen('home')
        }}
      />
    )
  }

  if (screen === 'how') {
    return withNav(<HowItWorks onDone={finishIntro} />)
  }

  if (section === 'coach') return withNav(<AICoach initialDoctorId={coachDoctorId} />)

  if (screen === 'prep') {
    // A doctor roleplay in there may have shared against the active
    // assignment — refresh so the home banner reflects it.
    return withNav(<VisitPrep initialDoctorId={prepDoctorId} onExit={() => { setScreen('home'); loadAssignment() }} />)
  }

  if (screen === 'fieldcards') {
    return withNav(<FieldCards onExit={() => setScreen('home')} />)
  }

  if (screen === 'perform') {
    return withNav(<Colleagues onExit={() => { setScreen('home'); loadAssignment() }} />)
  }

  if (screen === 'assignment' && assignQueue[assignPos]) {
    return withNav(
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
    return withNav(
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
    return withNav(
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
    if (activeLevel === 1) return withNav(<LevelOne {...sharedProps} onComplete={(r,x,m,b) => handleLevelComplete(r,x,m,b)} />)
    if (activeLevel === 2) return withNav(<LevelTwo {...sharedProps} onComplete={(r,x,m,b) => handleLevelComplete(r,x,m,b)} />)
    if (activeLevel === 3) return withNav(<LevelThree {...sharedProps} onComplete={(r,x,m,b) => handleLevelComplete(r,x,m,b)} />)
    if (activeLevel === 4) return withNav(<LevelFour {...sharedProps} onComplete={(r,x,m,b,meters) => handleLevelComplete(r,x,m,b,meters)} />)
  }

  return withNav(
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
      onAssignmentShared={loadAssignment}
      avatarUrl={profile?.avatar_url ?? null}
      displayName={profile?.display_name ?? null}
      onUploadAvatar={updateAvatar}
      onStartDaily={startDaily}
      onShowHow={() => setScreen('how')}
      onShowPrep={() => { setSection('rehearse'); setScreen('prep') }}
      onShowPerform={() => { setSection('perform'); setScreen('perform') }}
      onShowFieldCards={() => setScreen('fieldcards')}
      onOpenCoach={id => { setCoachDoctorId(id ?? ''); setSection('coach'); setScreen('home') }}
      onOpenDoctor={id => { setPrepDoctorId(id); setSection('rehearse'); setScreen('prep') }}
      onStartLevel={startLevel}
      spsPending={!!profile && !profile.sps_top_key}
      onTakeSps={() => setScreen('sps')}
      tab={section}
    />
  )
}
