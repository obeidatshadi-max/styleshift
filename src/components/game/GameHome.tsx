'use client'
import RankBar from './RankBar'
import KpiPanel from './KpiPanel'
import type { BadgeName } from '@/types/game'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import { useGameData, useT, useBadgeLabel } from '@/lib/i18n'
import LangToggle from '@/components/LangToggle'

const ALL_BADGES: BadgeName[] = ['First Scan','Crisis Tamer','Drive Whisperer','Boardroom Ace','Style Master']
const COLOR: Record<string,string> = { driver:'var(--purple)', expressive:'var(--green)', amiable:'var(--pink)', analytical:'var(--cyan)' }

interface Props {
  xp: number
  badges: BadgeName[]
  earnedLevels: number[]
  decisions: number
  correct: number
  totalReactionMs: number
  reactionCount: number
  confidence: number
  role: string
  onStartLevel: (n: number) => void
}

export default function GameHome({ xp, badges, earnedLevels, decisions, correct, totalReactionMs, reactionCount, confidence, role, onStartLevel }: Props) {
  const unlocked = [1, ...earnedLevels.map(n => n + 1)].filter(n => n <= 4)
  const router = useRouter()
  const t = useT()
  const badgeLabel = useBadgeLabel()
  const { STYLES, STYLE_ORDER, LEVELS } = useGameData()

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const navLinkStyle = { fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase' as const, color: 'var(--ink-dim)', textDecoration: 'none', cursor: 'pointer', background: 'none', border: 'none' }

  const panel = (title: string, children: React.ReactNode) => (
    <section style={{ background:'linear-gradient(180deg,var(--panel),#0a1430)', border:'1px solid var(--line)', borderRadius:16, padding:16, boxShadow:'0 12px 40px rgba(0,0,0,.45)' }}>
      <div style={{ fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.3em', textTransform:'uppercase', color:'var(--cyan)', display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
        <span style={{ width:9, height:9, borderRadius:'50%', background:'var(--cyan)', boxShadow:'var(--glow-cyan)', display:'inline-block' }} />
        {title}
      </div>
      {children}
    </section>
  )

  return (
    <div style={{ position:'relative', zIndex:1, maxWidth:1040, margin:'0 auto', padding:14 }}>
      <div style={{ display:'flex', justifyContent:'flex-end', paddingTop:6 }}>
        <LangToggle />
      </div>
      <header style={{ textAlign:'center', padding:'4px 8px 18px' }}>
        <div style={{ fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.45em', color:'var(--cyan)', textTransform:'uppercase', opacity:.85 }}>{t('eyebrow')}</div>
        <h1 style={{ fontSize:'clamp(22px,5.4vw,40px)', lineHeight:1.05, marginTop:6, letterSpacing:'.02em', fontWeight:800, textShadow:'0 0 24px rgba(56,214,255,.35)' }}>
          STYLE<span style={{ color:'var(--cyan)' }}>SHIFT</span>
        </h1>
        <div style={{ color:'var(--ink-dim)', fontSize:13, marginTop:8, letterSpacing:'.18em', textTransform:'uppercase' }}>{t('tagline')}</div>
      </header>

      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

        {panel(t('home.archetypes'),
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:12 }}>
            {STYLE_ORDER.map(k => {
              const s = STYLES[k]; const c = COLOR[k]
              return (
                <div key={k} style={{ border:'1px solid var(--line)', borderRadius:14, padding:14, background:'linear-gradient(180deg,rgba(255,255,255,.025),rgba(0,0,0,.18))' }}>
                  <div style={{ width:54, height:54, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, marginBottom:10, border:`2px solid ${c}`, boxShadow:`0 0 16px ${c}`, color:c }}>{s.icon}</div>
                  <h3 style={{ fontSize:16, letterSpacing:'.04em', marginBottom:2, color:c }}>{s.name}</h3>
                  <div style={{ fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.18em', color:'var(--ink-dim)', textTransform:'uppercase', marginBottom:8 }}>{t('style.socialStyle')}</div>
                  <p style={{ fontSize:12.5, color:'var(--ink-dim)', lineHeight:1.45 }}>{s.blurb}</p>
                  <div style={{ marginTop:10, fontSize:11, fontFamily:'var(--mono)', letterSpacing:'.05em' }}>
                    <b style={{ color:c, display:'block', fontSize:10, letterSpacing:'.22em', textTransform:'uppercase', opacity:.8, marginBottom:2 }}>{t('style.coreDrive')}</b>
                    {s.drive}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {panel(t('home.ladder'),
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {LEVELS.map(l => {
              const isUnlocked = unlocked.includes(l.n)
              const isDone = earnedLevels.includes(l.n)
              return (
                <button key={l.n} disabled={!isUnlocked} onClick={() => onStartLevel(l.n)}
                  style={{ display:'flex', alignItems:'center', gap:14, textAlign:'start', width:'100%', cursor: isUnlocked ? 'pointer' : 'not-allowed', background:'linear-gradient(90deg,rgba(56,214,255,.06),rgba(0,0,0,.15))', border:'1px solid var(--line)', borderRadius:12, padding:14, color:'var(--ink)', fontFamily:'var(--sans)', opacity: isUnlocked ? 1 : .4, touchAction:'manipulation' }}>
                  <span style={{ fontFamily:'var(--mono)', fontSize:18, fontWeight:700, width:42, height:42, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:10, border:'1px solid var(--line)', background:'rgba(0,0,0,.25)', color:'var(--cyan)' }}>{l.n}</span>
                  <span style={{ flex:1 }}>
                    <b style={{ display:'block', fontSize:15, letterSpacing:'.02em' }}>{l.title}</b>
                    <span style={{ fontSize:12, color:'var(--ink-dim)' }}>{l.sub}</span>
                  </span>
                  <span style={{ fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.15em', textTransform:'uppercase', color: isDone ? 'var(--green)' : isUnlocked ? 'var(--cyan)' : 'var(--ink-dim)', marginLeft:'auto' }}>
                    {isDone ? t('status.cleared') : isUnlocked ? t('status.ready') : t('status.locked')}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {panel(t('home.mastery'),
          <>
            <RankBar xp={xp} />
            <KpiPanel decisions={decisions} correct={correct} totalReactionMs={totalReactionMs} reactionCount={reactionCount} confidence={confidence} />
            <div style={{ marginTop:14 }}>
              {ALL_BADGES.map(name => (
                <span key={name} style={{ display:'inline-flex', alignItems:'center', gap:7, fontFamily:'var(--mono)', fontSize:10, letterSpacing:'.12em', textTransform:'uppercase', border:`1px solid ${badges.includes(name) ? 'var(--green)' : 'var(--line)'}`, color: badges.includes(name) ? 'var(--green)' : 'var(--ink-dim)', borderRadius:20, padding:'5px 11px', background: badges.includes(name) ? 'rgba(62,224,143,.08)' : 'transparent', margin:'4px 4px 0 0' }}>
                  {badges.includes(name) ? '★' : '☆'} {badgeLabel(name)}
                </span>
              ))}
            </div>
          </>
        )}

      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 8 }}>
        {role === 'manager' ? (
          <a href="/dashboard" style={navLinkStyle}>{t('nav.managerDashboard')}</a>
        ) : (
          <a href="/onboarding" style={navLinkStyle}>{t('nav.createTeam')}</a>
        )}
        <button onClick={signOut} style={navLinkStyle}>{t('nav.signOut')}</button>
      </div>

      <footer style={{ textAlign:'center', color:'var(--ink-dim)', fontSize:12, letterSpacing:'.05em', padding:'18px 8px 6px', lineHeight:1.6 }}>
        {t('footer.tagline')}<br />
        {t('footer.by')} <a href="https://psychologytobusiness.com" style={{ color:'var(--cyan)', textDecoration:'none' }}>psychologytobusiness.com</a>
      </footer>
    </div>
  )
}
