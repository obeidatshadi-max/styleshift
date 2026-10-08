'use client'
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n'
import type { MastermindInsight } from '@/lib/mastermind-coach'
import type { BehavioralGravityResult } from '@/lib/behavioral-gravity'
import type { UnusedResourceFinding } from '@/lib/unused-resource-detector'

// Rep-facing view of the same Behavioral Gravity / Unused Resource /
// Mastermind Coach data the manager dashboard already renders
// (BehavioralTrendsPanel.tsx) — the API (/api/voice-partner/behavioral-trends)
// was already rep-scoped and computing this for free; nothing rendered it to
// the rep it's about. Same self-fetching pattern as ChampionBanner/LeagueStrip.

interface TrendsResponse {
  gravity: BehavioralGravityResult
  unusedResources: UnusedResourceFinding[]
  mastermindInsights: MastermindInsight[]
}

export default function MyCoachingInsights() {
  const t = useT()
  const [data, setData] = useState<TrendsResponse | null>(null)
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/voice-partner/behavioral-trends')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive) setData(d) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // Nothing yet, or too little AI Doctor history for a pattern to exist —
  // stay silent rather than show an empty-state banner on the home screen.
  if (!data || data.gravity.overallSessionCount === 0 || data.mastermindInsights.length === 0) return null

  return (
    <div style={{ border: '1px solid var(--purple)', borderRadius: 14, padding: '14px 16px', background: 'rgba(176,108,255,.06)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--purple)', marginBottom: 10 }}>
        {t('mastermind.title')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.mastermindInsights.map((insight, i) => {
          const open = openIndex === i
          return (
            <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
              <button onClick={() => setOpenIndex(open ? null : i)}
                style={{ display: 'flex', width: '100%', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, cursor: 'pointer', background: 'transparent', border: 'none', padding: 0, textAlign: 'start', color: 'var(--ink)' }}>
                <span style={{ fontSize: 13, lineHeight: 1.5 }}>{insight.observation}</span>
                <span style={{ color: 'var(--purple)', flex: '0 0 auto' }}>{open ? '−' : '+'}</span>
              </button>
              {open && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-dim)' }}>
                  <div><strong style={{ color: 'var(--ink)' }}>{t('mastermind.pattern')}:</strong> {insight.pattern}</div>
                  <div><strong style={{ color: 'var(--ink)' }}>{t('mastermind.impact')}:</strong> {insight.impact}</div>
                  <div><strong style={{ color: 'var(--ink)' }}>{t('mastermind.alternative')}:</strong> {insight.alternative}</div>
                  <div><strong style={{ color: 'var(--ink)' }}>{t('mastermind.experiment')}:</strong> {insight.experiment.label}</div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
