'use client'
import { useT } from '@/lib/i18n'

interface Props {
  spsPending: boolean
  dailyDone: boolean
  onTakeSps: () => void
  onShowPrep: () => void
  onStartDaily: () => void
}

/** First-day guide for a rep with no XP yet: three numbered steps instead of a long home screen. */
export default function StartHereCard({ spsPending, dailyDone, onTakeSps, onShowPrep, onStartDaily }: Props) {
  const t = useT()
  const steps = [
    { label: t('home.start.step1'), done: !spsPending, onGo: onTakeSps },
    { label: t('home.start.step2'), done: false, onGo: onShowPrep },
    { label: t('home.start.step3'), done: dailyDone, onGo: onStartDaily },
  ]
  // The first step not done yet gets the filled button, so the rep always sees one clear next move.
  const current = steps.findIndex(s => !s.done)

  return (
    <section aria-label={t('home.start.title')} style={{ background:'var(--panel)', border:'2px solid var(--cyan)', borderRadius:16, padding:16, boxShadow:'var(--shadow)' }}>
      <h2 style={{ fontSize:20, margin:'0 0 4px' }}>{t('home.start.title')}</h2>
      <p style={{ color:'var(--ink-dim)', fontSize:16, lineHeight:1.5, margin:'0 0 14px' }}>{t('home.start.sub')}</p>
      <ol style={{ listStyle:'none', padding:0, margin:0, display:'flex', flexDirection:'column', gap:10 }}>
        {steps.map((s, i) => (
          <li key={i} style={{ display:'flex', alignItems:'center', gap:12, border:'1px solid var(--line)', borderRadius:12, padding:12, background: i === current ? 'var(--accent-soft)' : 'transparent' }}>
            <span aria-hidden="true" style={{ width:32, height:32, flexShrink:0, display:'grid', placeItems:'center', borderRadius:'50%', fontWeight:700, border:`1px solid ${s.done ? 'var(--green)' : 'var(--cyan)'}`, color: s.done ? 'var(--green)' : 'var(--cyan)' }}>{s.done ? '✓' : i + 1}</span>
            <span style={{ flex:1, fontSize:16, lineHeight:1.45, color: s.done ? 'var(--ink-dim)' : 'var(--ink)' }}>{s.label}</span>
            {s.done
              ? <span style={{ fontSize:14, color:'var(--green)' }}>{t('home.start.done')}</span>
              : <button onClick={s.onGo} style={{ cursor:'pointer', fontSize:14, borderRadius:10, padding:'9px 14px', border:'1px solid var(--cyan)', color: i === current ? 'var(--on-accent)' : 'var(--cyan)', background: i === current ? 'var(--cyan)' : 'transparent', touchAction:'manipulation', whiteSpace:'nowrap' }}>{t('home.start.go')}</button>}
          </li>
        ))}
      </ol>
    </section>
  )
}
