import { afterEach, describe, expect, it, vi } from 'vitest'

type TableData = Record<string, unknown>
let tables: TableData = {}
const calls: Array<{ table: string; op: string; args: unknown[] }> = []

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const result = () => { const v = tables[table]; return { data: typeof v === 'function' ? (v as () => unknown)() : (v ?? null), error: null } }
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'insert', 'update']) {
        chain[m] = (...args: unknown[]) => { calls.push({ table, op: m, args }); return chain }
      }
      chain.single = async () => result()
      chain.maybeSingle = async () => result()
      chain.then = (resolve: (v: unknown) => void) => resolve(result())
      return chain
    },
  }),
}))

import {
  approvedPackSnapshot, createPack, getPack, knowledgeForScenario, listPacks, setPackStatus, updatePack,
} from '@/lib/knowledge-packs'

const source = { title: 'Label', type: 'label', reference: 'Section 1', version: 'v3', externalSystem: null, externalId: null }
const item = (id: string, kind: string, status: string, over: Record<string, unknown> = {}) => ({
  id, kind, status, text: { en: `Text ${id}` }, sources: [source], arabicReviewed: false, topics: [], ...over,
})
const pack = (items: unknown[] = [item('f1', 'indication', 'approved')], over: Record<string, unknown> = {}) => ({
  name: 'Prod pack', productName: 'Prod', indication: null, version: 1, items, ...over,
})
const row = (status: string, config: unknown = pack()) => ({ id: 'p1', company_id: 'co', created_by: 'm', config, status, created_at: 't' })
const manager = { id: 'm', company_id: 'co', role: 'manager' }
const updateArg = () => calls.find(c => c.table === 'knowledge_packs' && c.op === 'update')!.args[0] as Record<string, unknown>

afterEach(() => { tables = {}; calls.length = 0 })

describe('pack service access', () => {
  it('is manager-only', async () => {
    tables = { profiles: { id: 'rep', company_id: 'co', role: 'rep' } }
    expect(await listPacks('rep')).toMatchObject({ ok: false, status: 403 })
    expect(await createPack('rep', pack())).toMatchObject({ ok: false, status: 403 })
    expect(calls.some(c => c.op === 'insert')).toBe(false)
  })

  it('scopes every read to the manager\'s own company', async () => {
    tables = { profiles: manager, knowledge_packs: row('draft') }
    await getPack('m', 'p1')
    expect(calls.some(c => c.table === 'knowledge_packs' && c.op === 'eq' && c.args[0] === 'company_id' && c.args[1] === 'co')).toBe(true)
    tables = { profiles: manager, knowledge_packs: null }
    expect(await getPack('m', 'p1')).toMatchObject({ ok: false, status: 404 })
  })
})

describe('createPack and updatePack', () => {
  it('rejects an approved clinical fact with no source and writes nothing', async () => {
    tables = { profiles: manager }
    const bad = pack([item('f1', 'efficacy', 'approved', { sources: [] })])
    const res = await createPack('m', bad)
    expect(res).toMatchObject({ ok: false, status: 400 })
    if (!res.ok) expect(res.errors.join()).toMatch(/at least one source/)
    expect(calls.some(c => c.op === 'insert')).toBe(false)
  })

  it('stores a valid pack as a draft under the manager\'s company', async () => {
    tables = { profiles: manager, knowledge_packs: row('draft') }
    const res = await createPack('m', pack())
    expect(res.ok).toBe(true)
    const insert = calls.find(c => c.table === 'knowledge_packs' && c.op === 'insert')!.args[0] as Record<string, unknown>
    expect(insert).toMatchObject({ company_id: 'co', created_by: 'm', name: 'Prod pack', product_name: 'Prod' })
  })

  it('editing an APPROVED pack returns it to draft and bumps the version, so unreviewed edits never reach a prompt', async () => {
    tables = { profiles: manager, knowledge_packs: row('approved', pack(undefined, { version: 3 })) }
    const res = await updatePack('m', 'p1', pack())
    expect(res.ok).toBe(true)
    const arg = updateArg()
    expect(arg.status).toBe('draft')
    expect(arg.approved_by).toBeNull()
    expect((arg.config as { version: number }).version).toBe(4)
  })

  it('keeps a draft a draft when edited', async () => {
    tables = { profiles: manager, knowledge_packs: row('draft') }
    await updatePack('m', 'p1', pack())
    expect(updateArg().status).toBe('draft')
  })
})

