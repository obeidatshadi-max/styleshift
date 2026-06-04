'use client'
import { useState } from 'react'
import { useT, useGameData } from '@/lib/i18n'
import type { GeneratedScenario } from '@/types/game'
import { OptBtn, Feedback } from './helpers'

interface Props {
  scenario: GeneratedScenario
  onDone: () => void
}

const COLOR: Record<string, string> = { driver:'var(--purple)', expressive:'var(--green)', amiable:'var(--pink)', analytical:'var(--cyan)' }

export default function GeneratedDrill({ scenario, onDone }: Props) {
  const t = useT()
  const { STYLES } = useGameData()
  const [chosen, setChosen] = useState<number | null>(null)
  const s = STYLES[scenario.style]
  const c = COLOR[scenario.style]
  const winIdx = scenario.opts.findIndex(o => o.r === 'win')

  return (
    <div style={{ position:'relative', zIndex:1, maxWidth:560, margin:'0 auto', padding:14 }}>
      <div style={{ background:'linear-gradient(180deg,var(--panel),#0a1430)', border:'1px solid var(--line)', borderRadius:16, padding:16, boxShadow:'0 12px 40px rgba(0,0,0,.45)' }}>
        <div style={{ fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.3em', textTransform:'uppercase', color:'var(--purple)', display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
          <span style={{ width:9, height:9, borderRadius:'50%', background:'var(--purple)', boxShadow:'0 0 14px var(--purple)', display:'inline-block' }} />
          {t('prep.aiDrill')}
        </div>

        <div style={{ display:'flex', gap:14, alignItems:'flex-start', border:'1px solid var(--line)', borderRadius:14, padding:16, background:'linear-gradient(180deg,rgba(255,255,255,.025),rgba(0,0,0,.2))', marginBottom:14 }}>
          <div style={{ width:54, height:54, flexShrink:0, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, border:`2px solid ${c}`, boxShadow:`0 0 16px ${c}`, color:c }}>{s.icon}</div>
          <div>
            <div style={{ fontSize:16, fontWeight:700 }}>{scenario.name}</div>
            <div style={{ fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.12em', textTransform:'uppercase', color:'var(--ink-dim)' }}>{s.name}</div>
          </div>
        </div>

        <div style={{ border:'1px solid var(--red)', borderRadius:10, padding:'10px 12px', marginBottom:14, background:'rgba(255,93,108,.08)', color:'#ffd2d6', fontFamily:'var(--mono)', fontSize:13, letterSpacing:'.04em' }}>⚠ {scenario.crisis}</div>
        <div style={{ fontFamily:'var(--mono)', fontSize:13, color:'var(--ink-dim)', letterSpacing:'.04em', marginBottom:10 }}>{scenario.q}</div>

        {scenario.opts.map((opt, i) => {
          const state = chosen === null ? 'default' : i === winIdx ? 'correct' : i === chosen ? 'wrong' : 'muted'
          return <OptBtn key={i} text={opt.t} state={state} disabled={chosen !== null} onClick={() => setChosen(i)} />
        })}

        {chosen !== null && (
          <>
            <Feedback ok={scenario.opts[chosen].r === 'win'} title={scenario.opts[chosen].r === 'win' ? t('l2.win') : t('l2.lose')} body={scenario.opts[chosen].why} />
            <div style={{ marginTop:14 }}>
              <button onClick={onDone} style={{ cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.15em', textTransform:'uppercase', border:'1px solid var(--cyan)', color:'#04121c', background:'var(--cyan)', borderRadius:10, padding:'12px 18px', boxShadow:'var(--glow-cyan)', touchAction:'manipulation' }}>
                {t('result.logContinue')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
