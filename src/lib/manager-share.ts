import { createAdminClient } from '@/lib/supabase-admin'

/**
 * A rep can share one text simulation or one coach debrief with their manager. Nothing is shared by
 * default. What a manager sees is deliberately narrow:
 *  - debrief: the coaching report only (summary, priority, next action), never the rep's own account
 *  - simulation: the report summary and coaching priority, never the transcript
 */
export const SHARE_KINDS = ['debrief', 'simulation'] as const
export type ShareKind = typeof SHARE_KINDS[number]

export interface ShareRequest { kind: ShareKind; id: string; shared: boolean }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function parseShareRequest(value: unknown): ShareRequest | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (!(SHARE_KINDS as readonly unknown[]).includes(v.kind)) return null
  if (typeof v.id !== 'string' || !UUID.test(v.id)) return null
  if (typeof v.shared !== 'boolean') return null
  return { kind: v.kind as ShareKind, id: v.id, shared: v.shared }
}

export const SHARE_TABLE: Record<ShareKind, 'coach_debriefs' | 'agent_sessions'> = {
  debrief: 'coach_debriefs',
  simulation: 'agent_sessions',
}

/** What the manager panel shows for one shared item. */
export interface SharedItem {
  id: string
  kind: ShareKind
  repId: string
  doctorName: string
  /** When the practice happened (not when it was shared). */
  practisedAt: string
  sharedAt: string
  summary: string
  priority: string | null
  nextStep: string | null
}

const clip = (s: unknown, max: number): string | null =>
  typeof s === 'string' && s.trim() ? (s.trim().length > max ? `${s.trim().slice(0, max - 1)}…` : s.trim()) : null

/** Reduce a stored coach debrief to the fields a manager may see. */
export function debriefForManager(row: { id: string; rep_id: string; doctor_name: string | null; created_at: string; shared_with_manager_at: string; result: unknown }): SharedItem | null {
  const report = (row.result as { report?: Record<string, unknown> } | null)?.report
  const summary = clip(report?.summary, 600)
  if (!summary) return null
  return {
    id: row.id, kind: 'debrief', repId: row.rep_id, doctorName: row.doctor_name?.trim() || 'Doctor',
    practisedAt: row.created_at, sharedAt: row.shared_with_manager_at,
    summary, priority: clip(report?.priority, 400), nextStep: clip(report?.nextAction, 400),
  }
}

/** Reduce a stored simulation report (ConversationReport JSON) to the fields a manager may see. */
export function simulationForManager(
  row: { id: string; rep_id: string; created_at: string; shared_with_manager_at: string },
  doctorName: string | null,
  report: unknown,
): SharedItem | null {
  const r = report as { visitSummary?: { summary?: unknown }; coachingPriority?: { behavior?: unknown; successLooksLike?: unknown } } | null
  const summary = clip(r?.visitSummary?.summary, 600)
  if (!summary) return null
  return {
    id: row.id, kind: 'simulation', repId: row.rep_id, doctorName: doctorName?.trim() || 'AI doctor',
    practisedAt: row.created_at, sharedAt: row.shared_with_manager_at,
    summary, priority: clip(r?.coachingPriority?.behavior, 400), nextStep: clip(r?.coachingPriority?.successLooksLike, 400),
  }
}

/**
 * Items the reps of one company have chosen to share, newest practice first. `repIds` MUST come from the
 * manager's own company (the caller already has it from team stats); nothing else limits the read.
 */
export async function getSharedItems(repIds: string[], limit = 20): Promise<SharedItem[]> {
  if (repIds.length === 0) return []
  const admin = createAdminClient()
  const [debriefs, sims] = await Promise.all([
    admin.from('coach_debriefs').select('id, rep_id, doctor_name, created_at, shared_with_manager_at, result')
      .in('rep_id', repIds).not('shared_with_manager_at', 'is', null).order('created_at', { ascending: false }).limit(limit),
    admin.from('agent_sessions').select('id, rep_id, doctor_id, created_at, shared_with_manager_at')
      .in('rep_id', repIds).not('shared_with_manager_at', 'is', null).order('created_at', { ascending: false }).limit(limit),
  ])
  const items: SharedItem[] = []
  for (const d of (debriefs.data ?? []) as Parameters<typeof debriefForManager>[0][]) {
    const item = debriefForManager(d); if (item) items.push(item)
  }
  const simRows = (sims.data ?? []) as { id: string; rep_id: string; doctor_id: string | null; created_at: string; shared_with_manager_at: string }[]
  if (simRows.length) {
    const ids = simRows.map(s => s.id)
    const doctorIds = [...new Set(simRows.map(s => s.doctor_id).filter((x): x is string => !!x))]
    const [reports, doctors] = await Promise.all([
      admin.from('conversation_reports').select('session_id, report, created_at').eq('session_type', 'ai_doctor_text')
        .eq('status', 'complete').in('session_id', ids).order('created_at', { ascending: false }),
      doctorIds.length ? admin.from('doctors').select('id, name').in('id', doctorIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ])
    const latest = new Map<string, unknown>()
    for (const r of (reports.data ?? []) as { session_id: string; report: unknown }[]) if (!latest.has(r.session_id)) latest.set(r.session_id, r.report)
    const names = new Map(((doctors.data ?? []) as { id: string; name: string }[]).map(d => [d.id, d.name]))
    for (const s of simRows) {
      const item = simulationForManager(s, s.doctor_id ? names.get(s.doctor_id) ?? null : null, latest.get(s.id))
      if (item) items.push(item)
    }
  }
  return items.sort((a, b) => Date.parse(b.practisedAt) - Date.parse(a.practisedAt)).slice(0, limit)
}
