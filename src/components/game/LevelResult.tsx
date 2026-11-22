'use client'
import { useState } from 'react'
import { Meter } from './helpers'
import { useT, useSpsData } from '@/lib/i18n'
import type { SpsKey } from '@/lib/sps-core'

interface Props {
  level: number
  results: boolean[]
  meters?: { quota: number; morale: number; risk: number }
  spsKey?: SpsKey | null
  /** XP this run earned. */
  xpEarned?: number
  /** The level was already cleared before this run, so nothing new opened. */
  replay?: boolean
  onHome: (confidence: number) => void
}

export default function LevelResult({ level, results, meters, spsKey, xpEarned, replay, onHome }: Props) {
  const t = useT()
  const { SPS_PROFILES_TEXT } = useSpsData()
  const total = results.length
  const got = results.filter(Boolean).length
  const acc = Math.round(got / total * 100)
  // Start in the middle: the rep rates their own readiness; the score above must not set it for them.
  const [conf, setConf] = useState(50)
  const apexClear = meters ? meters.quota >= 60 && meters.morale >= 50 && meters.risk <= 50 : false
  // The selling-style tip shows once (level 1); every level then gets its own lesson instead of the same tip.
  const spsTip = spsKey && level === 1 ? SPS_PROFILES_TEXT[spsKey] : null

  return (
    <div style={{ position:'relative', zIndex:1, maxWidth:1040, margin:'0 auto', padding:14 }}>
      <div style={{ background:'var(--panel)', border:'1px solid var(--line)', borderRadius:16, padding:16, boxShadow:'var(--shadow)' }}>
        <div style={{ textAlign:'center', padding:'6px 0 14px' }}>
          <div style={{ fontFamily:'var(--mono)', fontSize:44, fontWeight:700, color:'var(--cyan)', textShadow:'var(--glow-cyan)' }}>{acc}%</div>
          <div style={{ fontFamily:'var(--mono)', fontSize:14, letterSpacing: 'normal', textTransform:'none', color:'var(--ink-dim)' }}>{t('result.subtitle', { level, got, total })}</div>
          <div style={{ marginTop:10, fontSize:16, fontWeight:700, color:'var(--green)' }}>✓ {t('result.complete', { level })}{xpEarned ? ` · +${xpEarned} XP` : ''}</div>
          <div style={{ marginTop:4, fontSize:14, color:'var(--ink-dim)' }}>{replay ? t('result.replayDone') : level < 4 ? t('result.nextOpen', { next: level + 1 }) : t('result.allDone')}</div>
        </div>
        <div style={{ marginBottom:14, borderRadius:12, padding:'13px 14px', fontSize:16, lineHeight:1.5, border:'1px solid var(--line)', background:'var(--surface-subtle)' }}>
          <b style={{ display:'block', fontSize:14, marginBottom:5, color:'var(--ink)' }}>{t('result.lessonLabel')}</b>
          {t(`result.lesson.${level}`)}
        </div>
        {level === 4 && meters && (
          <>
            <Meter label={t('l4.globalQuota')} type="quota" val={meters.quota} />
            <Meter label={t('l4.teamMorale')} type="morale" val={meters.morale} />
            <Meter label={t('l4.riskAssessment')} type="risk" val={meters.risk} />
            <div style={{ marginBottom:14, borderRadius:12, padding:'13px 14px', fontSize:16, lineHeight:1.5, border:`1px solid ${apexClear?'var(--green)':'var(--red)'}`, background: apexClear?'rgba(62,224,143,.1)':'rgba(255,93,108,.1)' }}>
              <b style={{ display:'block', fontFamily:'var(--mono)', letterSpacing: 'normal', textTransform:'none', fontSize:14, marginBottom:5, color: apexClear?'var(--green)':'var(--red)' }}>{apexClear ? t('result.dealBalanced') : t('result.dealUnbalanced')}</b>
              {t('result.target')}
            </div>
          </>
        )}
        {spsTip && (
          <div style={{ marginBottom:14, borderRadius:12, padding:'13px 14px', fontSize:16, lineHeight:1.5, border:`1px solid ${spsTip.color}` }}>
            <b style={{ display:'block', fontFamily:'var(--mono)', letterSpacing: 'normal', textTransform:'none', fontSize:14, marginBottom:5, color: 'var(--ink)' }}>{spsTip.name} &middot; {t('sps.tipLabel')}</b>
            {spsTip.tip}
          </div>
        )}
        <div style={{ fontFamily:'var(--mono)', fontSize:16, color:'var(--ink-dim)', letterSpacing: 'normal', marginBottom:4 }}>{t('result.confidence')}</div>
        <div style={{ fontSize:14, color:'var(--ink-dim)', marginBottom:10 }}>{t('result.confidenceHint')}</div>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
          <input type="range" min={0} max={100} value={conf} onChange={e => setConf(+e.target.value)} aria-label={t('result.confidence')} style={{ flex:1, accentColor:'var(--cyan)' }} />
          <span style={{ fontFamily:'var(--mono)', fontSize:18, color:'var(--cyan)', width:48, textAlign:'end' as const }}>{conf}%</span>
        </div>
        <button onClick={() => onHome(conf)} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', fontFamily:'var(--mono)', fontSize:14, letterSpacing: 'normal', textTransform:'none', border:'1px solid var(--cyan)', color:'var(--on-accent)', background:'var(--cyan)', borderRadius:10, padding:'12px 18px', boxShadow:'var(--glow-cyan)', touchAction:'manipulation' }}>
          {t('result.logContinue')}
        </button>
      </div>
    </div>
  )
}
