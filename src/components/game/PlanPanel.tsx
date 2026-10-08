'use client'
import { useState } from 'react'
import { useT } from '@/lib/i18n'
import type { Doctor } from '@/types/game'

const inputStyle: React.CSSProperties = {
  background:'rgba(0,0,0,.3)', border:'1px solid var(--line)', borderRadius:10,
  padding:'11px 13px', color:'var(--ink)', fontFamily:'var(--sans)', fontSize:14, outline:'none', width:'100%',
}
const labelStyle: React.CSSProperties = { fontFamily:'var(--mono)', fontSize:10, letterSpacing:'.15em', textTransform:'uppercase', color:'var(--ink-dim)', marginBottom:6, display:'block' }
const primaryBtn: React.CSSProperties = { cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.12em', textTransform:'uppercase', border:'1px solid var(--cyan)', color:'#04121c', background:'var(--cyan)', borderRadius:10, padding:'12px 18px', boxShadow:'var(--glow-cyan)', touchAction:'manipulation' }
const ghostBtn: React.CSSProperties = { cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.12em', textTransform:'uppercase', border:'1px solid var(--cyan)', color:'var(--cyan)', background:'transparent', borderRadius:10, padding:'12px 18px', touchAction:'manipulation' }

/** The "Plan" stage of the 3P cycle: a goal set before the visit, which the AI Coach debrief pre-fills from. */
export default function PlanPanel({ doctor, onSave }: { doctor: Doctor; onSave: (plan: { objective: string; successMeasure: string } | null) => Promise<boolean> }) {
  const t = useT()
  const [objective, setObjective] = useState(doctor.plan_objective ?? '')
  const [measure, setMeasure] = useState(doctor.plan_success_measure ?? '')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const dirty = objective.trim() !== (doctor.plan_objective ?? '') || measure.trim() !== (doctor.plan_success_measure ?? '')
  const hasPlan = !!(doctor.plan_objective || doctor.plan_success_measure)

  async function run(plan: { objective: string; successMeasure: string } | null) {
    setState('saving')
    const ok = await onSave(plan)
    if (ok && !plan) { setObjective(''); setMeasure('') }
    setState(ok ? 'saved' : 'error')
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <p style={{ margin:0, fontSize:13, color:'var(--ink-dim)', lineHeight:1.6 }}>{t('plan.intro')}</p>
      <label style={{ display:'block' }}>
        <span style={labelStyle}>{t('plan.objective')}</span>
        <textarea rows={2} maxLength={500} value={objective} onChange={e => { setObjective(e.target.value); setState('idle') }} placeholder={t('plan.objectiveHint')} style={{ ...inputStyle, resize:'vertical' }} />
      </label>
      <label style={{ display:'block' }}>
        <span style={labelStyle}>{t('plan.measure')}</span>
        <input maxLength={500} value={measure} onChange={e => { setMeasure(e.target.value); setState('idle') }} placeholder={t('plan.measureHint')} style={inputStyle} />
      </label>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
        <button disabled={state === 'saving' || !objective.trim() || !dirty} onClick={() => void run({ objective, successMeasure: measure })} style={{ ...primaryBtn, opacity: state === 'saving' || !objective.trim() || !dirty ? .5 : 1 }}>
          {state === 'saving' ? t('plan.saving') : t('plan.save')}
        </button>
        {hasPlan && <button disabled={state === 'saving'} onClick={() => void run(null)} style={{ ...ghostBtn, borderColor:'var(--line)', color:'var(--ink-dim)' }}>{t('plan.clear')}</button>}
        {state === 'saved' && <span role="status" style={{ fontSize:12.5, color:'var(--green)' }}>{t('plan.saved')}</span>}
        {state === 'error' && <span role="alert" style={{ fontSize:12.5, color:'var(--red)' }}>{t('plan.error')}</span>}
      </div>
    </div>
  )
}
