import { createAdminClient } from '@/lib/supabase-admin'
import { getBehavioralTrendsForReps } from '@/lib/behavioral-trends-dashboard'
import type { DrillAttempt } from '@/schemas/drill'
import type { RoleplaySessionSummary } from '@/types/game'
import {
  BASELINE_WINDOW, MIN_BASELINE, buildImprovementReport, fromDrillAttempt, fromRoleplaySummary, fromScorecard,
  mean, normalizeRecords, round1, series,
  type FieldCheck, type Followup, type ImprovementReport, type PracticeRecord,
} from './index'
import {
  canAcknowledge, canAssign, canClose, canWriteFieldCheck,
  type Actor, type FieldCheckRequest, type FollowupRequest,
} from './permissions'

// Database side of the Behavioral Improvement Engine. Uses the service-role client, so EVERY
// query is scoped here by rep id and company id, and every write is gated by permissions.ts.

type Admin = ReturnType<typeof createAdminClient>

const ROLEPLAY_COLUMNS = 'id, rep_id, created_at, duration_sec, talk_ratio, question_ratio, open_question_ratio, paraphrase_score, active_listening_score, rep_style, rep_confidence, adaptation_score'

export async function loadActor(admin: Admin, userId: string): Promise<Actor | null> {
  const { data } = await admin.from('profiles').select('id, role, company_id').eq('id', userId).maybeSingle()
  return data ? { id: data.id as string, role: (data.role as string | null) ?? null, companyId: (data.company_id as string | null) ?? null } : null
}

/** Every practice record for these reps, grouped by rep. A rep with no practice maps to []. */
export async function loadPracticeRecords(admin: Admin, repIds: string[]): Promise<Map<string, PracticeRecord[]>> {
  const out = new Map<string, PracticeRecord[]>(repIds.map(id => [id, []]))
  if (repIds.length === 0) return out
  const [sessions, scorecards, roleplay, drills] = await Promise.all([
    admin.from('voice_partner_sessions').select('id, rep_id, objection_type').in('rep_id', repIds),
    admin.from('session_scorecards').select('rep_id, session_id, created_at, signals, adaptation_score').in('rep_id', repIds),
    admin.from('roleplay_sessions').select(ROLEPLAY_COLUMNS).in('rep_id', repIds),
    admin.from('drill_attempts').select('drill_id, drill_version, rep_id, attempt_no, created_at, observed_behaviors, score, passed, lang').in('rep_id', repIds),
  ])

  const objection = new Map(((sessions.data ?? []) as { id: string; objection_type: string | null }[]).map(s => [s.id, s.objection_type]))
  for (const row of (scorecards.data ?? []) as { rep_id: string; session_id: string; created_at: string; signals: unknown; adaptation_score: number | null }[]) {
    const rec = fromScorecard(row, objection.get(row.session_id) ?? null)
    if (rec) out.get(row.rep_id)?.push(rec)
  }
  for (const row of (roleplay.data ?? []) as (RoleplaySessionSummary & { rep_id: string })[]) {
    out.get(row.rep_id)?.push(fromRoleplaySummary(row))
  }
  for (const r of (drills.data ?? []) as { drill_id: string; drill_version: number; rep_id: string; attempt_no: number; created_at: string; observed_behaviors: string[]; score: number | null; passed: boolean; lang: 'en' | 'ar' }[]) {
    const a: DrillAttempt = {
      drillId: r.drill_id, drillVersion: r.drill_version, repId: r.rep_id, attemptNo: r.attempt_no, at: r.created_at,
      observedBehaviors: r.observed_behaviors, score: r.score, passed: r.passed, lang: r.lang,
    }
    out.get(r.rep_id)?.push(fromDrillAttempt(a))
  }
  for (const [id, list] of out) out.set(id, normalizeRecords(list))
  return out
}

interface FollowupRow {
  id: string; company_id: string; rep_id: string; created_by: string
  metric_key: string | null; source: string | null; drill_kind: string; objection_type: string | null; clear_step: string | null
  baseline_value: number | null; baseline_n: number; note: string | null; due_date: string | null
  acknowledged_at: string | null; closed_at: string | null; created_at: string
}

