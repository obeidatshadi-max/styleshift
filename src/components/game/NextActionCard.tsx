'use client'
import { useState } from 'react'
import { useT, useGameData } from '@/lib/i18n'
import type { RepAssignment } from '@/types/game'
import type { DailyLeaderboard } from '@/lib/daily-leaderboard'

interface Props {
  assignment: RepAssignment | null
  onStartAssignment: () => void
  onAssignmentShared: () => void
  daily: DailyLeaderboard | null
  onStartDaily: () => void
  unlocked: number[]
  earnedLevels: number[]
  onStartLevel: (n: number) => void
  onShowPrep: () => void
}

/**
 * One dominant "what should I do right now" card, replacing the assignment
 * banner + daily-challenge panel + ladder panel that used to all compete at
 * the top of the home screen. Priority: active assignment > today's daily
 * challenge > next unlocked level > (everything done) a calm fallback.
 * Everything this absorbs is still browsable in full further down, under
 * the collapsed "More" section — nothing here is the only way to reach it.
 */
export default function NextActionCard({
  assignment, onStartAssignment, onAssignmentShared,
  daily, onStartDaily,
  unlocked, earnedLevels, onStartLevel,
  onShowPrep,
}: Props) {
  const t = useT()
  const { LEVELS } = useGameData()
  const [note, setNote] = useState('')
  const [noteState, setNoteState] = useState<'idle' | 'sending' | 'error'>('idle')

  async function sendNote() {
    if (!note.trim() || noteState === 'sending') return
    setNoteState('sending')
    try {
      const res = await fetch('/api/assignments/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'note', note_text: note.trim() }),
      })
      if (!res.ok) { setNoteState('error'); return }
      setNote('')
      setNoteState('idle')
      onAssignmentShared()
    } catch {
      setNoteState('error')
    }
  }

  const card: React.CSSProperties = { border: '1px solid var(--cyan)', borderRadius: 16, padding: 18, background: 'linear-gradient(180deg,rgba(56,214,255,.08),rgba(0,0,0,.2))', boxShadow: '0 12px 40px rgba(0,0,0,.45), 0 0 30px rgba(56,214,255,.12)' }
  const eyebrow: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.3em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 10 }
  const ctaBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 13, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: '#04121f', background: 'var(--cyan)', borderRadius: 10, padding: '13px 18px', boxShadow: '0 0 20px rgba(56,214,255,.4)', touchAction: 'manipulation' }

  // 1. An active, unfinished assignment always wins — a manager is waiting on it.
  if (assignment && !assignment.completed) {
    const a = assignment.assignment
    const target = a.target_type === 'category'
      ? t('assign.targetCategory', { category: t(`obj.${a.target_key}`) })
      : t('assign.targetLevel', { level: a.target_key, title: LEVELS[Number(a.target_key) - 1]?.title ?? '' })
    const overdue = a.due_date < new Date().toISOString().slice(0, 10)
    return (
      <section style={{ ...card, borderColor: overdue ? 'var(--red)' : 'var(--amber)', background: 'rgba(255,206,77,.06)' }}>
        <div style={{ ...eyebrow, color: overdue ? 'var(--red)' : 'var(--amber)' }}>📋 {t('assign.title')}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{target}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, marginTop: 3, color: overdue ? 'var(--red)' : 'var(--ink-dim)' }}>
              {overdue ? t('assign.overdue', { date: a.due_date }) : t('assign.due', { date: a.due_date })}
            </div>
          </div>
          <button onClick={onStartAssignment} style={{ ...ctaBtn, borderColor: 'var(--amber)', background: 'var(--amber)', boxShadow: '0 0 18px rgba(255,206,77,.45)' }}>
            {t('assign.start')}
          </button>
        </div>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 6 }}>{t('assign.noteLabel')}</div>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            placeholder={t('assign.notePlaceholder')} aria-label={t('assign.noteLabel')}
            style={{ width: '100%', background: 'rgba(0,0,0,.25)', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 11px', color: 'var(--ink)', fontFamily: 'var(--sans)', fontSize: 13, resize: 'vertical', outline: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <button onClick={sendNote} disabled={!note.trim() || noteState === 'sending'}
              style={{ cursor: !note.trim() ? 'not-allowed' : 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'rgba(56,214,255,.06)', borderRadius: 8, padding: '8px 14px', opacity: !note.trim() ? .5 : 1, touchAction: 'manipulation' }}>
              {noteState === 'sending' ? '…' : t('assign.noteSend')}
            </button>
            {noteState === 'error' && <span style={{ color: 'var(--red)', fontSize: 12 }}>{t('assign.noteError')}</span>}
          </div>
        </div>
      </section>
    )
  }

  // 2. Today's daily challenge, if not yet done.
  if (daily && daily.todayLevelsDone.length < daily.picks.length) {
    return (
      <section style={card}>
        <div style={eyebrow}>🔥 {t('daily.title')}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{t('daily.todayProgress', { done: daily.todayLevelsDone.length, total: daily.picks.length })}</div>
            {(daily.self?.streak ?? 0) > 0 && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, marginTop: 3, color: 'var(--amber)' }}>{t('daily.streakActive', { n: daily.self!.streak })}</div>
            )}
          </div>
          <button onClick={onStartDaily} style={ctaBtn}>
            {daily.todayLevelsDone.length > 0 ? t('daily.continue') : t('daily.play')}
          </button>
        </div>
      </section>
    )
  }

  // 3. The next level the rep hasn't cleared yet.
  const nextLevel = LEVELS.find(l => unlocked.includes(l.n) && !earnedLevels.includes(l.n))
  if (nextLevel) {
    return (
      <section style={card}>
        <div style={eyebrow}>{t('home.ladder')}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{nextLevel.n}. {nextLevel.title}</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-dim)', marginTop: 3 }}>{nextLevel.sub}</div>
          </div>
          <button onClick={() => onStartLevel(nextLevel.n)} style={ctaBtn}>{t('status.ready')}</button>
        </div>
      </section>
    )
  }

  // 4. Nothing left today — point at rehearsal instead of showing an empty card.
  return (
    <section style={card}>
      <div style={eyebrow}>{t('nextAction.caughtUpTitle')}</div>
      <div style={{ fontSize: 14, color: 'var(--ink-dim)', lineHeight: 1.5, marginBottom: 14 }}>{t('nextAction.caughtUpBody')}</div>
      <button onClick={onShowPrep} style={ctaBtn}>🩺 {t('prep.reopen')}</button>
    </section>
  )
}
