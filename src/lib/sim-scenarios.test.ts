import { afterEach, describe, expect, it, vi } from 'vitest'

type TableData = Record<string, unknown>
let tables: TableData = {}
const calls: Array<{ table: string; op: string; arg?: unknown; args: unknown[] }> = []

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const result = () => { const v = tables[table]; return { data: typeof v === 'function' ? (v as () => unknown)() : (v ?? null), error: null } }
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'or', 'in', 'order', 'limit', 'insert', 'update', 'delete']) {
        chain[m] = (...args: unknown[]) => { calls.push({ table, op: m, arg: args[0], args }); return chain }
      }
      chain.single = async () => result()
      chain.maybeSingle = async () => result()
      chain.then = (resolve: (v: unknown) => void) => resolve(result())
      return chain
    },
  }),
}))

import { assignScenario, createSimScenario, getRunnable, listAssignedForRep, updateSimScenario } from '@/lib/sim-scenarios'

const config = {
  name: 'S', therapeuticArea: 'CV', physician: { specialty: 'cardiology', seniority: 'consultant', style: 'driver', relationshipStage: 'new', adoptionAttitude: 'open' },
  mainConcerns: ['Time'], visitPurpose: 'Intro', learningObjectives: ['Ask first'], expectedCompetencies: ['discovery'],
  difficulty: 'normal', language: 'en', availableTimeMin: 5,
}
const row = (status: string) => ({ id: 's1', company_id: 'co', created_by: 'm', config, status, created_at: 't' })
afterEach(() => { tables = {}; calls.length = 0 })

describe('getRunnable (who may start a scenario)', () => {
  it('lets a rep start an approved scenario assigned to them', async () => {
    tables = { profiles: { id: 'rep', company_id: 'co', role: 'rep' }, sim_scenarios: row('approved'), sim_scenario_assignments: [{ id: 'a' }] }
    expect((await getRunnable('rep', 's1')).ok).toBe(true)
  })

  it('hides a draft or archived scenario from a rep, even if assigned', async () => {
    for (const status of ['draft', 'archived']) {
      tables = { profiles: { id: 'rep', company_id: 'co', role: 'rep' }, sim_scenarios: row(status), sim_scenario_assignments: [{ id: 'a' }] }
      expect(await getRunnable('rep', 's1')).toMatchObject({ ok: false, status: 404 })
    }
  })

  it('hides an approved but unassigned scenario from a rep', async () => {
    tables = { profiles: { id: 'rep', company_id: 'co', role: 'rep' }, sim_scenarios: row('approved'), sim_scenario_assignments: [] }
    expect(await getRunnable('rep', 's1')).toMatchObject({ ok: false, status: 404 })
  })

  it('lets a manager test their own company\'s draft', async () => {
    tables = { profiles: { id: 'm', company_id: 'co', role: 'manager' }, sim_scenarios: row('draft'), sim_scenario_assignments: [] }
    expect((await getRunnable('m', 's1')).ok).toBe(true)
  })

  it('scopes the scenario lookup to the caller\'s company and treats a missing row as not found', async () => {
    tables = { profiles: { id: 'rep', company_id: 'co', role: 'rep' }, sim_scenarios: null }
    expect(await getRunnable('rep', 's1')).toMatchObject({ ok: false, status: 404 })
    expect(calls.some(c => c.table === 'sim_scenarios' && c.op === 'eq' && c.args[0] === 'company_id' && c.args[1] === 'co')).toBe(true)
  })

  it('refuses users with no company', async () => {
    tables = { profiles: { id: 'x', company_id: null, role: 'rep' } }
    expect(await getRunnable('x', 's1')).toMatchObject({ ok: false, status: 404 })
  })
})

describe('manager-only writes', () => {
  it('refuses create / update / assign for a non-manager without touching the scenario table', async () => {
    tables = { profiles: { company_id: 'co', role: 'rep' } }
    expect(await createSimScenario('rep', config)).toMatchObject({ ok: false, status: 403 })
    expect(await updateSimScenario('rep', 's1', config)).toMatchObject({ ok: false, status: 403 })
    expect(await assignScenario('rep', 's1', null, null)).toMatchObject({ ok: false, status: 403 })
    expect(calls.some(c => c.table === 'sim_scenarios' && (c.op === 'insert' || c.op === 'update'))).toBe(false)
  })

  it('rejects an invalid scenario before any write, with all errors listed', async () => {
    tables = { profiles: { company_id: 'co', role: 'manager' } }
    const res = await createSimScenario('m', { ...config, name: '', difficulty: 'easy' })
    expect(res).toMatchObject({ ok: false, status: 400 })
    if (!res.ok) expect(res.errors.length).toBeGreaterThanOrEqual(2)
    expect(calls.some(c => c.op === 'insert')).toBe(false)
  })

  it('rejects an MSA doctor as not runnable', async () => {
    tables = { profiles: { company_id: 'co', role: 'manager' } }
    const res = await createSimScenario('m', { ...config, language: 'ar', arabicVariant: 'msa' })
    expect(res).toMatchObject({ ok: false, status: 400 })
  })

  it('sends an edited scenario back to draft and clears the approval', async () => {
    tables = { profiles: { company_id: 'co', role: 'manager' }, sim_scenarios: row('draft') }
    await updateSimScenario('m', 's1', config)
    const update = calls.find(c => c.table === 'sim_scenarios' && c.op === 'update')!.arg as Record<string, unknown>
    expect(update).toMatchObject({ status: 'draft', approved_by: null, approved_at: null })
  })

  it('will not assign a rep from another company', async () => {
    const answers = [{ company_id: 'co', role: 'manager' }, null] // manager check, then the rep lookup finds nobody in that company
    tables = { profiles: () => answers.shift(), sim_scenarios: row('approved') }
    expect(await assignScenario('m', 's1', '11111111-1111-1111-1111-111111111111', null)).toMatchObject({ ok: false, status: 404 })
  })
})

describe('listAssignedForRep', () => {
  it('returns nothing for a rep without a company or without assignments', async () => {
    tables = { profiles: { company_id: null } }
    expect(await listAssignedForRep('x')).toEqual([])
    tables = { profiles: { company_id: 'co' }, sim_scenario_assignments: [] }
    expect(await listAssignedForRep('x')).toEqual([])
  })

  it('queries only approved scenarios of the rep\'s company', async () => {
    tables = { profiles: { company_id: 'co' }, sim_scenario_assignments: [{ scenario_id: 's1' }], sim_scenarios: [row('approved')] }
    const list = await listAssignedForRep('rep')
    expect(list).toHaveLength(1)
    expect(calls.filter(c => c.table === 'sim_scenarios' && c.op === 'eq').map(c => c.args[1])).toEqual(expect.arrayContaining(['approved', 'co']))
  })
})