export interface FollowupView extends Followup {
  companyId: string
  drillKind: string
  objectionType: string | null
  clearStep: string | null
  baselineN: number
  note: string | null
  createdBy: string
}

const toFollowup = (r: FollowupRow): FollowupView => ({
  id: r.id, repId: r.rep_id, companyId: r.company_id, createdBy: r.created_by,
  metricKey: r.metric_key as Followup['metricKey'], source: r.source as Followup['source'],
  drillKind: r.drill_kind, objectionType: r.objection_type, clearStep: r.clear_step,
  baselineValue: r.baseline_value === null ? null : Number(r.baseline_value), baselineN: r.baseline_n,
  note: r.note, dueDate: r.due_date, acknowledgedAt: r.acknowledged_at, closedAt: r.closed_at, createdAt: r.created_at,
})

interface CheckRow { id: string; followup_id: string; rep_id: string; kind: 'self_reported' | 'verified'; recorded_by: string; observed: FieldCheck['observed']; created_at: string }
const toCheck = (r: CheckRow): FieldCheck => ({
  id: r.id, followupId: r.followup_id, repId: r.rep_id, kind: r.kind, recordedBy: r.recorded_by, observed: r.observed, at: r.created_at,
})

async function loadFollowups(admin: Admin, filter: { repId?: string; companyId?: string }) {
  let fq = admin.from('coaching_followups').select('*').order('created_at', { ascending: false }).limit(200)
  if (filter.repId) fq = fq.eq('rep_id', filter.repId)
  if (filter.companyId) fq = fq.eq('company_id', filter.companyId)
  const { data } = await fq
  const followups = ((data ?? []) as FollowupRow[]).map(toFollowup)
  if (followups.length === 0) return { followups, checks: [] as FieldCheck[] }
  const { data: checks } = await admin.from('coaching_field_checks')
    .select('id, followup_id, rep_id, kind, recorded_by, observed, created_at').in('followup_id', followups.map(f => f.id))
  return { followups, checks: ((checks ?? []) as CheckRow[]).map(toCheck) }
}

/** The rep's own report: practice, follow-ups, and the field evidence they and their manager recorded. */
export async function getRepReport(userId: string, now = new Date()): Promise<{ report: ImprovementReport; followups: FollowupView[] }> {
  const admin = createAdminClient()
  const [records, trends, fu] = await Promise.all([
    loadPracticeRecords(admin, [userId]), getBehavioralTrendsForReps([userId]), loadFollowups(admin, { repId: userId }),
  ])
  const report = buildImprovementReport({
    records: records.get(userId) ?? [], insights: trends.get(userId)?.mastermindInsights ?? [],
    followups: fu.followups, checks: fu.checks, now,
  })
  return { report, followups: fu.followups }
}

export interface BoardRow { repId: string; name: string | null; report: ImprovementReport; followups: FollowupView[] }

/** Manager view: only reps of the manager's own company. Returns null for a non-manager. */
export async function getManagerBoard(managerId: string, now = new Date()): Promise<BoardRow[] | null> {
  const admin = createAdminClient()
  const manager = await loadActor(admin, managerId)
  if (!manager || manager.role !== 'manager' || !manager.companyId) return null
  const { data: reps } = await admin.from('profiles').select('id, display_name').eq('company_id', manager.companyId).eq('role', 'rep')
  const repList = (reps ?? []) as { id: string; display_name: string | null }[]
  const repIds = repList.map(r => r.id)
  const [records, trends, fu] = await Promise.all([
    loadPracticeRecords(admin, repIds), getBehavioralTrendsForReps(repIds), loadFollowups(admin, { companyId: manager.companyId }),
  ])
  return repList.map(rep => {
    const mine = fu.followups.filter(f => f.repId === rep.id)
    return {
      repId: rep.id, name: rep.display_name, followups: mine,
      report: buildImprovementReport({
        records: records.get(rep.id) ?? [], insights: trends.get(rep.id)?.mastermindInsights ?? [],
        followups: mine, checks: fu.checks.filter(c => c.repId === rep.id), now,
      }),
    }
  })
}

