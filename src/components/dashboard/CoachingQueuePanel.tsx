'use client'
import type { CoachingQueueEntry, CoachingFlag } from '@/lib/coaching-queue'

// Dashboard-side labels (the dashboard is English; reps see localized names in-game).
const FLAG_LABEL: Record<CoachingFlag, string> = {
  low_accuracy: 'Low accuracy', inactive: '3+ days inactive',
  assignment_overdue: 'Assignment overdue', no_voice_practice: 'No voice practice',
}
const FLAG_COLOR: Record<CoachingFlag, string> = {
  low_accuracy: 'var(--red)', inactive: 'var(--amber)',
  assignment_overdue: 'var(--red)', no_voice_practice: 'var(--purple)',
}

interface Props {
  queue: CoachingQueueEntry[]
  onSuggest: (entry: CoachingQueueEntry) => void
}

export default function CoachingQueuePanel({ queue, onSuggest }: Props) {
  if (queue.length === 0) {
    return (
      <div style={{ color: 'var(--ink-dim)', fontSize: 12.5, lineHeight: 1.5 }}>
        No reps currently flagged — accuracy, activity, assignments, and voice practice all look healthy.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {queue.map(entry => (
        <div key={entry.rep_id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', background: 'rgba(0,0,0,.18)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{entry.name ?? 'Rep'}</span>
            <button onClick={() => onSuggest(entry)}
              style={{ cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'rgba(56,214,255,.06)', borderRadius: 8, padding: '6px 11px', touchAction: 'manipulation' }}>
              Suggest Level {entry.suggestedLevel}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {entry.flags.map(flag => (
              <span key={flag} style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.04em', textTransform: 'uppercase', color: FLAG_COLOR[flag], border: `1px solid ${FLAG_COLOR[flag]}`, borderRadius: 12, padding: '2px 8px' }}>
                {FLAG_LABEL[flag]}
              </span>
            ))}
          </div>
          {entry.recommendedFocus && (
            // Phase 6: a specific trigger-targeted suggestion from that
            // rep's top Mastermind Coach insight, alongside the generic
            // "Suggest Level" button above — informational only, not wired
            // to createAssignment (see mastermind-coach.ts's Experiment
            // decision note: the two objection taxonomies stay unmerged).
            <div style={{ fontSize: 11.5, color: 'var(--ink-dim)', marginTop: 8 }}>
              Specifically: {entry.recommendedFocus.label}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
