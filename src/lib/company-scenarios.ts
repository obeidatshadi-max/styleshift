import { createAdminClient } from '@/lib/supabase-admin'
import { OBJECTION_CATEGORIES } from '@/lib/social-style'
import type { CompanyScenario, CompanyScenarioInput, GeneratedScenario, StyleKey } from '@/types/game'

const VALID_STYLES: StyleKey[] = ['driver', 'expressive', 'amiable', 'analytical']

/**
 * Validates a scenario draft before it touches the database — at least two
 * options with one marked as the winning response, non-empty text fields,
 * a real objection category (drives the cognitive-bias callout the rep
 * sees when playing it). Pure so it's cheap to unit-test without Supabase.
 */
export function validateScenarioInput(input: Partial<CompanyScenarioInput>): string | null {
  if (!input.name?.trim()) return 'Name is required'
  if (!input.style || !VALID_STYLES.includes(input.style)) return 'Invalid style'
  if (!input.category || !(OBJECTION_CATEGORIES as readonly string[]).includes(input.category)) return 'Invalid objection category'
  if (!input.crisis?.trim()) return 'Objection / crisis text is required'
  if (!input.q?.trim()) return 'Question prompt is required'
  if (!Array.isArray(input.opts) || input.opts.length < 2) return 'At least two response options are required'
  if (!input.opts.some(o => o.r === 'win')) return 'One option must be marked as the winning response'
  if (input.opts.some(o => !o.t?.trim() || !o.why?.trim())) return 'Every option needs response text and a rationale'
  return null
}

/** Maps a DB row to the shape GeneratedDrill already knows how to play. */
export function toPlayableScenario(row: CompanyScenario): GeneratedScenario {
  return { name: row.name, style: row.style, crisis: row.crisis, q: row.q, opts: row.opts, category: row.category }
}

async function companyIdForManager(userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('company_id, role')
    .eq('id', userId)
    .single()
  if (!data?.company_id || data.role !== 'manager') return null
  return data.company_id as string
}

/** Every scenario (any status) for the caller's company — manager-only. */
export async function listScenariosForManager(userId: string): Promise<CompanyScenario[] | null> {
  const companyId = await companyIdForManager(userId)
  if (!companyId) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('company_scenarios')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
  return (data as CompanyScenario[]) ?? []
}

/** Approved scenarios for the caller's company — what a rep is allowed to practice. */
export async function listApprovedScenariosForRep(userId: string): Promise<CompanyScenario[]> {
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('company_id')
    .eq('id', userId)
    .single()
  if (!profile?.company_id) return []

  const { data } = await admin
    .from('company_scenarios')
    .select('*')
    .eq('company_id', profile.company_id)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
  return (data as CompanyScenario[]) ?? []
}

/** Manager drafts a new scenario for their company (status starts at 'draft'). */
export async function createScenario(userId: string, input: CompanyScenarioInput): Promise<CompanyScenario | null> {
  const invalid = validateScenarioInput(input)
  if (invalid) return null
  const companyId = await companyIdForManager(userId)
  if (!companyId) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('company_scenarios')
    .insert({
      company_id: companyId, created_by: userId,
      style: input.style, name: input.name, crisis: input.crisis, q: input.q, opts: input.opts,
      category: input.category,
    })
    .select('*')
    .single()
  return (data as CompanyScenario) ?? null
}

/**
 * Manager changes a scenario's status — approve (compliance sign-off, makes
 * it visible to reps) or archive (pull it without deleting the record).
 * Scoped to the manager's own company; returns null if the scenario isn't
 * theirs or the caller isn't a manager.
 */
export async function setScenarioStatus(
  userId: string, scenarioId: string, status: 'approved' | 'archived' | 'draft'
): Promise<CompanyScenario | null> {
  const companyId = await companyIdForManager(userId)
  if (!companyId) return null

  const admin = createAdminClient()
  const patch: Record<string, unknown> = { status }
  if (status === 'approved') { patch.approved_by = userId; patch.approved_at = new Date().toISOString() }
  if (status === 'draft') { patch.approved_by = null; patch.approved_at = null }

  const { data } = await admin
    .from('company_scenarios')
    .update(patch)
    .eq('id', scenarioId)
    .eq('company_id', companyId)
    .select('*')
    .single()
  return (data as CompanyScenario) ?? null
}
