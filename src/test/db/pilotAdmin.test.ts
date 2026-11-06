import { beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './supabaseTestDb'

/**
 * The statements src/lib/validation/pilot-admin-store.ts sends, replayed against the real tables. Writes run as the
 * server (service role: these tables have no write policy for signed-in users); the administrator check and the
 * assessor's view run as signed-in users. Proves the store's inserts satisfy every constraint and trigger, and that
 * signed-in users cannot do the administrator's writes themselves.
 */
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CO = id(1), mgr = id(11), a1 = id(12), a2 = id(13), rep = id(21), other = id(31)
const session = id(301)

async function rejects(p: Promise<unknown>, match: RegExp) {
  let msg: string | null = null
  try { await p } catch (e) { msg = (e as Error).message }
  expect(msg, 'the statement was allowed but should have been refused').not.toBeNull()
  expect(msg).toMatch(match)
}

let t: TestDb
let pilot = '', assignment = ''

beforeAll(async () => {
  t = await createTestDb()
  await t.db.exec(`insert into auth.users (id, email) select u, u::text || '@test.invalid' from unnest(array['${mgr}','${a1}','${a2}','${rep}','${other}']::uuid[]) u`)
  await t.asService(`insert into public.companies (id, name) values ('${CO}','A')`)
  await t.asService(`insert into public.profiles (id, company_id, role, display_name) values
    ('${mgr}','${CO}','manager','Mgr'),('${a1}','${CO}','rep','A1'),('${a2}','${CO}','rep','A2'),('${rep}','${CO}','rep','Rep'),('${other}',null,'rep','Other')`)
  await t.asService(`insert into public.conversation_turns (session_id, rep_id, turn_index, role, text) values ('${session}','${rep}',0,'doctor','hi'),('${session}','${rep}',1,'rep','hello')`)
}, 120000)

describe('pilot administration against the real tables', () => {
  it('creates a pilot with its administrator, as the server does', async () => {
    const [p] = await t.asService<{ id: string }>(`insert into public.validation_pilots (company_id, name, data_source, rubric_version, methodology_version, protocol_version, created_by)
      values ('${CO}','Pilot','synthetic','hrr-1.0.0','mm-1.0.0','bvp-1.0.0','${mgr}') returning id`)
    pilot = p.id
    await t.asService(`insert into public.validation_pilot_members (pilot_id, user_id, role) values ('${pilot}','${mgr}','administrator')`)
    expect(await t.asUser(mgr, `select pilot_id from public.validation_pilot_members where user_id = '${mgr}' and role = 'administrator'`)).toEqual([{ pilot_id: pilot }])
    expect(await t.asUser(other, `select pilot_id from public.validation_pilot_members where role = 'administrator'`)).toEqual([])
  })

  it('a signed-in user, even the administrator, cannot write these tables themselves', async () => {
    await rejects(t.asUser(mgr, `insert into public.validation_pilot_members (pilot_id, user_id, role) values ('${pilot}','${a1}','assessor')`), /permission denied|row-level security/)
    await rejects(t.asUser(mgr, `update public.validation_pilots set status = 'running' where id = '${pilot}'`), /permission denied|row-level security/)
    await rejects(t.asUser(a1, `insert into public.validation_pilots (company_id, name, data_source, rubric_version, methodology_version, protocol_version, created_by) values ('${CO}','x','synthetic','a','b','c','${a1}')`), /permission denied|row-level security/)
  })

  it('the database refuses an administrator who is also an assessor, and a repeated role', async () => {
    await rejects(t.asService(`insert into public.validation_pilot_members (pilot_id, user_id, role) values ('${pilot}','${mgr}','assessor')`), /administrator cannot also be an assessor/)
    await t.asService(`insert into public.validation_pilot_members (pilot_id, user_id, role) values ('${pilot}','${a1}','assessor'),('${pilot}','${a2}','assessor')`)
    await rejects(t.asService(`insert into public.validation_pilot_members (pilot_id, user_id, role) values ('${pilot}','${a1}','assessor')`), /duplicate key/)
  })

  it('adds a case and its two assessors; the assessors see the case, de-identified', async () => {
    const [a] = await t.asService<{ id: string }>(`insert into public.validation_assignments (pilot_id, rep_id, session_type, session_id, scenario_type, scenario_version, phase, seen_before)
      values ('${pilot}','${rep}','ai_doctor_text','${session}','A','v1','baseline',false) returning id`)
    assignment = a.id
    await t.asService(`insert into public.validation_assessor_assignments (assignment_id, assessor_id, pilot_id, scenario_type) values ('${assignment}','${a1}','${pilot}','A'),('${assignment}','${a2}','${pilot}','A')`)
    // Nothing is visible to assessors until the pilot runs.
    expect(await t.asUser(a1, `select assignment_id from public.validation_assessor_assignments where assessor_id = '${a1}'`)).toEqual([])
    await t.asService(`update public.validation_pilots set status = 'running' where id = '${pilot}'`)
    expect(await t.asUser(a1, `select assignment_id, scenario_type from public.validation_assessor_assignments where assessor_id = '${a1}'`)).toEqual([{ assignment_id: assignment, scenario_type: 'A' }])
  })

  it('refuses the same session twice in one pilot', async () => {
    await rejects(t.asService(`insert into public.validation_assignments (pilot_id, rep_id, session_type, session_id, scenario_type, scenario_version, phase, seen_before)
      values ('${pilot}','${rep}','ai_doctor_text','${session}','B','v1','followup',true)`), /duplicate key/)
  })

  it('removing the compensating insert leaves nothing behind: a case is deleted with its assessor links', async () => {
    const [a] = await t.asService<{ id: string }>(`insert into public.validation_assignments (pilot_id, rep_id, session_type, session_id, scenario_type, scenario_version, phase, seen_before)
      values ('${pilot}','${rep}','ai_doctor_voice','${id(302)}','C','v1','followup',true) returning id`)
    await t.asService(`insert into public.validation_assessor_assignments (assignment_id, assessor_id, pilot_id, scenario_type) values ('${a.id}','${a1}','${pilot}','C')`)
    await t.asService(`delete from public.validation_assignments where id = '${a.id}'`)
    expect(await t.asService(`select 1 from public.validation_assessor_assignments where assignment_id = '${a.id}'`)).toEqual([])
  })

  it('the session-ownership lookups the store uses find real sessions of the right rep only', async () => {
    expect(await t.asService(`select id from public.conversation_turns where session_id = '${session}' and rep_id = '${rep}' limit 1`)).toHaveLength(1)
    expect(await t.asService(`select id from public.conversation_turns where session_id = '${session}' and rep_id = '${a1}' limit 1`)).toEqual([])
  })
})

describe('access follows the person\'s current company and role', () => {
  const listCases = (u: string) => t.asUser(u, `select assignment_id from public.validation_assessor_assignments where assessor_id = '${u}'`)
  const seesPilot = (u: string) => t.asUser(u, `select id from public.validation_pilots`)

  it('an assessor who leaves the company loses the pilot and the case at once, and gets them back if they return', async () => {
    expect(await listCases(a1)).toHaveLength(1)
    await t.asService(`update public.profiles set company_id = null where id = '${a1}'`)
    expect(await listCases(a1)).toEqual([])
    expect(await seesPilot(a1)).toEqual([])
    await t.asService(`update public.profiles set company_id = '${CO}' where id = '${a1}'`)
    expect(await listCases(a1)).toHaveLength(1)
  })

  it('an administrator who is no longer a manager, or has left the company, loses the administrator\'s view', async () => {
    expect(await seesPilot(mgr)).toHaveLength(1)
    await t.asService(`update public.profiles set role = 'rep' where id = '${mgr}'`)
    expect(await seesPilot(mgr)).toEqual([])
    expect(await t.asUser(mgr, `select assignment_id from public.validation_assessor_assignments`)).toEqual([])
    await t.asService(`update public.profiles set role = 'manager', company_id = null where id = '${mgr}'`)
    expect(await seesPilot(mgr)).toEqual([])
    await t.asService(`update public.profiles set company_id = '${CO}' where id = '${mgr}'`)
    expect(await seesPilot(mgr)).toHaveLength(1)
  })
})

describe('a representative of the pilot is never one of its members', () => {
  it('cannot be added as a member, in any role, once they are a representative', async () => {
    for (const role of ['assessor', 'adjudicator']) {
      await rejects(t.asService(`insert into public.validation_pilot_members (pilot_id, user_id, role) values ('${pilot}','${rep}','${role}')`), /cannot also be a member/)
    }
  })

  it('cannot become a representative once they are a member', async () => {
    await rejects(t.asService(`insert into public.validation_assignments (pilot_id, rep_id, session_type, session_id, scenario_type, scenario_version, phase, seen_before)
      values ('${pilot}','${a1}','ai_doctor_text','${id(399)}','D','v1','baseline',false)`), /cannot also be a representative/)
  })

  it('counts as a conflict for adjudication and sees no other rater\'s ratings of their own case, even as an administrator', async () => {
    // Force the overlap past the trigger to prove the policies hold on their own (as a data-repair or old row would).
    await t.db.exec(`alter table public.validation_pilot_members disable trigger validation_pilot_members_rep_overlap;
      insert into public.validation_pilot_members (pilot_id, user_id, role) values ('${pilot}','${rep}','adjudicator');
      alter table public.validation_pilot_members enable trigger validation_pilot_members_rep_overlap;`)
    await t.asService(`update public.profiles set company_id = '${CO}' where id = '${rep}'`)
    expect(await t.asUser(rep, `select public.validation_has_conflict('${assignment}') as c`)).toEqual([{ c: true }])
    expect(await t.asUser(rep, `select public.validation_blind_ok('${assignment}') as b`)).toEqual([{ b: false }])
  })
})
