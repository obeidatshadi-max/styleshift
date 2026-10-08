import { createAdminClient } from '@/lib/supabase-admin'
import { validateSimScenario, type ScenarioStatus, type SimScenario, type SimScenarioRecord } from '@/schemas/scenario'
import type { Profile } from '@/types/game'

/** Feature flag for the whole scenario builder (manager UI, API, rep launch). */
export function scenarioBuilderEnabled(): boolean {
  return process.env.SCENARIO_BUILDER_ENABLED === 'true'
}

/** Things the validator allows but the simulation engine cannot run yet. */
export function runnableProblems(s: SimScenario): string[] {
  const problems: string[] = []
  // The doctor prompt always uses the Iraqi dialect line for Arabic; there is no MSA doctor voice yet.
  if (s.language === 'ar' && s.arabicVariant === 'msa') problems.push('arabicVariant: only "iraqi" can be run today')
  return problems
}

interface Row {
  id: string
  company_id: string
  created_by: string
  config: SimScenario
  status: ScenarioStatus
  created_at: string
}

export function rowToRecord(row: Row): SimScenarioRecord {
  return { ...row.config, id: row.id, companyId: row.company_id, status: row.status, createdBy: row.created_by, createdAt: row.created_at }
}

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 403 | 404; errors: string[] }
const fail = (status: 400 | 403 | 404, ...errors: string[]): { ok: false; status: 400 | 403 | 404; errors: string[] } => ({ ok: false, status, errors })

async function managerCompany(userId: string): Promise<string | null> {
  const { data } = await createAdminClient().from('profiles').select('company_id, role').eq('id', userId).single()
  return data?.company_id && data.role === 'manager' ? data.company_id as string : null
}

function checkInput(input: unknown): ServiceResult<SimScenario> {
  const res = validateSimScenario(input)
  if (!res.ok) return fail(400, ...res.errors)
  const problems = runnableProblems(res.value)
  return problems.length ? fail(400, ...problems) : { ok: true, value: res.value }
}

export async function listForManager(userId: string): Promise<ServiceResult<SimScenarioRecord[]>> {
  const companyId = await managerCompany(userId)
  if (!companyId) return fail(403, 'not a manager')
  const { data } = await createAdminClient().from('sim_scenarios').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
  return { ok: true, value: ((data as Row[] | null) ?? []).map(rowToRecord) }
}

export async function getForManager(userId: string, id: string): Promise<ServiceResult<SimScenarioRecord>> {
  const companyId = await managerCompany(userId)
  if (!companyId) return fail(403, 'not a manager')
  const { data } = await createAdminClient().from('sim_scenarios').select('*').eq('id', id).eq('company_id', companyId).maybeSingle()
  return data ? { ok: true, value: rowToRecord(data as Row) } : fail(404, 'scenario not found')
}

export async function createSimScenario(userId: string, input: unknown): Promise<ServiceResult<SimScenarioRecord>> {
  const companyId = await managerCompany(userId)
  if (!companyId) return fail(403, 'not a manager')
  const checked = checkInput(input)
  if (!checked.ok) return checked
  const { data, error } = await createAdminClient().from('sim_scenarios')
    .insert({ company_id: companyId, created_by: userId, name: checked.value.name, config: checked.value })
    .select('*').single()
  return error || !data ? fail(400, 'could not save scenario') : { ok: true, value: rowToRecord(data as Row) }
}

/** Editing an approved scenario sends it back to draft: reps must never practise content nobody re-approved. */
export async function updateSimScenario(userId: string, id: string, input: unknown): Promise<ServiceResult<SimScenarioRecord>> {
  const companyId = await managerCompany(userId)
  if (!companyId) return fail(403, 'not a manager')
  const checked = checkInput(input)
  if (!checked.ok) return checked
  const { data } = await createAdminClient().from('sim_scenarios')
    .update({ name: checked.value.name, config: checked.value, status: 'draft', approved_by: null, approved_at: null, updated_at: new Date().toISOString() })
    .eq('id', id).eq('company_id', companyId).select('*').maybeSingle()
  return data ? { ok: true, value: rowToRecord(data as Row) } : fail(404, 'scenario not found')
}

export async function setSimScenarioStatus(userId: string, id: string, status: ScenarioStatus): Promise<ServiceResult<SimScenarioRecord>> {
  const companyId = await managerCompany(userId)
  if (!companyId) return fail(403, 'not a manager')
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (status === 'approved') { patch.approved_by = userId; patch.approved_at = new Date().toISOString() }
  else { patch.approved_by = null; patch.approved_at = null }
  const { data } = await createAdminClient().from('sim_scenarios').update(patch).eq('id', id).eq('company_id', companyId).select('*').maybeSingle()
  return data ? { ok: true, value: rowToRecord(data as Row) } : fail(404, 'scenario not found')
}

