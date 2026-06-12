'use client'
import { useState } from 'react'
import type { TeamPulse } from '@/lib/team-pulse'

// ---------------------------------------------------------------------------
// WhatsApp message templates. {placeholders} are filled from live team data.
// Tune the wording here — this is the exact text the manager sends to the
// team group, so it should sound like a coach, not a system.
// ---------------------------------------------------------------------------
const MSG = {
  en: {
    nudgeHeader: '🔥 Streak alert!',
    nudgeLine: '{name} — {n}-day streak on the line',
    nudgeFooter: "Today's Daily Challenge keeps it alive. 3 questions, 2 minutes:\n{url}",
    digestHeader: '📊 StyleShift — this week',
    digestSessions: '• {n} training sessions completed',
    digestTop: '• 🏆 Top of the board: {name}',
    digestWeakest: '• Team focus area: {level} ({avg}% avg)',
    digestAssignment: '• Coach assignment: {done}/{total} done',
    digestFooter: 'Keep the streaks burning 🔥\n{url}',
  },
  ar: {
    nudgeHeader: '🔥 تنبيه السلسلة!',
    nudgeLine: '{name} — سلسلة {n} يوم على المحك',
    nudgeFooter: 'تحدي اليوم يحافظ عليها. ٣ أسئلة، دقيقتان:\n{url}',
    digestHeader: '📊 ستايل شيفت — هذا الأسبوع',
    digestSessions: '• {n} جلسة تدريب مكتملة',
    digestTop: '• 🏆 متصدر الفريق: {name}',
    digestWeakest: '• مجال تركيز الفريق: {level} (متوسط {avg}%)',
    digestAssignment: '• مهمة المدرب: {done}/{total} أنجزوها',
    digestFooter: 'حافظوا على السلاسل مشتعلة 🔥\n{url}',
  },
}

function fill(template: string, params: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''))
}

interface Props {
  pulse: TeamPulse
  siteUrl: string
}

export default function TeamPulsePanel({ pulse, siteUrl }: Props) {
  const [lang, setLang] = useState<'en' | 'ar'>('en')
  const [copied, setCopied] = useState<'nudge' | 'digest' | null>(null)
  const m = MSG[lang]

  const nudgeText = [
    m.nudgeHeader,
    ...pulse.atRisk.map(r => fill(m.nudgeLine, { name: r.name, n: r.streak })),
    fill(m.nudgeFooter, { url: siteUrl }),
  ].join('\n')

  const w = pulse.weekly
  const digestText = [
    m.digestHeader,
    fill(m.digestSessions, { n: w.sessions }),
    w.topRep ? fill(m.digestTop, { name: w.topRep }) : null,
    w.weakestLevel ? fill(m.digestWeakest, { level: w.weakestLevel, avg: w.weakestAvg }) : null,
    w.assignmentTotal > 0 ? fill(m.digestAssignment, { done: w.assignmentDone, total: w.assignmentTotal }) : null,
    fill(m.digestFooter, { url: siteUrl }),
  ].filter(Boolean).join('\n')

  async function share(kind: 'nudge' | 'digest', text: string) {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ text }); return } catch { /* cancelled — fall through */ }
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      setTimeout(() => setCopied(null), 2000)
    } catch { /* clipboard unavailable — nothing else to try */ }
  }

  const listRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'rgba(0,0,0,.18)',
  }
  const shareBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em',
    textTransform: 'uppercase', border: '1px solid var(--green)', borderRadius: 10, padding: '11px 12px',
    color: active ? '#06250f' : 'var(--green)', background: active ? 'var(--green)' : 'rgba(62,224,143,.08)',
    touchAction: 'manipulation',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Streaks at risk */}
      <div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 8 }}>
          🔥 Streaks at risk today
        </div>
        {pulse.atRisk.length === 0 ? (
          <div style={{ color: 'var(--ink-dim)', fontSize: 12 }}>No streaks at risk — everyone with a streak already played today.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pulse.atRisk.map(r => (
              <div key={r.name} style={listRow}>
                <span style={{ fontSize: 13 }}>{r.name}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--amber)' }}>🔥 {r.streak}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inactive reps */}
      <div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 8 }}>
          💤 Inactive 3+ days
        </div>
        {pulse.inactive.length === 0 ? (
          <div style={{ color: 'var(--ink-dim)', fontSize: 12 }}>Everyone has been active in the last 3 days.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pulse.inactive.map(r => (
              <div key={r.name} style={listRow}>
                <span style={{ fontSize: 13 }}>{r.name}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--red)' }}>
                  {r.days === null ? 'never played' : `${r.days} days`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Share to WhatsApp */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-dim)' }}>
            Share to team group
          </div>
          <button onClick={() => setLang(l => (l === 'en' ? 'ar' : 'en'))}
            style={{ cursor: 'pointer', background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '4px 10px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--cyan)' }}>
            {lang === 'en' ? 'عربي' : 'EN'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => share('nudge', nudgeText)} disabled={pulse.atRisk.length === 0}
            style={{ ...shareBtn(copied === 'nudge'), opacity: pulse.atRisk.length === 0 ? .4 : 1, cursor: pulse.atRisk.length === 0 ? 'not-allowed' : 'pointer' }}>
            {copied === 'nudge' ? '✓ Copied' : '🔥 Streak nudge'}
          </button>
          <button onClick={() => share('digest', digestText)} style={shareBtn(copied === 'digest')}>
            {copied === 'digest' ? '✓ Copied' : '📊 Weekly digest'}
          </button>
        </div>
        <div style={{ color: 'var(--ink-dim)', fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
          Opens your share sheet on mobile (pick WhatsApp); copies the text on desktop.
        </div>
      </div>
    </div>
  )
}