export type CreateResult = { ok: true; id: string; existing: boolean } | { ok: false; error: 'forbidden' | 'failed' }

/** Manager assigns a focus to a rep. The baseline is measured HERE from the rep's own sessions. */
export async function createFollowup(managerId: string, req: FollowupRequest): Promise<CreateResult> {
  const admin = createAdminClient()
  const [manager, rep] = await Promise.all([loadActor(admin, managerId), loadActor(admin, req.repId)])
  if (!manager || !rep || !canAssign(manager, rep)) return { ok: false, error: 'forbidden' }

  let baselineValue: number | null = null
  let baselineN = 0
  if (req.metricKey) {
    const records = (await loadPracticeRecords(admin, [req.repId])).get(req.repId) ?? []
    const pts = series(records.filter(r => req.source === null || r.source === req.source), req.metricKey).slice(-BASELINE_WINDOW)
    baselineN = pts.length
    if (pts.length >= MIN_BASELINE) baselineValue = round1(mean(pts.map(p => p.value)))
  }

  const { data, error } = await admin.from('coaching_followups').insert({
    company_id: manager.companyId, rep_id: req.repId, created_by: managerId,
    metric_key: req.metricKey, source: req.source, drill_kind: req.drillKind,
    objection_type: req.objectionType, clear_step: req.clearStep,
    baseline_value: baselineValue, baseline_n: baselineN, note: req.note, due_date: req.dueDate,
  }).select('id').single()

  if (error?.code === '23505') { // the same focus is already open for this rep
    return { ok: true, id: '', existing: true }
  }
  if (error || !data) return { ok: false, error: 'failed' }
  return { ok: true, id: data.id as string, existing: false }
}

async function loadFollowupFor(admin: Admin, id: string): Promise<FollowupView | null> {
  const { data } = await admin.from('coaching_followups').select('*').eq('id', id).maybeSingle()
  return data ? toFollowup(data as FollowupRow) : null
}

export type ActionResult = 'ok' | 'not_found' | 'forbidden' | 'failed'

export async function acknowledgeFollowup(userId: string, followupId: string): Promise<ActionResult> {
  const admin = createAdminClient()
  const [actor, f] = await Promise.all([loadActor(admin, userId), loadFollowupFor(admin, followupId)])
  if (!actor || !f) return 'not_found'
  if (!canAcknowledge(actor, f)) return 'forbidden'
  const { error } = await admin.from('coaching_followups').update({ acknowledged_at: new Date().toISOString() })
    .eq('id', followupId).is('acknowledged_at', null)
  return error ? 'failed' : 'ok'
}

export async function closeFollowup(userId: string, followupId: string): Promise<ActionResult> {
  const admin = createAdminClient()
  const [actor, f] = await Promise.all([loadActor(admin, userId), loadFollowupFor(admin, followupId)])
  if (!actor || !f) return 'not_found'
  if (!canClose(actor, f)) return 'forbidden'
  const { error } = await admin.from('coaching_followups').update({ closed_at: new Date().toISOString() }).eq('id', followupId)
  return error ? 'failed' : 'ok'
}

export async function addFieldCheck(userId: string, req: FieldCheckRequest): Promise<ActionResult> {
  const admin = createAdminClient()
  const [actor, f] = await Promise.all([loadActor(admin, userId), loadFollowupFor(admin, req.followupId)])
  if (!actor || !f) return 'not_found'
  if (!canWriteFieldCheck(actor, f, req.kind)) return 'forbidden'
  const { error } = await admin.from('coaching_field_checks').insert({
    followup_id: f.id, company_id: f.companyId, rep_id: f.repId, kind: req.kind,
    recorded_by: userId, observed: req.observed, note: req.note,
  })
  return error ? 'failed' : 'ok'
}