export async function duplicateSimScenario(userId: string, id: string): Promise<ServiceResult<SimScenarioRecord>> {
  const source = await getForManager(userId, id)
  if (!source.ok) return source
  const { id: _id, companyId: _c, status: _s, createdBy: _b, createdAt: _t, ...config } = source.value
  void _id; void _c; void _s; void _b; void _t
  return createSimScenario(userId, { ...config, name: `${config.name} (copy)`.slice(0, 120) })
}

export interface ScenarioAssignment { id: string; scenarioId: string; assigneeRepId: string | null; dueAt: string | null }

export async function listAssignments(userId: string, scenarioId: string): Promise<ServiceResult<ScenarioAssignment[]>> {
  const found = await getForManager(userId, scenarioId)
  if (!found.ok) return found
  const { data } = await createAdminClient().from('sim_scenario_assignments').select('id, scenario_id, assignee_rep_id, due_at').eq('scenario_id', scenarioId)
  return { ok: true, value: ((data as Array<{ id: string; scenario_id: string; assignee_rep_id: string | null; due_at: string | null }> | null) ?? [])
    .map(r => ({ id: r.id, scenarioId: r.scenario_id, assigneeRepId: r.assignee_rep_id, dueAt: r.due_at })) }
}

/** `repId` null = the whole company. The rep must belong to the manager's company. */
export async function assignScenario(userId: string, scenarioId: string, repId: string | null, dueAt: string | null): Promise<ServiceResult<ScenarioAssignment>> {
  const found = await getForManager(userId, scenarioId)
  if (!found.ok) return found
  const admin = createAdminClient()
  if (repId) {
    const { data: rep } = await admin.from('profiles').select('id').eq('id', repId).eq('company_id', found.value.companyId).maybeSingle()
    if (!rep) return fail(404, 'rep not in your company')
  }
  if (dueAt && Number.isNaN(Date.parse(dueAt))) return fail(400, 'dueAt: not a date')
  const { data, error } = await admin.from('sim_scenario_assignments')
    .insert({ scenario_id: scenarioId, company_id: found.value.companyId, assignee_rep_id: repId, assigned_by: userId, due_at: dueAt })
    .select('id, scenario_id, assignee_rep_id, due_at').single()
  if (error || !data) return fail(400, 'already assigned')
  return { ok: true, value: { id: data.id, scenarioId: data.scenario_id, assigneeRepId: data.assignee_rep_id, dueAt: data.due_at } }
}

export async function unassignScenario(userId: string, scenarioId: string, assignmentId: string): Promise<ServiceResult<true>> {
  const found = await getForManager(userId, scenarioId)
  if (!found.ok) return found
  await createAdminClient().from('sim_scenario_assignments').delete().eq('id', assignmentId).eq('scenario_id', scenarioId)
  return { ok: true, value: true }
}

/** Approved scenarios assigned to this rep (or to the whole company). */
export async function listAssignedForRep(userId: string): Promise<SimScenarioRecord[]> {
  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles').select('company_id').eq('id', userId).single()
  if (!me?.company_id) return []
  const { data: links } = await admin.from('sim_scenario_assignments').select('scenario_id, assignee_rep_id')
    .eq('company_id', me.company_id).or(`assignee_rep_id.eq.${userId},assignee_rep_id.is.null`)
  const ids = [...new Set(((links as Array<{ scenario_id: string }> | null) ?? []).map(l => l.scenario_id))]
  if (!ids.length) return []
  const { data } = await admin.from('sim_scenarios').select('*').in('id', ids).eq('status', 'approved').eq('company_id', me.company_id)
  return ((data as Row[] | null) ?? []).map(rowToRecord)
}

type RunProfile = Pick<Profile, 'id' | 'display_name' | 'company_id' | 'sps_top_key' | 'sps_profile'>

/**
 * Whether this user may START this scenario, and if so the scenario + their profile.
 * A manager may test any scenario of their company (any status, including draft);
 * a rep only an approved one assigned to them or to the whole company.
 */
export async function getRunnable(userId: string, scenarioId: string): Promise<ServiceResult<{ scenario: SimScenarioRecord; profile: RunProfile }>> {
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('id, display_name, company_id, sps_top_key, sps_profile, role').eq('id', userId).single()
  if (!profile?.company_id) return fail(404, 'scenario not found')
  const { data: row } = await admin.from('sim_scenarios').select('*').eq('id', scenarioId).eq('company_id', profile.company_id).maybeSingle()
  if (!row) return fail(404, 'scenario not found')
  const scenario = rowToRecord(row as Row)
  if (profile.role !== 'manager') {
    if (scenario.status !== 'approved') return fail(404, 'scenario not found')
    const { data: link } = await admin.from('sim_scenario_assignments').select('id').eq('scenario_id', scenarioId)
      .or(`assignee_rep_id.eq.${userId},assignee_rep_id.is.null`).limit(1)
    if (!link?.length) return fail(404, 'scenario not found')
  }
  return { ok: true, value: { scenario, profile: profile as RunProfile } }
}
