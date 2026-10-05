'use client'
import { useState } from 'react'
import type { WeeklyDigest } from '@/lib/weekly-digest'

const stat: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 12, padding: 12, background: 'rgba(0,0,0,.2)', textAlign: 'center' }
const statLabel: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)' }

/** The team's week in one glance, with a plain-text summary a manager can paste into WhatsApp or email. */
export default function WeeklyDigestPanel({ digest }: { digest: WeeklyDigest }) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle')
  const delta = digest.practiceThisWeek - digest.practiceLastWeek

  async function copy() {
    try { await navigator.clipboard.writeText(digest.summary); setCopied('done') } catch { setCopied('failed') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        <div style={stat}>
          <div style={statLabel}>Game practice sessions</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 700, margin: '6px 0 2px', color: 'var(--cyan)' }}>{digest.practiceThisWeek}</div>
          <div style={{ fontSize: 12, color: delta < 0 ? 'var(--red)' : 'var(--ink-dim)' }}>{delta === 0 ? 'same as last week' : `${delta > 0 ? '+' : ''}${delta} vs last week`}</div>
        </div>
        <div style={stat}>
          <div style={statLabel}>Active reps</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 700, margin: '6px 0 2px', color: digest.activeReps === digest.totalReps && digest.totalReps > 0 ? 'var(--green)' : 'var(--amber)' }}>{digest.activeReps}/{digest.totalReps}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-dim)' }}>game or voice practice in the last 7 days</div>
        </div>
      </div>
      {digest.quietReps.length > 0 && <div style={{ fontSize: 13, lineHeight: 1.6 }}><strong>Not practised this week:</strong> <span style={{ color: 'var(--ink-dim)' }}>{digest.quietReps.join(', ')}</span></div>}
      {digest.topFocus && <div style={{ fontSize: 13, lineHeight: 1.6 }}><strong>Most common coaching focus:</strong> <span style={{ color: 'var(--ink-dim)' }}>{digest.topFocus.label} ({digest.topFocus.count} reps)</span></div>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => void copy()} style={{ cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'transparent', borderRadius: 10, padding: '9px 14px' }}>Copy summary</button>
        {copied === 'done' && <span role="status" style={{ fontSize: 12.5, color: 'var(--green)' }}>Copied. Paste it into WhatsApp or email.</span>}
        {copied === 'failed' && <span role="alert" style={{ fontSize: 12.5, color: 'var(--red)' }}>Could not copy. Select the text yourself.</span>}
      </div>
      {copied === 'failed' && <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', color: 'var(--ink-dim)' }}>{digest.summary}</pre>}
      <div style={{ fontSize: 11.5, color: 'var(--ink-dim)', lineHeight: 1.5 }}>Session totals count game practice only. Active reps includes game or voice practice. Text simulations and coach debriefs are private to each rep and are not included.</div>
    </div>
  )
}
