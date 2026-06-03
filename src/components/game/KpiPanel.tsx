'use client'
import { useT } from '@/lib/i18n'

interface Props {
  decisions: number
  correct: number
  totalReactionMs: number
  reactionCount: number
  confidence: number
}

export default function KpiPanel({ decisions, correct, totalReactionMs, reactionCount, confidence }: Props) {
  const t = useT()
  const acc = decisions ? Math.round(correct / decisions * 100) : null
  const rt = reactionCount ? (totalReactionMs / reactionCount / 1000) : null
  const accCls = acc !== null ? (acc >= 90 ? 'var(--green)' : 'var(--amber)') : 'var(--cyan)'
  const rtCls  = rt  !== null ? (rt  <= 2.1 ? 'var(--green)' : 'var(--amber)') : 'var(--cyan)'

  const kpi = (label: string, val: string | null, unit: string, target: string, color: string) => (
    <div style={{ border:'1px solid var(--line)', borderRadius:12, padding:14, background:'rgba(0,0,0,.2)', textAlign:'center' as const }}>
      <div style={{ fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.18em', textTransform:'uppercase', color:'var(--ink-dim)' }}>{label}</div>
      <div style={{ fontFamily:'var(--mono)', fontSize:26, fontWeight:700, margin:'6px 0 2px', color }}>
        {val ?? '—'}<span style={{ fontSize:13 }}>{val ? unit : ''}</span>
      </div>
      <div style={{ fontSize:11, color:'var(--ink-dim)' }}>{target}</div>
    </div>
  )

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
      {kpi(t('kpi.reactionTime'), rt ? rt.toFixed(1) : null, t('kpi.secondsUnit'), t('kpi.targetRt'), rtCls)}
      {kpi(t('kpi.accuracyRate'), acc !== null ? String(acc) : null, '%', t('kpi.targetAcc'), accCls)}
      {kpi(t('kpi.confidence'), confidence ? String(confidence) : null, '%', t('kpi.selfAssessed'), 'var(--cyan)')}
    </div>
  )
}
