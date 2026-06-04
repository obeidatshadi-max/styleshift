'use client'
import { useState } from 'react'
import { useT, useGameData } from '@/lib/i18n'
import { useDoctors } from '@/hooks/useDoctors'
import { deriveStyle, OBJECTION_CATEGORIES } from '@/lib/social-style'
import type { Assertiveness, Responsiveness } from '@/lib/social-style'
import { L2_OBJECTION } from '@/lib/scenario-meta'
import { shuffle } from '@/lib/scenario-engine'
import type { Doctor, DoctorInput, StyleKey } from '@/types/game'
import DailyChallenge from './DailyChallenge'

interface Props { onExit: () => void }

const COLOR: Record<string, string> = { driver:'var(--purple)', expressive:'var(--green)', amiable:'var(--pink)', analytical:'var(--cyan)' }
const STYLE_KEYS: StyleKey[] = ['driver', 'expressive', 'amiable', 'analytical']

type View =
  | { mode: 'list' }
  | { mode: 'form'; doctor?: Doctor }
  | { mode: 'detail'; doctor: Doctor }
  | { mode: 'warmup'; doctor: Doctor }

const inputStyle: React.CSSProperties = {
  background:'rgba(0,0,0,.3)', border:'1px solid var(--line)', borderRadius:10,
  padding:'11px 13px', color:'var(--ink)', fontFamily:'var(--sans)', fontSize:14, outline:'none', width:'100%',
}
const labelStyle: React.CSSProperties = { fontFamily:'var(--mono)', fontSize:10, letterSpacing:'.15em', textTransform:'uppercase', color:'var(--ink-dim)', marginBottom:6, display:'block' }

