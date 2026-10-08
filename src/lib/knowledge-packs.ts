import { createAdminClient } from '@/lib/supabase-admin'
import { TIER_BY_KIND, validateKnowledgePack, type KnowledgePack } from '@/schemas/knowledge'

/** Feature flag for knowledge packs (manager API/UI and prompt grounding). */
export function knowledgePacksEnabled(): boolean {
  return process.env.KNOWLEDGE_PACKS_ENABLED === 'true'
}

export type PackStatus = 'draft' | 'approved' | 'archived'

export interface KnowledgePackRecord extends KnowledgePack {
  id: string
  companyId: string
  status: PackStatus
  createdAt: string
}

interface Row { id: string; company_id: string; config: KnowledgePack; status: PackStatus; created_at: string }

export const rowToRecord = (r: Row): KnowledgePackRecord => ({ ...r.config, id: r.id, companyId: r.company_id, status: r.status, createdAt: r.created_at })

export type Result<T> = { ok: true; value: T } | { ok: false; status: 400 | 403 | 404 | 409; errors: string[] }
const fail = (status: 400 | 403 | 404 | 409, ...errors: string[]): { ok: false; status: 400 | 403 | 404 | 409; errors: string[] } => ({ ok: false, status, errors })

async function managerCompany(userId: string): Promise<string | null> {
  const { data } = await createAdminClient().from('profiles').select('company_id, role').eq('id', userId).single()
  return data?.company_id && data.role === 'manager' ? data.company_id as string : null
}

export async function listPacks(userId: string): Promise<Result<KnowledgePackRecord[]>> {
  const companyId = await managerCompany(userId)
  if (!companyId) return fail(403, 'not a manager')
  const { data } = await createAdminClient().from('knowledge_packs').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
  return { ok: true, value: ((data as Row[] | null) ?? []).map(rowToRecord) }
}

export async function getPack(userId: string, id: string): Promise<Result<KnowledgePackRecord>> {
  const companyId = await managerCompany(userId)
  if (!companyId) return fail(403, 'not a manager')
  const { data } = await createAdminClient().from('knowledge_packs').select('*').eq('id', id).eq('company_id', companyId).maybeSingle()
  return data ? { ok: true, value: rowToRecord(data as Row) } : fail(404, 'knowledge pack not found')
}

export async function createPack(userId: string, input: unknown): Promise<Result<KnowledgePackRecord>> {
  const companyId = await managerCompany(userId)
  if (!companyId) return fail(403, 'not a manager')
  const checked = validateKnowledgePack(input)
  if (!checked.ok) return fail(400, ...checked.errors)
  const { data, error } = await createAdminClient().from('knowledge_packs')
    .insert({ company_id: companyId, created_by: userId, name: checked.value.name, product_name: checked.value.productName, config: checked.value })
    .select('*').single()
  return error || !data ? fail(400, 'could not save knowledge pack') : { ok: true, value: rowToRecord(data as Row) }
}

/**
 * Editing an APPROVED pack returns it to draft (and clears the approval), so an
 * unreviewed edit can never reach a prompt. Any other status keeps its status.
 * The version goes up on every save.
 */
export async function updatePack(userId: string, id: string, input: unknown): Promise<Result<KnowledgePackRecord>> {
  const current = await getPack(userId, id)
  if (!current.ok) return current
  const checked = validateKnowledgePack(input)
  if (!checked.ok) return fail(400, ...checked.errors)
  const config = { ...checked.value, version: current.value.version + 1 }
  const wasApproved = current.value.status === 'approved'
  const { data } = await createAdminClient().from('knowledge_packs')
    .update({
      name: config.name, product_name: config.productName, config,
      status: wasApproved ? 'draft' : current.value.status,
      ...(wasApproved ? { approved_by: null, approved_at: null } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id).eq('company_id', current.value.companyId).select('*').maybeSingle()
  return data ? { ok: true, value: rowToRecord(data as Row) } : fail(404, 'knowledge pack not found')
}

export async function setPackStatus(userId: string, id: string, status: PackStatus): Promise<Result<KnowledgePackRecord>> {
  const current = await getPack(userId, id)
  if (!current.ok) return current
  if (status === 'approved' && !current.value.items.some(i => i.status === 'approved')) {
    return fail(400, 'approve at least one item before approving the pack')
  }
  const approving = status === 'approved'
  const { data, error } = await createAdminClient().from('knowledge_packs')
    .update({
      status, approved_by: approving ? userId : null, approved_at: approving ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id).eq('company_id', current.value.companyId).select('*').maybeSingle()
  if (error) return fail(409, 'could not change the pack status')
  return data ? { ok: true, value: rowToRecord(data as Row) } : fail(404, 'knowledge pack not found')
}

/**
 * The pack as a simulation session may carry it. Only an APPROVED pack, only its
 * approved items, and never coaching notes: the session record is readable by the
 * rep it belongs to, so it must hold nothing a rep should not see. Null when the
 * pack is missing, not approved, invalid, or has nothing usable (the session then
 * simply runs generic).
 */
export async function approvedPackSnapshot(companyId: string, packId: string): Promise<KnowledgePack | null> {
  const { data } = await createAdminClient().from('knowledge_packs').select('config')
    .eq('id', packId).eq('company_id', companyId).eq('status', 'approved').maybeSingle()
  const checked = data ? validateKnowledgePack((data as { config: unknown }).config) : null
  if (!checked?.ok) return null
  const items = checked.value.items.filter(i => i.status === 'approved' && TIER_BY_KIND[i.kind] !== 'coaching_interpretation')
  return items.length ? { ...checked.value, items } : null
}

/** The approved pack linked to a scenario, looked up inside the rep's own company only. */
export async function knowledgeForScenario(scenarioId: string, repId: string): Promise<KnowledgePack | null> {
  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles').select('company_id').eq('id', repId).single()
  if (!me?.company_id) return null
  const { data: scenario } = await admin.from('sim_scenarios').select('config')
    .eq('id', scenarioId).eq('company_id', me.company_id).maybeSingle()
  const packId = (scenario as { config?: { knowledgePackId?: string | null } } | null)?.config?.knowledgePackId
  return packId ? approvedPackSnapshot(me.company_id as string, packId) : null
}