describe('setPackStatus', () => {
  it('refuses to approve a pack with no approved item', async () => {
    tables = { profiles: manager, knowledge_packs: row('draft', pack([item('f1', 'indication', 'draft')])) }
    expect(await setPackStatus('m', 'p1', 'approved')).toMatchObject({ ok: false, status: 400 })
    expect(calls.some(c => c.op === 'update')).toBe(false)
  })

  it('records who approved and when', async () => {
    tables = { profiles: manager, knowledge_packs: row('draft') }
    const res = await setPackStatus('m', 'p1', 'approved')
    expect(res.ok).toBe(true)
    expect(updateArg()).toMatchObject({ status: 'approved', approved_by: 'm' })
    expect(typeof updateArg().approved_at).toBe('string')
  })

  it('clears the approval when archived', async () => {
    tables = { profiles: manager, knowledge_packs: row('approved') }
    await setPackStatus('m', 'p1', 'archived')
    expect(updateArg()).toMatchObject({ status: 'archived', approved_by: null, approved_at: null })
  })
})

describe('approvedPackSnapshot (what a session may carry)', () => {
  it('keeps approved facts and messaging, drops drafts, retired items and coaching notes', async () => {
    tables = { knowledge_packs: { config: pack([
      item('f1', 'indication', 'approved'),
      item('f2', 'dosing', 'draft'),
      item('f3', 'safety', 'retired'),
      item('m1', 'approved_messaging', 'approved', { sources: [] }),
      item('c1', 'coaching_note', 'approved', { sources: [] }),
    ]) } }
    const snap = await approvedPackSnapshot('co', 'p1')
    expect(snap?.items.map(i => i.id)).toEqual(['f1', 'm1'])
  })

  it('is null when the pack is not approved, is missing, has no usable items, or fails validation', async () => {
    tables = { knowledge_packs: null }
    expect(await approvedPackSnapshot('co', 'p1')).toBeNull()
    tables = { knowledge_packs: { config: pack([item('f1', 'indication', 'draft')]) } }
    expect(await approvedPackSnapshot('co', 'p1')).toBeNull()
    tables = { knowledge_packs: { config: { name: 'Broken' } } }
    expect(await approvedPackSnapshot('co', 'p1')).toBeNull()
  })

  it('looks the pack up by company and approved status', async () => {
    tables = { knowledge_packs: { config: pack() } }
    await approvedPackSnapshot('co', 'p1')
    const eqs = calls.filter(c => c.table === 'knowledge_packs' && c.op === 'eq').map(c => c.args.join('='))
    expect(eqs).toEqual(expect.arrayContaining(['id=p1', 'company_id=co', 'status=approved']))
  })
})

describe('knowledgeForScenario', () => {
  it('returns the linked approved pack of the rep\'s own company', async () => {
    tables = { profiles: { company_id: 'co' }, sim_scenarios: { config: { knowledgePackId: 'p1' } }, knowledge_packs: { config: pack() } }
    expect((await knowledgeForScenario('s1', 'rep'))?.name).toBe('Prod pack')
    expect(calls.some(c => c.table === 'sim_scenarios' && c.op === 'eq' && c.args[0] === 'company_id' && c.args[1] === 'co')).toBe(true)
  })

  it('is null when the scenario has no pack, the rep has no company, or the pack is gone', async () => {
    tables = { profiles: { company_id: 'co' }, sim_scenarios: { config: { knowledgePackId: null } } }
    expect(await knowledgeForScenario('s1', 'rep')).toBeNull()
    tables = { profiles: { company_id: null } }
    expect(await knowledgeForScenario('s1', 'rep')).toBeNull()
    tables = { profiles: { company_id: 'co' }, sim_scenarios: { config: { knowledgePackId: 'p1' } }, knowledge_packs: null }
    expect(await knowledgeForScenario('s1', 'rep')).toBeNull()
  })
})
