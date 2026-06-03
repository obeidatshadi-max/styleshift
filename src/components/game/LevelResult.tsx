'use client'
import { useState } from 'react'
import { Meter } from './helpers'
import { useT } from '@/lib/i18n'

interface Props {
  level: number
  results: boolean[]
  meters?: { quota: number; morale: number; risk: number }
  onHome: (confidence: number) => void
}

export default function LevelResult({ level, results, meters, onHome }: Props) {
  const t = useT()
  const total = results.length
  const got = results.filter(Boolean).length
  const acc = Math.round(got / total * 100)
  const [conf, setConf] = useState(acc)
  const apexClear = meters ? meters.quota >= 60 && meters.morale >= 50 && meters.risk <= 50 : false

  return (
    <div style={{ position:'relative', zIndex:1, maxWidth:1040, margin:'0 auto', padding:14 }}>
      <div style={{ background:'linear-gradient(180deg,var(--panel),#0a1430)', border:'1px solid var(--line)', borderRadius:16, padding:16, boxShadow:'0 12px 40px rgba(0,0,0,.45)' }}>
        <div style={{ textAlign:'center', padding:'6px 0 14px' }}>
          <div style={{ fontFamily:'var(--mono)', fontSize:44, fontWeight:700, color:'var(--cyan)', textShadow:'var(--glow-cyan)' }}>{acc}%</div>
          <div style={{ fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.25em', textTransform:'uppercase', color:'var(--ink-dim)' }}>{t('result.subtitle', { level, got, total })}</div>
        </div>
        {level === 4 && meters && (
          <>
            <Meter label={t('l4.globalQuota')} type="quota" val={meters.quota} />
            <Meter label={t('l4.teamMorale')} type="morale" val={meters.morale} />
            <Meter label={t('l4.riskAssessment')} type="risk" val={meters.risk} />
            <div style={{ marginBottom:14, borderRadius:12, padding:'13px 14px', fontSize:13.5, lineHeight:1.5, border:`1px solid ${apexClear?'var(--green)':'var(--red)'}`, background: apexClear?'rgba(62,224,143,.1)':'rgba(255,93,108,.1)' }}>
              <b style={{ display:'block', fontFamily:'var(--mono)', letterSpacing:'.1em', textTransform:'uppercase', fontSize:11, marginBottom:5, color: apexClear?'var(--green)':'var(--red)' }}>{apexClear ? t('result.dealBalanced') : t('result.dealUnbalanced')}</b>
              {t('result.target')}
            </div>
          </>
        )}
        <div style={{ fontFamily:'var(--mono)', fontSize:13, color:'var(--ink-dim)', letterSpacing:'.04em', marginBottom:10 }}>{t('result.confidence')}</div>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
          <input type="range" min={0} max={100} value={conf} onChange={e => setConf(+e.target.value)} style={{ flex:1, accentColor:'var(--cyan)' }} />
          <span style={{ fontFamily:'var(--mono)', fontSize:18, color:'var(--cyan)', width:48, textAlign:'end' as const }}>{conf}%</span>
        </div>
        <button onClick={() => onHome(conf)} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.15em', textTransform:'uppercase', border:'1px solid var(--cyan)', color:'#04121c', background:'var(--cyan)', borderRadius:10, padding:'12px 18px', boxShadow:'var(--glow-cyan)', touchAction:'manipulation' }}>
          {t('result.logContinue')}
        </button>
      </div>
    </div>
  )
}
