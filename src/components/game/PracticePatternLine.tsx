'use client'
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n'
import { createClient } from '@/lib/supabase-browser'
import { findPracticePattern, type PatternSession, type PracticePattern } from '@/lib/practice-pattern'

/** One line on Home about what keeps recurring in the rep's recent practice. Silent when there is no pattern. */
export default function PracticePatternLine() {
  const t = useT()
  const [pattern, setPattern] = useState<PracticePattern | null>(null)

  useEffect(() => {
    let live = true
    createClient().from('agent_sessions')
      .select('competencies:record->session->scores->competencies')
      .order('created_at', { ascending: false }).limit(8)
      .then(({ data }) => { if (live) setPattern(findPracticePattern((data ?? []) as unknown as PatternSession[])) })
    return () => { live = false }
  }, [])

  if (!pattern) return null
  const line = pattern.kind === 'repeated_behavior'
    ? t('pattern.repeated', { label: t(`sim.beh.${pattern.behavior}`), count: pattern.count, of: pattern.of })
    : t('pattern.weak', { label: t(`sim.comp.${pattern.competency}`), avg: pattern.average, of: pattern.of })
  return (
    <div role="note" style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px', fontSize: 13, lineHeight: 1.55, color: 'var(--ink-dim)' }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--purple)', marginInlineEnd: 8 }}>{t('pattern.label')}</span>
      {line}
    </div>
  )
}