function panel(title: string, children: React.ReactNode, right?: React.ReactNode) {
  return (
    <section style={{ background:'linear-gradient(180deg,var(--panel),#0a1430)', border:'1px solid var(--line)', borderRadius:16, padding:16, boxShadow:'0 12px 40px rgba(0,0,0,.45)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:14 }}>
        <div style={{ fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.3em', textTransform:'uppercase', color:'var(--cyan)', display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ width:9, height:9, borderRadius:'50%', background:'var(--cyan)', boxShadow:'var(--glow-cyan)', display:'inline-block' }} />
          {title}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

const primaryBtn: React.CSSProperties = { cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.12em', textTransform:'uppercase', border:'1px solid var(--cyan)', color:'#04121c', background:'var(--cyan)', borderRadius:10, padding:'12px 18px', boxShadow:'var(--glow-cyan)', touchAction:'manipulation' }
const ghostBtn: React.CSSProperties = { cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.12em', textTransform:'uppercase', border:'1px solid var(--cyan)', color:'var(--cyan)', background:'transparent', borderRadius:10, padding:'12px 18px', touchAction:'manipulation' }

export default function VisitPrep({ onExit }: Props) {
  const t = useT()
  const { STYLES, L1, L2, L3 } = useGameData()
  const { doctors, loading, saveDoctor, removeDoctor } = useDoctors()
  const [view, setView] = useState<View>({ mode: 'list' })

  const wrap = (children: React.ReactNode) => (
    <div style={{ position:'relative', zIndex:1, maxWidth:560, margin:'0 auto', padding:14, display:'flex', flexDirection:'column', gap:14 }}>{children}</div>
  )

  // ───────────────────────── WARM-UP ─────────────────────────
  if (view.mode === 'warmup') {
    return <WarmUp doctor={view.doctor} L1={L1} L2={L2} L3={L3} onDone={() => setView({ mode: 'detail', doctor: view.doctor })} />
  }

  // ───────────────────────── DETAIL / PREP ─────────────────────────
  if (view.mode === 'detail') {
    const d = view.doctor
    const style = d.style
    const s = style ? STYLES[style] : null
    const c = style ? COLOR[style] : 'var(--ink-dim)'
    return wrap(
      <>
        <button onClick={() => setView({ mode: 'list' })} style={{ ...ghostBtn, alignSelf:'flex-start', border:'none', padding:'4px 0', color:'var(--ink-dim)' }}>{t('prep.backToList')}</button>
        {panel(t('prep.prepFor', { name: d.name }),
          <>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
              {s && <div style={{ width:46, height:46, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, border:`2px solid ${c}`, color:c, boxShadow:`0 0 14px ${c}` }}>{s.icon}</div>}
              <div>
                <div style={{ fontSize:16, fontWeight:700 }}>{d.name}</div>
                <div style={{ fontSize:12.5, color:'var(--ink-dim)' }}>{[d.specialty, d.workplace].filter(Boolean).join(' · ')}</div>
                {s && <div style={{ fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.05em', color:c, marginTop:2 }}>{s.name} · {s.drive}</div>}
              </div>
            </div>
            {d.key_phrases && <div style={{ fontSize:13, color:'var(--ink-dim)', borderInlineStart:`2px solid ${c}`, paddingInlineStart:10, marginBottom:6, lineHeight:1.5 }}>“{d.key_phrases}”</div>}
            <button onClick={() => setView({ mode: 'form', doctor: d })} style={{ ...ghostBtn, fontSize:11, padding:'6px 12px' }}>{t('prep.edit')}</button>
          </>
        )}

        {style && panel(t('prep.cheatTitle'),
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div>
              <span style={labelStyle}>{t('prep.dos')}</span>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ fontSize:13.5, lineHeight:1.5, paddingInlineStart:18, position:'relative', marginBottom:4 }}>
                  <span style={{ position:'absolute', insetInlineStart:0, color:'var(--green)' }}>✓</span>{t(`prep.cheat.${style}.do${i}`)}
                </div>
              ))}
            </div>
            <div>
              <span style={labelStyle}>{t('prep.donts')}</span>
              {[1, 2].map(i => (
                <div key={i} style={{ fontSize:13.5, lineHeight:1.5, paddingInlineStart:18, position:'relative', marginBottom:4 }}>
                  <span style={{ position:'absolute', insetInlineStart:0, color:'var(--red)' }}>✗</span>{t(`prep.cheat.${style}.dont${i}`)}
                </div>
              ))}
            </div>
            <div style={{ border:`1px solid ${c}`, borderRadius:10, padding:'11px 13px', background:'rgba(0,0,0,.2)' }}>
              <span style={labelStyle}>{t('prep.opener')}</span>
              <div style={{ fontSize:14, lineHeight:1.55, color:'var(--ink)' }}>“{t(`prep.cheat.${style}.opener`)}”</div>
            </div>
            <button onClick={() => setView({ mode: 'warmup', doctor: d })} style={{ ...primaryBtn, marginTop:2 }}>{t('prep.start')}</button>
          </div>
        )}
        {!style && panel(t('prep.cheatTitle'),
          <button onClick={() => setView({ mode: 'form', doctor: d })} style={primaryBtn}>{t('prep.styleHelp')}</button>
        )}
      </>
    )
  }

  // ───────────────────────── FORM ─────────────────────────
  if (view.mode === 'form') {
    return <DoctorForm
      doctor={view.doctor}
      styles={STYLES}
      onCancel={() => setView(view.doctor ? { mode: 'detail', doctor: view.doctor } : { mode: 'list' })}
      onSave={async (input, id) => {
        const saved = await saveDoctor(input, id)
        if (saved) setView({ mode: 'detail', doctor: saved })
        else setView({ mode: 'list' })
      }}
      onDelete={view.doctor ? async () => { await removeDoctor(view.doctor!.id); setView({ mode: 'list' }) } : undefined}
    />
  }

  // ───────────────────────── LIST ─────────────────────────
  return wrap(
    <>
      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <button onClick={onExit} style={{ ...ghostBtn, border:'none', color:'var(--ink-dim)', padding:'4px 0' }}>{t('home')}</button>
      </div>
      {panel(t('prep.title'),
        <>
          <div style={{ color:'var(--ink-dim)', fontSize:12.5, lineHeight:1.5, marginBottom:14 }}>{t('prep.subtitle')}</div>
          <button onClick={() => setView({ mode: 'form' })} style={{ ...primaryBtn, width:'100%' }}>{t('prep.addDoctor')}</button>
        </>,
      )}
      {panel(t('prep.myDoctors'),
        loading ? <div style={{ color:'var(--ink-dim)', fontSize:13 }}>…</div>
        : doctors.length === 0 ? <div style={{ color:'var(--ink-dim)', fontSize:13, lineHeight:1.5 }}>{t('prep.empty')}</div>
        : <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {doctors.map(d => {
              const c = d.style ? COLOR[d.style] : 'var(--ink-dim)'
              const s = d.style ? STYLES[d.style] : null
              return (
                <button key={d.id} onClick={() => setView({ mode: 'detail', doctor: d })}
                  style={{ display:'flex', alignItems:'center', gap:12, textAlign:'start', cursor:'pointer', border:'1px solid var(--line)', borderRadius:12, padding:'11px 13px', background:'rgba(0,0,0,.18)', color:'var(--ink)' }}>
                  <span style={{ width:38, height:38, flexShrink:0, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, border:`1px solid ${c}`, color:c }}>{s ? s.icon : '?'}</span>
                  <span style={{ flex:1, minWidth:0 }}>
                    <b style={{ fontSize:14.5, display:'block' }}>{d.name}</b>
                    <span style={{ fontSize:12, color:'var(--ink-dim)' }}>{[s?.name, d.specialty].filter(Boolean).join(' · ') || '—'}</span>
                  </span>
                  <span style={{ color:'var(--ink-dim)' }}>›</span>
                </button>
              )
            })}
          </div>
      )}
    </>
  )
}

// ───────────────────────── Doctor form ─────────────────────────
function DoctorForm({ doctor, styles, onSave, onCancel, onDelete }: {
  doctor?: Doctor
  styles: Record<StyleKey, { name: string; icon: string }>
  onSave: (input: DoctorInput, id?: string) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const t = useT()
  const [name, setName] = useState(doctor?.name ?? '')
  const [specialty, setSpecialty] = useState(doctor?.specialty ?? '')
  const [workplace, setWorkplace] = useState(doctor?.workplace ?? '')
  const [keyPhrases, setKeyPhrases] = useState(doctor?.key_phrases ?? '')
  const [notes, setNotes] = useState(doctor?.notes ?? '')
  const [objections, setObjections] = useState<string[]>(doctor?.objections ?? [])
  const [styleMode, setStyleMode] = useState<'known' | 'help'>(doctor?.assertiveness ? 'help' : 'known')
  const [style, setStyle] = useState<StyleKey | null>(doctor?.style ?? null)
  const [assert, setAssert] = useState<Assertiveness | null>(doctor?.assertiveness ?? null)
  const [resp, setResp] = useState<Responsiveness | null>(doctor?.responsiveness ?? null)

  const derived = assert && resp ? deriveStyle(assert, resp) : null
  const effectiveStyle = styleMode === 'help' ? derived : style

  const chip = (active: boolean): React.CSSProperties => ({
    cursor:'pointer', fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.05em', borderRadius:20, padding:'8px 12px',
    border:`1px solid ${active ? 'var(--cyan)' : 'var(--line)'}`, color: active ? 'var(--cyan)' : 'var(--ink-dim)',
    background: active ? 'rgba(56,214,255,.1)' : 'transparent', touchAction:'manipulation',
  })

  function submit() {
    if (!name.trim()) return
    onSave({
      name: name.trim(), specialty: specialty || null, workplace: workplace || null,
      style: effectiveStyle, assertiveness: styleMode === 'help' ? assert : null,
      responsiveness: styleMode === 'help' ? resp : null,
      key_phrases: keyPhrases || null, objections, objection_notes: null, notes: notes || null,
    }, doctor?.id)
  }

  return (
    <div style={{ position:'relative', zIndex:1, maxWidth:560, margin:'0 auto', padding:14 }}>
      {panel(doctor ? t('prep.edit') : t('prep.addDoctor'),
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div><span style={labelStyle}>{t('prep.name')}</span><input value={name} onChange={e => setName(e.target.value)} style={inputStyle} /></div>
          <div style={{ display:'flex', gap:10 }}>
            <div style={{ flex:1 }}><span style={labelStyle}>{t('prep.specialty')}</span><input value={specialty} onChange={e => setSpecialty(e.target.value)} style={inputStyle} /></div>
          </div>
          <div><span style={labelStyle}>{t('prep.workplace')}</span><input value={workplace} onChange={e => setWorkplace(e.target.value)} style={inputStyle} /></div>

          {/* Style */}
          <div>
            <span style={labelStyle}>{t('prep.style')}</span>
            <div style={{ display:'flex', gap:8, marginBottom:10 }}>
              <button onClick={() => setStyleMode('known')} style={chip(styleMode === 'known')}>{t('prep.styleKnown')}</button>
              <button onClick={() => setStyleMode('help')} style={chip(styleMode === 'help')}>{t('prep.styleHelp')}</button>
            </div>
            {styleMode === 'known' ? (
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {STYLE_KEYS.map(k => (
                  <button key={k} onClick={() => setStyle(k)} style={chip(style === k)}>{styles[k].icon} {styles[k].name}</button>
                ))}
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <div>
                  <span style={{ ...labelStyle, color:'var(--ink-dim)' }}>{t('prep.axisAssert')}</span>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => setAssert('ask')} style={{ ...chip(assert === 'ask'), flex:1 }}>{t('prep.axisAssertAsk')}</button>
                    <button onClick={() => setAssert('tell')} style={{ ...chip(assert === 'tell'), flex:1 }}>{t('prep.axisAssertTell')}</button>
                  </div>
                </div>
                <div>
                  <span style={{ ...labelStyle, color:'var(--ink-dim)' }}>{t('prep.axisResp')}</span>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => setResp('controls')} style={{ ...chip(resp === 'controls'), flex:1 }}>{t('prep.axisRespControls')}</button>
                    <button onClick={() => setResp('emotes')} style={{ ...chip(resp === 'emotes'), flex:1 }}>{t('prep.axisRespEmotes')}</button>
                  </div>
                </div>
                {derived && (
                  <div style={{ fontFamily:'var(--mono)', fontSize:13, color:COLOR[derived], letterSpacing:'.04em' }}>
                    {t('prep.derived')} {styles[derived].icon} {styles[derived].name}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Key phrases */}
          <div><span style={labelStyle}>{t('prep.keyPhrases')}</span><input value={keyPhrases} onChange={e => setKeyPhrases(e.target.value)} placeholder={t('prep.keyPhrasesHint')} style={inputStyle} /></div>

          {/* Objections */}
          <div>
            <span style={labelStyle}>{t('prep.objections')}</span>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {OBJECTION_CATEGORIES.map(o => {
                const active = objections.includes(o)
                return <button key={o} onClick={() => setObjections(prev => active ? prev.filter(x => x !== o) : [...prev, o])} style={chip(active)}>{t(`obj.${o}`)}</button>
              })}
            </div>
          </div>

          {/* Notes */}
          <div><span style={labelStyle}>{t('prep.notes')}</span><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize:'vertical' as const }} /></div>

          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <button onClick={submit} disabled={!name.trim()} style={{ ...primaryBtn, flex:1, opacity: name.trim() ? 1 : .5 }}>{t('prep.save')}</button>
            <button onClick={onCancel} style={ghostBtn}>{t('prep.cancel')}</button>
          </div>
          {onDelete && <button onClick={onDelete} style={{ ...ghostBtn, border:'1px solid var(--red)', color:'var(--red)' }}>{t('prep.delete')}</button>}
        </div>
      )}
    </div>
  )
}

// ───────────────────────── Warm-up player ─────────────────────────
function WarmUp({ doctor, L1, L2, L3, onDone }: {
  doctor: Doctor
  L1: { id: number; style: string }[]
  L2: { id: number; style: string }[]
  L3: { id: number; style?: string; multi: boolean }[]
  onDone: () => void
}) {
  const t = useT()
  const style = doctor.style
  // Build a 3-drill rehearsal for this doctor's style: read -> objection -> drive.
  const [drills] = useState(() => {
    if (!style) return [] as { level: number; id: number }[]
    const out: { level: number; id: number }[] = []
    const l1 = shuffle(L1.filter(s => s.style === style))[0]
    if (l1) out.push({ level: 1, id: l1.id })
    const l2pool = L2.filter(s => s.style === style)
    const matched = doctor.objections.length ? l2pool.filter(s => doctor.objections.includes(L2_OBJECTION[s.id])) : []
    const l2 = shuffle(matched.length ? matched : l2pool)[0]
    if (l2) out.push({ level: 2, id: l2.id })
    const l3 = shuffle(L3.filter(s => !s.multi && s.style === style))[0]
    if (l3) out.push({ level: 3, id: l3.id })
    return out
  })
  const [idx, setIdx] = useState(0)

  if (drills.length === 0 || idx >= drills.length) {
    return (
      <div style={{ position:'relative', zIndex:1, maxWidth:560, margin:'0 auto', padding:14 }}>
        {panel(t('prep.prepFor', { name: doctor.name }),
          <>
            <div style={{ fontSize:15, lineHeight:1.6, marginBottom:16 }}>{t('prep.warmUpDone')}</div>
            <button onClick={onDone} style={primaryBtn}>{t('prep.backToList')}</button>
          </>
        )}
      </div>
    )
  }

  const drill = drills[idx]
  return (
    <DailyChallenge
      key={idx}
      title={t('prep.warmUp', { n: drills.length })}
      level={drill.level}
      scenarioId={drill.id}
      onComplete={() => setIdx(i => i + 1)}
    />
  )
}
