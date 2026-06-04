'use client'
import { useState, useRef } from 'react'
import { useGameData, useT } from '@/lib/i18n'
import type { StyleKey } from '@/types/game'
import { OptBtn, Feedback } from './helpers'

interface Props {
  level: number
  scenarioId: number
  onComplete: (correct: boolean, reactionMs: number) => void
  title?: string
}

const COLOR: Record<string, string> = { driver:'var(--purple)', expressive:'var(--green)', amiable:'var(--pink)', analytical:'var(--cyan)' }

export default function DailyChallenge({ level, scenarioId, onComplete, title }: Props) {
  const t = useT()
  const { STYLES, STYLE_ORDER, L1, L2, L3 } = useGameData()
  const startedAt = useRef(Date.now())
  const [answered, setAnswered] = useState(false)
  const [correct, setCorrect] = useState(false)
  const [chosenIdx, setChosenIdx] = useState<number | null>(null)
  const [chosenStyle, setChosenStyle] = useState<StyleKey | null>(null)

  function lockIn(isCorrect: boolean) {
    setCorrect(isCorrect)
    setAnswered(true)
  }

  const panel = (children: React.ReactNode) => (
    <div style={{ position:'relative', zIndex:1, maxWidth:1040, margin:'0 auto', padding:14 }}>
      <div style={{ background:'linear-gradient(180deg,var(--panel),#0a1430)', border:'1px solid var(--line)', borderRadius:16, padding:16, boxShadow:'0 12px 40px rgba(0,0,0,.45)' }}>
        <div style={{ fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.3em', textTransform:'uppercase', color:'var(--amber)', display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
          <span style={{ width:9, height:9, borderRadius:'50%', background:'var(--amber)', boxShadow:'0 0 14px var(--amber)', display:'inline-block' }} />
          {title ?? t('daily.title')}
        </div>
        {children}
      </div>
    </div>
  )

  const continueBtn = (
    <div style={{ marginTop:14 }}>
      <button onClick={() => onComplete(correct, Date.now() - startedAt.current)}
        style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.15em', textTransform:'uppercase', border:'1px solid var(--cyan)', color:'#04121c', background:'var(--cyan)', borderRadius:10, padding:'12px 18px', boxShadow:'var(--glow-cyan)', touchAction:'manipulation' }}>
        {t('result.logContinue')}
      </button>
    </div>
  )

  const stakeholderCard = (name: string, sub: string, accent: string, icon: string, cues?: string[]) => (
    <div style={{ display:'flex', gap:14, alignItems:'flex-start', border:'1px solid var(--line)', borderRadius:14, padding:16, background:'linear-gradient(180deg,rgba(255,255,255,.025),rgba(0,0,0,.2))', marginBottom:14 }}>
      <div style={{ width:58, height:58, flexShrink:0, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, border:`2px solid ${accent}`, boxShadow:`0 0 16px ${accent}`, color:accent }}>{icon}</div>
      <div>
        <div style={{ fontSize:16, fontWeight:700 }}>{name}</div>
        <div style={{ fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.15em', textTransform:'uppercase', color:'var(--ink-dim)', marginBottom: cues ? 8 : 0 }}>{sub}</div>
        {cues && (
          <ul style={{ listStyle:'none', display:'flex', flexDirection:'column', gap:6 }}>
            {cues.map((c, i) => <li key={i} style={{ fontSize:13.5, paddingInlineStart:16, position:'relative', lineHeight:1.4 }}><span style={{ position:'absolute', insetInlineStart:0, color:'var(--cyan)', fontWeight:700 }}>›</span>{c}</li>)}
          </ul>
        )}
      </div>
    </div>
  )

  // ── Level 1 · identify the style ──
  if (level === 1) {
    const item = L1.find(s => s.id === scenarioId) ?? L1[0]
    const s = STYLES[item.style]
    return panel(
      <>
        {stakeholderCard(item.name, t('l1.unidentified'), 'var(--ink-dim)', '?', item.cues)}
        <div style={{ fontFamily:'var(--mono)', fontSize:13, color:'var(--ink-dim)', letterSpacing:'.04em', marginBottom:10 }}>{t('l1.classify')}</div>
        {STYLE_ORDER.map(k => {
          const state = !answered ? 'default' : k === item.style ? 'correct' : k === chosenStyle ? 'wrong' : 'muted'
          return <OptBtn key={k} text={STYLES[k].name} state={state} disabled={answered} onClick={() => { setChosenStyle(k); lockIn(k === item.style) }} />
        })}
        {answered && (
          <>
            <Feedback ok={correct} title={correct ? t('daily.resultCorrect') : t('daily.resultWrong')} body={t('l1.feedback', { name: item.name, style: s.name, drive: s.drive })} />
            {continueBtn}
          </>
        )}
      </>
    )
  }

  // ── Level 2 · defuse the objection ──
  if (level === 2) {
    const item = L2.find(s => s.id === scenarioId) ?? L2[0]
    const s = STYLES[item.style]
    const c = COLOR[item.style]
    const winIdx = item.opts.findIndex(o => o.r === 'win')
    return panel(
      <>
        {stakeholderCard(item.name, t('l2.underStress', { style: s.name }), c, s.icon)}
        <div style={{ border:'1px solid var(--red)', borderRadius:10, padding:'10px 12px', marginBottom:14, background:'rgba(255,93,108,.08)', color:'#ffd2d6', fontFamily:'var(--mono)', fontSize:13, letterSpacing:'.04em' }}>⚠ {item.crisis}</div>
        <div style={{ fontFamily:'var(--mono)', fontSize:13, color:'var(--ink-dim)', letterSpacing:'.04em', marginBottom:10 }}>{item.q}</div>
        {item.opts.map((opt, i) => {
          const state = !answered ? 'default' : i === winIdx ? 'correct' : i === chosenIdx ? 'wrong' : 'muted'
          return <OptBtn key={i} text={opt.t} state={state} disabled={answered} onClick={() => { setChosenIdx(i); lockIn(opt.r === 'win') }} />
        })}
        {answered && chosenIdx !== null && (
          <>
            <Feedback ok={correct} title={correct ? t('l2.win') : t('l2.lose')} body={item.opts[chosenIdx].why} />
            {continueBtn}
          </>
        )}
      </>
    )
  }

  // ── Level 3 · satisfy the drive ──
  const item = L3.find(s => s.id === scenarioId) ?? L3[0]
  const accent = item.style ? COLOR[item.style] : 'var(--green)'
  const icon = item.style ? STYLES[item.style].icon : STYLES.expressive.icon
  return panel(
    <>
      {stakeholderCard(item.name, item.persona, accent, icon)}
      <div style={{ fontSize:14, lineHeight:1.5, marginBottom:14 }}>{item.situation}</div>
      <div style={{ fontFamily:'var(--mono)', fontSize:13, color:'var(--ink-dim)', letterSpacing:'.04em', marginBottom:10 }}>{item.q}</div>
      {item.opts.map((opt, i) => {
        const state = !answered ? 'default' : opt.correct ? 'correct' : i === chosenIdx ? 'wrong' : 'muted'
        return <OptBtn key={i} text={opt.t} state={state} disabled={answered} onClick={() => { setChosenIdx(i); lockIn(opt.correct) }} />
      })}
      {answered && chosenIdx !== null && (
        <>
          <Feedback ok={correct} title={correct ? t('l3.driveSatisfied') : t('l3.wrongDrive')} body={item.opts[chosenIdx].why} />
          {continueBtn}
        </>
      )}
    </>
  )
}
