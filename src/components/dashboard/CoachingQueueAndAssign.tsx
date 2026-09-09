'use client'
import { useState } from 'react'
import CoachingQueuePanel from './CoachingQueuePanel'
import AssignPanel, { type AssignPrefill } from './AssignPanel'
import type { CoachingQueueEntry } from '@/lib/coaching-queue'
import type { ManagerAssignmentView } from '@/lib/assignments'

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,.45)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.3em', textTransform: 'uppercase', color: 'var(--cyan)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--cyan)', boxShadow: 'var(--glow-cyan)', display: 'inline-block' }} />
        {title}
      </div>
      {children}
    </section>
  )
}

interface Props {
  queue: CoachingQueueEntry[]
  current: ManagerAssignmentView | null
  reps: { id: string; name: string | null }[]
}

/**
 * Owns the shared "suggest → prefill the assignment form" handoff between
 * the coaching queue and AssignPanel — two separately-titled panels that
 * need to talk to each other, so both live under one client component.
 */
export default function CoachingQueueAndAssign({ queue, current, reps }: Props) {
  const [prefill, setPrefill] = useState<AssignPrefill | null>(null)

  return (
    <>
      <Panel title="Coaching Queue">
        <CoachingQueuePanel
          queue={queue}
          onSuggest={entry => setPrefill({ target_type: 'level', target_key: String(entry.suggestedLevel), rep_id: entry.rep_id })}
        />
      </Panel>
      <Panel title="Coach Assignment">
        <AssignPanel current={current} reps={reps} prefill={prefill} />
      </Panel>
    </>
  )
}
