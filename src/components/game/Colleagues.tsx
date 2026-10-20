'use client'
import { useState } from 'react'
import { useT, useLang } from '@/lib/i18n'
import { useColleagues } from '@/hooks/useColleagues'
import { useColleagueSessions } from '@/hooks/useColleagueSessions'
import type { Colleague } from '@/types/game'
import RoleplayRecorder from './RoleplayRecorder'
import RoleplayHistorySummaryCard, { RoleplaySessionCard } from './RoleplayHistorySummaryCard'

interface Props { onExit: () => void }

type View =
  | { mode: 'list' }
  | { mode: 'form' }
  | { mode: 'detail'; colleague: Colleague }
  | { mode: 'roleplay'; colleague: Colleague }

const inputStyle: React.CSSProperties = {
  background:'var(--surface-subtle)', border:'1px solid var(--line)', borderRadius:10,
  padding:'11px 13px', color:'var(--ink)', fontFamily:'var(--sans)', fontSize:16, outline:'none', width:'100%',
}
const labelStyle: React.CSSProperties = { fontFamily:'var(--mono)', fontSize:14, letterSpacing: 'normal', textTransform:'none', color:'var(--ink-dim)', marginBottom:6, display:'block' }
const primaryBtn: React.CSSProperties = { cursor:'pointer', fontFamily:'var(--mono)', fontSize:14, letterSpacing: 'normal', textTransform:'none', border:'1px solid var(--cyan)', color:'var(--on-accent)', background:'var(--cyan)', borderRadius:10, padding:'12px 18px', boxShadow:'var(--glow-cyan)', touchAction:'manipulation' }
const ghostBtn: React.CSSProperties = { cursor:'pointer', fontFamily:'var(--mono)', fontSize:14, letterSpacing: 'normal', textTransform:'none', border:'1px solid var(--cyan)', color:'var(--cyan)', background:'transparent', borderRadius:10, padding:'12px 18px', touchAction:'manipulation' }

