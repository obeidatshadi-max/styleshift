'use client'
import { useState } from 'react'
import { useLang, useT, useGameData } from '@/lib/i18n'

interface Props { onDone: () => void }

const COLOR: Record<string, string> = { driver:'var(--purple)', expressive:'var(--green)', amiable:'var(--pink)', analytical:'var(--cyan)' }
const LEVEL_COLORS = ['var(--cyan)', 'var(--amber)', 'var(--green)', 'var(--purple)']

export default function HowItWorks({ onDone }: Props) {
  const t = useT()
  const { dir } = useLang()
  const { STYLES, STYLE_ORDER, LEVELS } = useGameData()
  const [i, setI] = useState(0)
  const fwd = dir === 'rtl' ? '←' : '→'
  const back = dir === 'rtl' ? '→' : '←'
  const verbs = [t('how.verb1'), t('how.verb2'), t('how.verb3'), t('how.verb4')]

  const eyebrow = (text: string) => (
    <div style={{ fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.4em', textTransform:'uppercase', color:'var(--cyan)', marginBottom:10 }}>{text}</div>
  )
  const heading = (text: string) => (
    <h2 style={{ fontSize:'clamp(20px,5vw,28px)', fontWeight:800, letterSpacing:'.01em', marginBottom:12, lineHeight:1.15 }}>{text}</h2>
  )
  const body = (text: string) => (
    <p style={{ color:'var(--ink-dim)', fontSize:14.5, lineHeight:1.6, marginBottom:18 }}>{text}</p>
  )

  // ── Slide 1: welcome ──
  const slide1 = (
    <>
      {eyebrow(t('how.s1.eyebrow'))}
      <div style={{ fontSize:'clamp(26px,7vw,44px)', fontWeight:800, letterSpacing:'.02em', textShadow:'0 0 24px rgba(56,214,255,.35)', marginBottom:10 }}>
        STYLE<span style={{ color:'var(--cyan)' }}>SHIFT</span>
      </div>
      {heading(t('how.s1.title'))}
      {body(t('how.s1.body'))}
    </>
  )

  // ── Slide 2: the four styles ──
  const slide2 = (
    <>
      {eyebrow('01 / 04')}
      {heading(t('how.s2.title'))}
      {body(t('how.s2.body'))}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        {STYLE_ORDER.map(k => {
          const s = STYLES[k]; const c = COLOR[k]
          return (
            <div key={k} style={{ border:`1px solid ${c}`, borderRadius:12, padding:'12px 12px', background:'rgba(0,0,0,.2)', textAlign:'start' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                <span style={{ color:c, fontSize:18 }}>{s.icon}</span>
                <b style={{ color:c, fontSize:15 }}>{s.name}</b>
              </div>
              <div style={{ fontFamily:'var(--mono)', fontSize:10.5, letterSpacing:'.05em', color:'var(--ink-dim)' }}>{s.drive}</div>
            </div>
          )
        })}
      </div>
    </>
  )

  // ── Slide 3: the four levels ──
  const slide3 = (
    <>
      {eyebrow('02 / 04')}
      {heading(t('how.s3.title'))}
      {body(t('how.s3.body'))}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {LEVELS.map((l, idx) => {
          const c = LEVEL_COLORS[idx]
          return (
            <div key={l.n} style={{ display:'flex', alignItems:'center', gap:12, border:'1px solid var(--line)', borderRadius:12, padding:'11px 13px', background:'rgba(0,0,0,.18)' }}>
              <span style={{ fontFamily:'var(--mono)', fontWeight:700, fontSize:16, width:34, height:34, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:9, border:`1px solid ${c}`, color:c, background:'rgba(0,0,0,.25)' }}>{l.n}</span>
              <div style={{ flex:1, minWidth:0, textAlign:'start' }}>
                <b style={{ fontSize:14.5, display:'block' }}>{verbs[idx]} · <span style={{ color:c }}>{l.title}</span></b>
                <span style={{ fontSize:12, color:'var(--ink-dim)' }}>{l.sub}</span>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )

  // ── Slide 4: grow & streak ──
  const slide4 = (
    <>
      {eyebrow('03 / 04')}
      {heading(t('how.s4.title'))}
      <div style={{ display:'flex', alignItems:'center', gap:10, fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.06em', color:'var(--ink-dim)', flexWrap:'wrap', marginBottom:16 }}>
        <span style={{ color:'var(--ink-dim)' }}>Rookie</span><span>{fwd}</span>
        <span>Field Rep</span><span>{fwd}</span>
        <span>Style Reader</span><span>{fwd}</span>
        <span>Drive Expert</span><span>{fwd}</span>
        <span style={{ color:'var(--amber)' }}>Style Master</span>
      </div>
      {body(t('how.s4.xp'))}
      <div style={{ border:'1px solid var(--amber)', borderRadius:12, padding:'13px 14px', background:'rgba(255,206,77,.07)' }}>
        <div style={{ fontSize:14, lineHeight:1.55, color:'var(--ink)' }}>{t('how.s4.daily')}</div>
      </div>
    </>
  )

  const slides = [slide1, slide2, slide3, slide4]
  const last = i === slides.length - 1

  return (
    <div style={{ position:'relative', zIndex:1, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ width:'100%', maxWidth:460, background:'linear-gradient(180deg,var(--panel),#0a1430)', border:'1px solid var(--line)', borderRadius:18, padding:'18px 20px 20px', boxShadow:'0 16px 50px rgba(0,0,0,.55)' }}>

        {/* Skip */}
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:6 }}>
          <button onClick={onDone} style={{ background:'none', border:'none', cursor:'pointer', fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.12em', textTransform:'uppercase', color:'var(--ink-dim)' }}>{t('how.skip')}</button>
        </div>

        {/* Slide body */}
        <div style={{ minHeight:300 }}>{slides[i]}</div>

        {/* Progress dots */}
        <div style={{ display:'flex', justifyContent:'center', gap:7, margin:'18px 0 14px' }}>
          {slides.map((_, idx) => (
            <span key={idx} style={{ width:idx === i ? 22 : 8, height:8, borderRadius:6, background: idx === i ? 'var(--cyan)' : 'var(--line)', boxShadow: idx === i ? 'var(--glow-cyan)' : 'none', transition:'width .25s' }} />
          ))}
        </div>

        {/* Nav */}
        <div style={{ display:'flex', gap:10 }}>
          {i > 0 && (
            <button onClick={() => setI(n => n - 1)} style={{ flex:'0 0 auto', cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.12em', textTransform:'uppercase', border:'1px solid var(--cyan)', color:'var(--cyan)', background:'transparent', borderRadius:10, padding:'12px 16px', touchAction:'manipulation' }}>{back} {t('how.back')}</button>
          )}
          <button onClick={() => (last ? onDone() : setI(n => n + 1))} style={{ flex:1, cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.12em', textTransform:'uppercase', border:'1px solid var(--cyan)', color:'#04121c', background:'var(--cyan)', borderRadius:10, padding:'12px 18px', boxShadow:'var(--glow-cyan)', touchAction:'manipulation' }}>
            {last ? t('how.start') : `${t('how.next')} ${fwd}`}
          </button>
        </div>
      </div>
    </div>
  )
}
