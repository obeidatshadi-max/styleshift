'use client'
import { useEffect, useState } from 'react'
import { useGameData, useLang, useT } from '@/lib/i18n'
import type { Doctor, StyleKey } from '@/types/game'
import type { ChallengeProgress, ChallengeRecommendation } from '@/lib/challenge-engine'
import { useBehaviorLabel } from '@/lib/methodology-client'
import { card, ghostBtn, primaryBtn, sectionLabel, bodyText, smallLabel } from './TextSimulation'
import TextSimulation from './TextSimulation'
import MicroPractice from './MicroPractice'

interface Next { recommendation: ChallengeRecommendation; progress: ChallengeProgress | null }

/** Home card: the one thing worth practising next, with the observed pattern
 * behind it kept separate from the (hedged) reading of it. Silent when the
 * feature is off or there is no recurring pattern yet. */
export default function NextChallengeCard() {
  const t = useT()
  const { lang } = useLang()
  const { STYLES } = useGameData()
  const behaviorLabel = useBehaviorLabel()
  const [next, setNext] = useState<Next | null>(null)
  const [mode, setMode] = useState<'card' | 'drill' | 'sim'>('card')

  useEffect(() => {
    if (mode !== 'card') return
    let live = true
    fetch(`/api/challenges/next?lang=${lang}`).then(r => (r.ok ? r.json() : null)).then(d => { if (live && d?.recommendation) setNext(d as Next) }).catch(() => {})
    return () => { live = false }
  }, [lang, mode])

  const rec = next?.recommendation
  if (!rec || rec.status !== 'recommended') return null
  const { weakness, exercise } = rec
  const p = weakness.pattern
  const style = exercise.targeted.physicianStyle as StyleKey

  if (mode === 'sim') {
    const shown = { id: 'challenge', name: t('chal.doctorName'), style } as Doctor
    return <TextSimulation doctor={shown} challenge onDone={() => setMode('card')} />
  }
  if (mode === 'drill') return <MicroPractice focusDrillId={exercise.drillId} onClose={() => setMode('card')} />

  const prog = next?.progress
  const count = (rate: number, of: number) => Math.round(rate * of)
  return (
    <div style={card}>
      <div style={sectionLabel}>{t('chal.title')}</div>

      <div style={smallLabel}>{t('chal.observed')}</div>
      <p style={bodyText}>
        {t('chal.statement', { behavior: behaviorLabel(p.behavior), n: p.sessionsWith, m: p.sessionsConsidered })}
        {p.dominantContext.physicianStyle && ` ${t('chal.withStyle', { style: STYLES[p.dominantContext.physicianStyle].name })}`}
        {` ${t(`chal.trend.${p.trend}`)}`}
      </p>

      <div style={smallLabel}>{t('chal.suggests')}</div>
      <p style={{ ...bodyText, color: 'var(--ink-dim)' }}>{t('chal.hedge')} ({t(`chal.conf.${weakness.confidenceLevel}`)})</p>

      <div style={smallLabel}>{t('chal.practice')}</div>
      <p style={bodyText}>{t(`chal.obj.${p.behavior}`)}</p>
      <p style={{ ...bodyText, color: 'var(--ink-dim)' }}>
        {t('chal.next', { style: STYLES[style].name, level: t(`chal.level.${exercise.targeted.difficulty}`) })}
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
        <button onClick={() => setMode('sim')} style={{ ...primaryBtn, width: 'auto' }}>{t('chal.startSim')}</button>
        {lang === 'en' && <button onClick={() => setMode('drill')} style={ghostBtn}>{t('chal.startDrill')}</button>}
      </div>

      {prog && (
        <div role="note" style={{ marginTop: 12 }}>
          <div style={smallLabel}>{t('chal.progress')}</div>
          <p style={bodyText}>
            {prog.verdict === 'too_early'
              ? t('chal.prog.too_early', { n: prog.targetedSessions })
              : t(`chal.prog.${prog.verdict}`, {
                  a: count(prog.rateAfter, prog.targetedSessions), t: prog.targetedSessions,
                  b: count(prog.rateBefore, prog.otherSessions), o: prog.otherSessions,
                })}
          </p>
          <p style={{ ...bodyText, color: 'var(--ink-dim)' }}>{t('chal.prog.caveat')}</p>
        </div>
      )}
    </div>
  )
}