function panel(title: string, children: React.ReactNode) {
  return (
    <section style={{ background:'var(--panel)', border:'1px solid var(--line)', borderRadius:16, padding:16, boxShadow:'var(--shadow)' }}>
      <div style={{ fontFamily:'var(--mono)', fontSize:14, letterSpacing: 'normal', textTransform:'none', color:'var(--cyan)', display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
        <span style={{ width:9, height:9, borderRadius:'50%', background:'var(--cyan)', boxShadow:'var(--glow-cyan)', display:'inline-block' }} />
        {title}
      </div>
      {children}
    </section>
  )
}

export default function Colleagues({ onExit }: Props) {
  const t = useT()
  const { colleagues, loading, saveColleague, removeColleague } = useColleagues()
  const [view, setView] = useState<View>({ mode: 'list' })
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const wrap = (children: React.ReactNode) => (
    <div style={{ position:'relative', zIndex:1, maxWidth:560, margin:'0 auto', padding:14, display:'flex', flexDirection:'column', gap:14 }}>{children}</div>
  )

  if (view.mode === 'roleplay') {
    return <RoleplayRecorder doctorId={null} colleagueId={view.colleague.id} onDone={() => setView({ mode: 'detail', colleague: view.colleague })} />
  }

  if (view.mode === 'form') {
    return <ColleagueForm
      onCancel={() => setView({ mode: 'list' })}
      onSave={async (name) => {
        const saved = await saveColleague({ name })
        if (saved) setView({ mode: 'detail', colleague: saved })
        else setView({ mode: 'list' })
      }}
    />
  }

  if (view.mode === 'detail') {
    const c = view.colleague
    return wrap(
      <>
        <div style={{ display:'flex', justifyContent:'space-between' }}>
          <button onClick={() => { setConfirmingDelete(false); setView({ mode: 'list' }) }} style={{ ...ghostBtn, alignSelf:'flex-start', border:'none', padding:'4px 0', color:'var(--ink-dim)' }}>{t('perform.backToList')}</button>
          <button onClick={onExit} style={{ ...ghostBtn, border:'none', color:'var(--ink-dim)', padding:'4px 0' }}>{t('home')}</button>
        </div>
        {panel(c.name,
          <>
            <button onClick={() => { setConfirmingDelete(false); setView({ mode: 'roleplay', colleague: c }) }}
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, width:'100%', cursor:'pointer', fontFamily:'var(--mono)', fontSize:14, letterSpacing: 'normal', textTransform:'none', border:'1px solid var(--green)', color:'var(--green)', background:'rgba(62,224,143,.08)', borderRadius:10, padding:'12px 16px', touchAction:'manipulation' }}>
              🎙 {t('roleplay.entryButton')}
            </button>
            {confirmingDelete ? (
              <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:10, width:'100%' }}>
                <span style={{ flex:1, fontSize:14, color:'var(--red)' }}>{t('prep.delete')}?</span>
                <button onClick={() => setConfirmingDelete(false)} style={ghostBtn}>{t('prep.cancel')}</button>
                <button onClick={async () => { await removeColleague(c.id); setConfirmingDelete(false); setView({ mode: 'list' }) }}
                  style={{ ...ghostBtn, border:'1px solid var(--red)', color:'var(--red)' }}>
                  {t('prep.delete')}
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmingDelete(true)}
                style={{ ...ghostBtn, border:'1px solid var(--red)', color:'var(--red)', marginTop:10, width:'100%' }}>
                {t('prep.delete')}
              </button>
            )}
          </>
        )}
        {panel(t('perform.historyTitle'), <ColleagueHistory colleagueId={c.id} name={c.name} />)}
      </>
    )
  }

  // list
  return wrap(
    <>
      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <button onClick={onExit} style={{ ...ghostBtn, border:'none', color:'var(--ink-dim)', padding:'4px 0' }}>{t('home')}</button>
      </div>
      {panel(t('perform.title'),
        <>
          <div style={{ color:'var(--ink-dim)', fontSize:14, lineHeight:1.5, marginBottom:14 }}>{t('perform.subtitle')}</div>
          <button onClick={() => setView({ mode: 'form' })} style={{ ...primaryBtn, width:'100%' }}>{t('perform.addColleague')}</button>
        </>
      )}
      {panel(t('perform.myColleagues'),
        loading ? <div style={{ color:'var(--ink-dim)', fontSize:16 }}>…</div>
        : colleagues.length === 0 ? <div style={{ color:'var(--ink-dim)', fontSize:16, lineHeight:1.5 }}>{t('perform.empty')}</div>
        : <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {colleagues.map(c => (
              <button key={c.id} onClick={() => { setConfirmingDelete(false); setView({ mode: 'detail', colleague: c }) }}
                style={{ display:'flex', alignItems:'center', gap:12, textAlign:'start', cursor:'pointer', border:'1px solid var(--line)', borderRadius:12, padding:'11px 13px', background:'var(--surface-subtle)', color:'var(--ink)' }}>
                <span style={{ flex:1, fontSize:16 }}>{c.name}</span>
                <span style={{ color:'var(--ink-dim)' }}>›</span>
              </button>
            ))}
          </div>
      )}
    </>
  )
}

function ColleagueForm({ onSave, onCancel }: { onSave: (name: string) => void; onCancel: () => void }) {
  const t = useT()
  const [name, setName] = useState('')
  return (
    <div style={{ position:'relative', zIndex:1, maxWidth:560, margin:'0 auto', padding:14 }}>
      {panel(t('perform.addColleague'),
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div><span style={labelStyle}>{t('prep.name')}</span><input value={name} onChange={e => setName(e.target.value)} aria-label={t('prep.name')} style={inputStyle} /></div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <button onClick={() => name.trim() && onSave(name.trim())} disabled={!name.trim()} style={{ ...primaryBtn, flex:1, opacity: name.trim() ? 1 : .5 }}>{t('perform.save')}</button>
            <button onClick={onCancel} style={ghostBtn}>{t('prep.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  )
}

const historyRow: React.CSSProperties = { fontSize:16, lineHeight:1.5, marginBottom:3 }
const historyLabel: React.CSSProperties = { color:'var(--ink-dim)', fontWeight:600 }

function ColleagueHistory({ colleagueId, name }: { colleagueId: string; name: string }) {
  const t = useT()
  const { lang } = useLang()
  const { sessions, loading } = useColleagueSessions(colleagueId)

  if (loading) return <div style={{ color:'var(--ink-dim)', fontSize:16 }}>…</div>
  if (sessions.length === 0) return <div style={{ color:'var(--ink-dim)', fontSize:16, lineHeight:1.5 }}>{t('perform.historyEmpty')}</div>

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <RoleplayHistorySummaryCard sessions={sessions} name={name} />
      {sessions.map(s => (
        <RoleplaySessionCard key={s.id} session={s} dateText={new Date(s.created_at).toLocaleString(lang === 'ar' ? 'ar' : 'en', { dateStyle: 'short', timeStyle: 'short' })} />
      ))}
    </div>
  )
}
