'use client'
import React from 'react'

export function Topline({ level, title, total, idx, results }: { level: number; title: string; total: number; idx: number; results: boolean[] }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, gap:6, flexWrap:'wrap' }}>
      <div style={{ fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.3em', textTransform:'uppercase', color:'var(--cyan)', display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ width:9, height:9, borderRadius:'50%', background:'var(--cyan)', boxShadow:'var(--glow-cyan)', display:'inline-block' }} />
        {title}
      </div>
      <div style={{ display:'flex', gap:6 }}>
        {Array.from({length:total}).map((_,i) => {
          let bg = 'var(--line)'
          if (i < idx) bg = results[i] ? 'var(--green)' : 'var(--red)'
          else if (i === idx) bg = 'var(--cyan)'
          return <span key={i} style={{ width:7, height:7, borderRadius:'50%', background:bg, boxShadow:i===idx?'var(--glow-cyan)':'none', display:'inline-block' }} />
        })}
      </div>
    </div>
  )
}

export function OptBtn({ text, state, disabled, onClick }: { text: string; state: 'default'|'correct'|'wrong'|'muted'; disabled: boolean; onClick: ()=>void }) {
  const border = state==='correct' ? 'var(--green)' : state==='wrong' ? 'var(--red)' : 'var(--line)'
  const bg = state==='correct' ? 'rgba(62,224,143,.12)' : state==='wrong' ? 'rgba(255,93,108,.12)' : 'rgba(0,0,0,.18)'
  return (
    <button disabled={disabled} onClick={onClick}
      style={{ textAlign:'left', width:'100%', cursor:disabled?'default':'pointer', color:'var(--ink)', fontFamily:'var(--sans)', fontSize:14, lineHeight:1.4, border:`1px solid ${border}`, borderRadius:12, padding:'13px 14px', background:bg, opacity:state==='muted'?.45:1, marginBottom:10, touchAction:'manipulation', display:'block' }}>
      {text}
    </button>
  )
}

export function Feedback({ ok, title, body }: { ok: boolean; title: string; body: string }) {
  return (
    <div style={{ marginTop:14, borderRadius:12, padding:'13px 14px', fontSize:13.5, lineHeight:1.5, border:`1px solid ${ok?'var(--green)':'var(--red)'}`, background:ok?'rgba(62,224,143,.1)':'rgba(255,93,108,.1)' }}>
      <b style={{ display:'block', fontFamily:'var(--mono)', letterSpacing:'.1em', textTransform:'uppercase', fontSize:11, marginBottom:5, color:ok?'var(--green)':'var(--red)' }}>{title}</b>
      <span dangerouslySetInnerHTML={{ __html: body }} />
    </div>
  )
}

export function NextRow({ onNext, onBack, isLast }: { onNext: ()=>void; onBack: ()=>void; isLast: boolean }) {
  const btnBase: React.CSSProperties = { display:'inline-flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.15em', textTransform:'uppercase', borderRadius:10, padding:'12px 18px', touchAction:'manipulation' }
  return (
    <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:14 }}>
      <button onClick={onNext} style={{ ...btnBase, border:'1px solid var(--cyan)', color:'#04121c', background:'var(--cyan)', boxShadow:'var(--glow-cyan)' }}>{isLast ? 'See Results' : 'Next →'}</button>
      <button onClick={onBack} style={{ ...btnBase, border:'1px solid var(--cyan)', color:'var(--cyan)', background:'transparent' }}>Home</button>
    </div>
  )
}

const METER_FILLS: Record<string,string> = {
  stress: 'linear-gradient(90deg,var(--green),var(--amber) 55%,var(--red))',
  quota:  'linear-gradient(90deg,#1d7,var(--green))',
  morale: 'linear-gradient(90deg,#08c,var(--cyan))',
  risk:   'linear-gradient(90deg,var(--green),var(--amber) 50%,var(--red))',
}

export function Meter({ label, type, val }: { label: string; type: string; val: number }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.14em', textTransform:'uppercase', color:'var(--ink-dim)', marginBottom:5 }}>
        <span>{label}</span><span>{Math.round(val)}%</span>
      </div>
      <div style={{ height:12, borderRadius:8, background:'rgba(0,0,0,.4)', border:'1px solid var(--line)', overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${val}%`, borderRadius:8, background:METER_FILLS[type], transition:'width .6s cubic-bezier(.2,.8,.2,1)' }} />
      </div>
    </div>
  )
}
