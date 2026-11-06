import { beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './supabaseTestDb'

/**
 * The exact statements src/lib/validation/assessor-store.ts sends for an assessor, replayed in the same order as the
 * assessor against real row-level security and triggers: list own cases, start a draft, replace its items, submit,
 * and the refusals after that. If the store's queries or the policies drift apart, this fails.
 */
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CO = id(1), admin = id(11), me = id(12), other = id(13), rep = id(21)
const pilot = id(101), mine = id(111), theirs = id(112), unassigned = id(113)

async function rejects(p: Promise<unknown>, match: RegExp) {
  let msg: string | null = null
  try { await p } catch (e) { msg = (e as Error).message }
  expect(msg, 'the statement was allowed but should have been refused').not.toBeNull()
  expect(msg).toMatch(match)
}

let t: TestDb
const as = (u: string, sql: string) => t.asUser(u, sql, { commit: true })
const item = (rating: string, domain: string, observable: boolean, score: number | null, refs: number[]) =>
  `('${rating}','${domain}',${observable},${score ?? 'null'},'{${refs.join(',')}}',null,false)`
const insertItems = (rating: string, rows: string[]) =>
  as(me, `insert into public.human_rating_items (rating_id, domain, observable, score, turn_refs, note, uncertain) values ${rows.join(',')}`)

beforeAll(async () => {
  t = await createTestDb()
  await t.db.exec(`insert into auth.users (id, email) select u, u::text || '@test.invalid' from unnest(array['${admin}','${me}','${other}','${rep}']::uuid[]) u`)
  await t.asService(`insert into public.companies (id, name) values ('${CO}','A')`)
  await t.asService(`insert into public.profiles (id, company_id, role, display_name) values
    ('${admin}','${CO}','manager','Admin'),('${me}','${CO}','rep','Me'),('${other}','${CO}','rep','Other'),('${rep}','${CO}','rep','Rep')`)
  await t.asService(`insert into public.validation_pilots (id, company_id, name, data_source, rubric_version, methodology_version, protocol_version, status, created_by)
    values ('${pilot}','${CO}','P','synthetic','hrr-1.0.0','mm-1.0.0','bvp-1.0.0','running','${admin}')`)
  await t.asService(`insert into public.validation_pilot_members (pilot_id, user_id, role) values ('${pilot}','${admin}','administrator'),('${pilot}','${me}','assessor'),('${pilot}','${other}','assessor')`)
  await t.asService(`insert into public.validation_assignments (id, pilot_id, rep_id, session_type, session_id, scenario_type, scenario_version, phase, seen_before) values
    ('${mine}','${pilot}','${rep}','ai_doctor_text','${id(301)}','A','v1','baseline',false),
    ('${theirs}','${pilot}','${rep}','ai_doctor_text','${id(302)}','B','v1','followup',false),
    ('${unassigned}','${pilot}','${rep}','ai_doctor_text','${id(303)}','C','v1','followup',false)`)
  await t.asService(`insert into public.validation_assessor_assignments (assignment_id, assessor_id, pilot_id, scenario_type) values
    ('${mine}','${me}','${pilot}','A'),('${theirs}','${other}','${pilot}','B')`)
}, 120000)

describe('assessor store statements against the real policies', () => {
  let rating = ''

  it('lists only this assessor\'s cases, with the case id and scenario type and nothing about the rep', async () => {
    const rows = await t.asUser(me, `select assignment_id, scenario_type from public.validation_assessor_assignments where assessor_id = '${me}'`)
    expect(rows).toEqual([{ assignment_id: mine, scenario_type: 'A' }])
    expect(await t.asUser(me, `select id from public.validation_assignments`)).toEqual([])
  })

  it('starts a draft and reads it back with insert ... returning', async () => {
    const rows = await as(me, `insert into public.human_ratings (assignment_id, rater_id, rubric_version) values ('${mine}','${me}','hrr-1.0.0') returning id`)
    rating = (rows[0] as { id: string }).id
    expect(rating).toBeTruthy()
    expect(await t.asUser(me, `select id, status, unscorable from public.human_ratings where assignment_id = '${mine}' and rater_id = '${me}'`)).toEqual([{ id: rating, status: 'draft', unscorable: false }])
  })

  it('cannot start a rating on a case assigned to someone else', async () => {
    await rejects(as(me, `insert into public.human_ratings (assignment_id, rater_id, rubric_version) values ('${theirs}','${me}','hrr-1.0.0')`), /row-level security/)
  })

  it('replaces the draft items as a whole: update, delete, insert', async () => {
    expect(await as(me, `update public.human_ratings set unscorable = false where id = '${rating}' returning id`)).toHaveLength(1)
    await as(me, `delete from public.human_rating_items where rating_id = '${rating}' returning rating_id`)
    await insertItems(rating, [item(rating, 'opening', true, 4, [0]), item(rating, 'composure', false, null, [])])
    // Saving again with different answers replaces, it does not duplicate.
    await as(me, `delete from public.human_rating_items where rating_id = '${rating}' returning rating_id`)
    await insertItems(rating, [item(rating, 'opening', true, 2, [1])])
    const saved = await t.asUser(me, `select domain, observable, score, turn_refs from public.human_rating_items where rating_id = '${rating}'`)
    expect(saved).toEqual([{ domain: 'opening', observable: true, score: 2, turn_refs: [1] }])
  })

  it('the database itself refuses an observable domain without a turn, and a score on a not-observable one', async () => {
    await rejects(insertItems(rating, [item(rating, 'closing', true, 3, [])]), /check/i)
    await rejects(insertItems(rating, [item(rating, 'closing', false, 3, [])]), /check/i)
  })

  const DOMAINS = ['opening', 'questioning', 'active_listening', 'clinical_communication', 'objection_handling', 'style_adaptation', 'state_adaptation', 'composure', 'closing']
  const submitSql = (r: string) => `update public.human_ratings set status = 'submitted' where id = '${r}' and rater_id = '${me}' and status = 'draft' returning id`

  it('a 5 needs two turns as evidence, in the database as well as in the API', async () => {
    await rejects(insertItems(rating, [item(rating, 'closing', true, 5, [0])]), /check/i)
    await insertItems(rating, [item(rating, 'closing', true, 5, [0, 1])])
    await as(me, `delete from public.human_rating_items where rating_id = '${rating}' and domain = 'closing'`)
  })

  it('a partial rating cannot be submitted, even by a direct call that skips the API', async () => {
    await rejects(as(me, submitSql(rating)), /answers all nine domains/)
    expect(await t.asUser(me, `select status from public.human_ratings where id = '${rating}'`)).toEqual([{ status: 'draft' }])
  })

  it('submits once when all nine domains are answered; a second submit changes nothing (the store reports false)', async () => {
    await insertItems(rating, DOMAINS.filter(d => d !== 'opening').map(d => item(rating, d, d !== 'composure', d === 'composure' ? null : 3, d === 'composure' ? [] : [0])))
    expect(await as(me, submitSql(rating))).toHaveLength(1)
    expect(await as(me, submitSql(rating))).toEqual([])
    const [row] = await t.asUser(me, `select status, submitted_at from public.human_ratings where id = '${rating}'`) as { status: string; submitted_at: string | null }[]
    expect(row.status).toBe('submitted')
    expect(row.submitted_at).not.toBeNull()
  })

  it('a submitted rating and its items can no longer be changed or removed', async () => {
    // Row-level security hides a submitted rating from the draft-only update/delete policies: zero rows change, no error.
    expect(await as(me, `update public.human_ratings set unscorable = true where id = '${rating}' returning id`)).toEqual([])
    expect(await as(me, `delete from public.human_rating_items where rating_id = '${rating}' returning rating_id`)).toEqual([])
    await rejects(insertItems(rating, [item(rating, 'closing', true, 3, [0])]), /cannot change|row-level security/)
    expect(await t.asUser(me, `select unscorable from public.human_ratings where id = '${rating}'`)).toEqual([{ unscorable: false }])
    expect(await t.asUser(me, `select domain from public.human_rating_items where rating_id = '${rating}'`)).toHaveLength(9)
  })

  it('the other assessor cannot see this rating', async () => {
    expect(await t.asUser(other, `select id from public.human_ratings`)).toEqual([])
    expect(await t.asUser(other, `select rating_id from public.human_rating_items`)).toEqual([])
  })

  it('writes stop when the pilot is not running', async () => {
    await t.asService(`update public.validation_pilots set status = 'closed' where id = '${pilot}'`)
    await rejects(as(other, `insert into public.human_ratings (assignment_id, rater_id, rubric_version) values ('${theirs}','${other}','hrr-1.0.0')`), /row-level security/)
    await t.asService(`update public.validation_pilots set status = 'running' where id = '${pilot}'`)
  })
})

describe('assessor access ends with their membership or the pilot', () => {
  it('cases disappear when the pilot is closed, and when the assessor is removed from it', async () => {
    const list = `select assignment_id from public.validation_assessor_assignments where assessor_id = '${other}'`
    expect(await t.asUser(other, list)).toHaveLength(1)
    await t.asService(`update public.validation_pilots set status = 'closed' where id = '${pilot}'`)
    expect(await t.asUser(other, list)).toEqual([])
    expect(await t.asUser(admin, `select assignment_id from public.validation_assessor_assignments`)).toHaveLength(2)
    await t.asService(`update public.validation_pilots set status = 'running' where id = '${pilot}'`)
    expect(await t.asUser(other, list)).toHaveLength(1)
    await t.asService(`delete from public.validation_pilot_members where pilot_id = '${pilot}' and user_id = '${other}'`)
    expect(await t.asUser(other, list)).toEqual([])
  })

  it('an unscorable case can be submitted with no domain answers', async () => {
    await t.asService(`insert into public.validation_pilot_members (pilot_id, user_id, role) values ('${pilot}','${other}','assessor')`)
    const r = await as(other, `insert into public.human_ratings (assignment_id, rater_id, rubric_version, unscorable) values ('${theirs}','${other}','hrr-1.0.0', true) returning id`)
    const rid = (r[0] as { id: string }).id
    expect(await as(other, `update public.human_ratings set status = 'submitted' where id = '${rid}' returning id`)).toHaveLength(1)
  })
})
