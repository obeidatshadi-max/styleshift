import { createAdminClient } from '@/lib/supabase-admin'
import { validateMethodology, type Methodology } from '@/schemas/methodology'

/** Feature flag for the Methodology Builder (manager API/UI and rep-side terminology). */
export function methodologyBuilderEnabled(): boolean {
  return process.env.METHODOLOGY_BUILDER_ENABLED === 'true'
}

export type MethodologyStatus = 'draft' | 'active' | 'archived'

export interface MethodologyRecord extends Methodology {
  id: string
  companyId: string
  status: MethodologyStatus
  createdAt: string
}

interface Row { id: string; company_id: string; config: Methodology; status: MethodologyStatus; created_at: string }

export const rowToRecord = (r: Row): MethodologyRecord => ({ ...r.config, id: r.id, companyId: r.company_id, status: r.status, createdAt: r.created_at })

export type Result<T> = { ok: true; value: T } | { ok: false; status: 400 | 403 | 404 | 409; errors: string[] }
const fail = (status: 400 | 403 | 404 | 409, ...errors: string[]): { ok: false; status: 400 | 403 | 404 | 409; errors: string[] } => ({ ok: false, status, errors })

async function managerCompany(userId: string): Promise<string | null> {
  const { data } = await createAdminClient().from('profiles').select('company_id, role').eq('id', userId).single()
  return data?.company_id && data.role === 'manager' ? data.company_id as string : null
}

export async function listMethodologies(userId: string): Promise<Result<MethodologyRecord[]>> {
  const companyId = await managerCompany(userId)
  if (!companyId) return fail(403, 'not a manager')
  const { data } = await createAdminClient().from('methodologies').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
  return { ok: true, value: ((data as Row[] | null) ?? []).map(rowToRecord) }
}

export async function getMethodology(userId: string, id: string): Promise<Result<MethodologyRecord>> {
  const companyId = await managerCompany(userId)
  if (!companyId) return fail(403, 'not a manager')
  const { data } = await createAdminClient().from('methodologies').select('*').eq('id', id).eq('company_id', companyId).maybeSingle()
  return data ? { ok: true, value: rowToRecord(data as Row) } : fail(404, 'methodology not found')
}

export async function createMethodology(userId: string, input: unknown): Promise<Result<MethodologyRecord>> {
  const companyId = await managerCompany(userId)
  if (!companyId) return fail(403, 'not a manager')
  const checked = validateMethodology(input)
  if (!checked.ok) return fail(400, ...checked.errors)
  const { data, error } = await createAdminClient().from('methodologies')
    .insert({ company_id: companyId, created_by: userId, name: checked.value.name, config: checked.value }).select('*').single()
  return error || !data ? fail(400, 'could not save methodology') : { ok: true, value: rowToRecord(data as Row) }
}

/**
 * Editing an ACTIVE methodology never changes what reps see: it creates a new
 * draft (version + 1) and leaves the active one untouched until the manager
 * activates the draft. Any other status is edited in place.
 */
export async function updateMethodology(userId: string, id: string, input: unknown): Promise<Result<MethodologyRecord>> {
  const current = await getMethodology(userId, id)
  if (!current.ok) return current
  const checked = validateMethodology(input)
  if (!checked.ok) return fail(400, ...checked.errors)
  const admin = createAdminClient()
  if (current.value.status === 'active') {
    const config = { ...checked.value, version: current.value.version + 1 }
    const { data, error } = await admin.from('methodologies')
      .insert({ company_id: current.value.companyId, created_by: userId, name: config.name, config }).select('*').single()
    return error || !data ? fail(400, 'could not save methodology') : { ok: true, value: rowToRecord(data as Row) }
  }
  const { data } = await admin.from('methodologies')
    .update({ name: checked.value.name, config: checked.value, updated_at: new Date().toISOString() })
    .eq('id', id).eq('company_id', current.value.companyId).select('*').maybeSingle()
  return data ? { ok: true, value: rowToRecord(data as Row) } : fail(404, 'methodology not found')
}

/** Activating archives the company's current active one first (only one may be active). */
export async function setMethodologyStatus(userId: string, id: string, status: MethodologyStatus): Promise<Result<MethodologyRecord>> {
  const current = await getMethodology(userId, id)
  if (!current.ok) return current
  const admin = createAdminClient()
  if (status === 'active' && current.value.status !== 'active') {
    await admin.from('methodologies').update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('company_id', current.value.companyId).eq('status', 'active')
  }
  const { data, error } = await admin.from('methodologies').update({ status, updated_at: new Date().toISOString() })
    .eq('id', id).eq('company_id', current.value.companyId).select('*').maybeSingle()
  if (error) return fail(409, 'another methodology is already active')
  return data ? { ok: true, value: rowToRecord(data as Row) } : fail(404, 'methodology not found')
}

/** The company's active methodology for any member (null when none, or when the user has no company). */
export async function activeMethodologyFor(userId: string): Promise<Methodology | null> {
  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles').select('company_id').eq('id', userId).single()
  if (!me?.company_id) return null
  const { data } = await admin.from('methodologies').select('config').eq('company_id', me.company_id).eq('status', 'active').maybeSingle()
  const checked = data ? validateMethodology((data as { config: unknown }).config) : null
  // A stored config that no longer validates (e.g. after an ontology change) is ignored, not trusted.
  return checked?.ok ? checked.value : null
}
