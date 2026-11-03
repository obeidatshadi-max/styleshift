import type { SharedItem } from '@/lib/manager-share'

const label: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)' }

/**
 * What reps chose to share with their manager. Each item shows only the coaching report, never a
 * rep's own written account or a transcript. Reps can stop sharing at any time, which removes the
 * item here on the next load.
 */
export default function SharedByRepsPanel({ items, repNames }: { items: SharedItem[]; repNames: Record<string, string | null> }) {
  if (items.length === 0) {
    return <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-dim)', margin: 0 }}>
      Nothing shared yet. Reps choose, report by report, to share a text simulation or coach debrief with you. Until they do, it stays private.
    </p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map(item => (
        <article key={`${item.kind}:${item.id}`} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, background: 'var(--surface-subtle)', display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14 }}>{repNames[item.repId]?.trim() || 'Unnamed rep'} · {item.doctorName}</strong>
            <span style={label}>{item.kind === 'debrief' ? 'Coach debrief' : 'Text simulation'} · {new Date(item.practisedAt).toLocaleDateString('en')}</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{item.summary}</p>
          {item.priority && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}><strong>Focus:</strong> <span style={{ color: 'var(--ink-dim)' }}>{item.priority}</span></p>}
          {item.nextStep && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}><strong>{item.kind === 'debrief' ? 'Next step:' : 'Success looks like:'}</strong> <span style={{ color: 'var(--ink-dim)' }}>{item.nextStep}</span></p>}
        </article>
      ))}
    </div>
  )
}
