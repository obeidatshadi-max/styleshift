import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './supabaseTestDb'

/**
 * Attacks run against a real Postgres with every migration loaded, as a signed-in user, an anonymous
 * visitor and the service role. They check the database's own controls (policies, triggers, constraints),
 * not just the API layer in front of it.
 *
 * Read the limits in supabaseTestDb.ts: doctors, doctor_visits and daily_challenges are stand-ins.
 */

const HARDENING = '20261106120000_security_hardening.sql'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const A = id(1), B = id(2)                       // companies
const mgrA = id(11), repA1 = id(12), repA2 = id(13)
const mgrB = id(21), repB1 = id(22)
const loner = id(31)                             // a signed-in rep with no company yet
const asgA = id(101), asgB = id(102)             // one assignment per company
const groupB = id(201)

async function insertRow(t: TestDb, table: string, values: Record<string, unknown>): Promise<void> {
  // Fill any NOT NULL column without a default, so tests only spell out what matters to them.
  const cols = await t.db.query<{ column_name: string; data_type: string }>(
    `select column_name, data_type from information_schema.columns c where table_schema='public' and table_name=$1 and is_nullable='NO' and column_default is null and not is_generated='ALWAYS' order by ordinal_position`, [table])
  const fill: Record<string, string> = {}
  for (const c of cols.rows) {
    if (c.column_name in values) continue
    fill[c.column_name] = c.data_type === 'uuid' ? 'gen_random_uuid()' : /int|numeric|double|real/.test(c.data_type) ? '0' : c.data_type === 'boolean' ? 'false'
      : /timestamp/.test(c.data_type) ? 'now()' : c.data_type === 'date' ? 'current_date' : c.data_type === 'jsonb' ? `'{}'::jsonb` : c.data_type === 'ARRAY' ? `'{}'` : `'x'`
  }
  const lit = (v: unknown) => v === null ? 'null' : typeof v === 'boolean' || typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`
  const names = [...Object.keys(values), ...Object.keys(fill)]
  const vals = [...Object.values(values).map(lit), ...Object.values(fill)]
  try { await t.asService(`insert into public.${table} (${names.join(',')}) values (${vals.join(',')})`) }
  catch (e) { throw new Error(`seed ${table}: ${(e as Error).message}`) }
}

async function seed(t: TestDb) {
  await t.db.exec(`insert into auth.users (id, email) select u, u::text || '@test.invalid' from unnest(array['${mgrA}','${repA1}','${repA2}','${mgrB}','${repB1}','${loner}']::uuid[]) u`)
  await t.asService(`insert into public.companies (id, name) values ('${A}','Company A'),('${B}','Company B')`)
  await t.asService(`insert into public.profiles (id, company_id, role, display_name) values
    ('${mgrA}','${A}','manager','Mgr A'),('${repA1}','${A}','rep','Rep A1'),('${repA2}','${A}','rep','Rep A2'),
    ('${mgrB}','${B}','manager','Mgr B'),('${repB1}','${B}','rep','Rep B1'),('${loner}',null,'rep','Loner')`)
  await insertRow(t, 'groups', { id: groupB, owner_id: repB1, name: 'B team' })
  await insertRow(t, 'assignments', { id: asgA, company_id: A, created_by: mgrA, target_type: 'level', target_key: '1' })
  await insertRow(t, 'assignments', { id: asgB, company_id: B, created_by: mgrB, target_type: 'level', target_key: '1' })
  // One private row per rep-owned table, all belonging to rep A1.
  await insertRow(t, 'roleplay_sessions', { rep_id: repA1, duration_sec: 60, talk_ratio: 0.5, question_ratio: 0.3 })
  await insertRow(t, 'conversation_turns', { rep_id: repA1, role: 'rep', text: 'PRIVATE VOICE PRACTICE LINE', turn_index: 0 })
  await insertRow(t, 'agent_sessions', { rep_id: repA1, phase: 'ended' })
  await insertRow(t, 'coach_debriefs', { rep_id: repA1 })
  await insertRow(t, 'customer_visits', { rep_id: repA1 })
  await insertRow(t, 'sessions', { rep_id: repA1, level: 1 })
}

async function rejects(p: Promise<unknown>, match?: RegExp) {
  let msg: string | null = null
  try { await p } catch (e) { msg = (e as Error).message }
  expect(msg, 'the statement was allowed but should have been refused').not.toBeNull()
  if (match) expect(msg).toMatch(match)
}

describe('database security: every migration applied', () => {
  let t: TestDb
  beforeAll(async () => { t = await createTestDb(); await seed(t) }, 120000)

  it('every migration loads on a clean database', () => {
    expect(t.migrations.filter(m => !m.ok)).toEqual([])
  })

  it('every table in public has row level security on', async () => {
    const rows = await t.db.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`)
    expect(rows.rows).toEqual([])
  })

  describe('role escalation and tenant moves (profiles)', () => {
    it('a rep cannot make themselves a manager', async () => {
      await rejects(t.asUser(repA1, `update public.profiles set role = 'manager' where id = '${repA1}'`), /server/)
    })
    it('a rep cannot move themselves into another company', async () => {
      await rejects(t.asUser(repA1, `update public.profiles set company_id = '${B}' where id = '${repA1}'`), /server/)
    })
    it('a rep without a company cannot give themselves one', async () => {
      await rejects(t.asUser(loner, `update public.profiles set company_id = '${A}' where id = '${loner}'`), /server/)
    })
    it('a new sign-up cannot create a profile that is already a manager or already in a company', async () => {
      const fresh = id(41)
      await rejects(t.asUser(fresh, `insert into public.profiles (id, role, display_name) values ('${fresh}','manager','x')`), /server/)
      await rejects(t.asUser(fresh, `insert into public.profiles (id, company_id, role, display_name) values ('${fresh}','${A}','rep','x')`), /server/)
    })
    it('a rep cannot join a group of another company by setting group_id', async () => {
      await rejects(t.asUser(repA1, `update public.profiles set group_id = '${groupB}' where id = '${repA1}'`), /server/)
    })
    it('a manager cannot promote or move a rep either', async () => {
      await rejects(t.asUser(mgrA, `update public.profiles set role = 'manager' where id = '${repA1}'`), /server/)
      await rejects(t.asUser(mgrA, `update public.profiles set company_id = '${B}' where id = '${repA1}'`), /server/)
    })
    it('a rep cannot edit someone else\'s profile', async () => {
      const r = await t.asUser(repA1, `update public.profiles set display_name = 'hacked' where id = '${repA2}' returning id`)
      expect(r).toEqual([])
    })
    it('the server (service role) can still set role, company and group', async () => {
      await t.asService(`update public.profiles set group_id = '${groupB}' where id = '${repB1}'`)
      await t.asService(`update public.profiles set group_id = null where id = '${repB1}'`)
    })
    it('ordinary self-service fields still work', async () => {
      const r = await t.asUser(repA1, `update public.profiles set display_name = 'Rep A1 renamed', xp = 5 where id = '${repA1}' returning id`)
      expect(r).toHaveLength(1)
    })
  })

  describe('anonymous visitors', () => {
    it('cannot read profiles, sessions, debriefs or transcripts', async () => {
      for (const table of ['profiles', 'roleplay_sessions', 'conversation_turns', 'coach_debriefs', 'agent_sessions', 'customer_visits', 'transcript_segments', 'conversation_reports', 'coaching_followups']) {
        const rows = await t.asAnon(`select 1 from public.${table} limit 1`).catch(() => [])
        expect(rows, table).toEqual([])
      }
    })
    it('cannot create a company', async () => {
      await rejects(t.asAnon(`insert into public.companies (name) values ('spam')`))
    })
  })

  describe('a signed-in user and companies', () => {
    it('cannot create a company', async () => {
      await rejects(t.asUser(loner, `insert into public.companies (name) values ('spam')`))
      await rejects(t.asUser(repA1, `insert into public.companies (name) values ('spam')`))
    })
    it('cannot read or edit another company', async () => {
      expect(await t.asUser(repA1, `select id from public.companies where id = '${B}'`)).toEqual([])
      expect(await t.asUser(mgrA, `update public.companies set name = 'hacked' where id = '${B}' returning id`)).toEqual([])
    })
  })

  describe('private practice data', () => {
    const owned = ['roleplay_sessions', 'conversation_turns', 'agent_sessions', 'coach_debriefs', 'customer_visits']
    it('the owner can read their own rows', async () => {
      for (const table of owned) expect((await t.asUser(repA1, `select 1 from public.${table}`)).length, table).toBeGreaterThan(0)
    })
    it('another rep in the same company cannot', async () => {
      for (const table of owned) expect(await t.asUser(repA2, `select 1 from public.${table}`), table).toEqual([])
    })
    it('a rep or manager of another company cannot', async () => {
      for (const who of [repB1, mgrB]) for (const table of owned) expect(await t.asUser(who, `select 1 from public.${table}`), `${table} as ${who}`).toEqual([])
    })
    it('a manager cannot read private text simulations or coach debriefs that were not shared', async () => {
      for (const table of ['agent_sessions', 'coach_debriefs']) expect(await t.asUser(mgrA, `select 1 from public.${table}`), table).toEqual([])
    })
    it('a manager cannot read a rep\'s raw voice-practice transcript text', async () => {
      expect(await t.asUser(mgrA, `select text from public.conversation_turns`)).toEqual([])
    })
    it('a rep cannot write a row that claims to belong to someone else', async () => {
      await rejects(t.asUser(repA2, `insert into public.coach_debriefs (rep_id) values ('${repA1}')`), /row-level security/)
    })
  })

  describe('game sessions (the manager-read rule on sessions)', () => {
    it('the rep can read their own, a manager of their company can read them', async () => {
      expect(await t.asUser(repA1, `select id from public.sessions`)).toHaveLength(1)
      expect(await t.asUser(mgrA, `select id from public.sessions`)).toHaveLength(1)
    })
    // Production's rule looks broad (company membership only) but is safe: its subquery on profiles is itself
    // filtered by row security, so a rep only ever matches their own id. Kept as a regression test.
    it('a teammate who is not a manager cannot read them', async () => {
      expect(await t.asUser(repA2, `select id from public.sessions`)).toEqual([])
    })
    it('nobody from another company can read them', async () => {
      expect(await t.asUser(repB1, `select id from public.sessions`)).toEqual([])
      expect(await t.asUser(mgrB, `select id from public.sessions`)).toEqual([])
    })
  })

  describe('profiles are readable only as intended', () => {
    it('a rep reads their own profile and no teammate\'s', async () => {
      expect((await t.asUser(repA1, `select id from public.profiles`)).map(r => r.id)).toEqual([repA1])
    })
    it('a manager reads their own company\'s profiles and no other company\'s', async () => {
      const ids = (await t.asUser(mgrA, `select id from public.profiles`)).map(r => r.id)
      expect(ids).toContain(repA1)
      expect(ids).not.toContain(repB1)
      expect(ids).not.toContain(mgrB)
    })
  })

  describe('assignments across companies', () => {
    it('a rep cannot create or change an assignment', async () => {
      await rejects(t.asUser(repA1, `insert into public.assignments (company_id, created_by, target_type, target_key) values ('${A}','${repA1}','level','1')`), /row-level security/)
      expect(await t.asUser(repA1, `update public.assignments set active = false where id = '${asgA}' returning id`)).toEqual([])
    })
    it('a manager cannot create an assignment in another company', async () => {
      await rejects(t.asUser(mgrA, `insert into public.assignments (company_id, created_by, target_type, target_key) values ('${B}','${mgrA}','level','1')`), /row-level security/)
    })
    it('a manager can still create one in their own company', async () => {
      const r = await t.asUser(mgrA, `insert into public.assignments (company_id, created_by, target_type, target_key) values ('${A}','${mgrA}','level','2') returning id`)
      expect(r).toHaveLength(1)
    })
    it('a rep cannot see another company\'s assignments', async () => {
      expect(await t.asUser(repA1, `select id from public.assignments where company_id = '${B}'`)).toEqual([])
    })
    it('a rep cannot write progress or replies against another company\'s assignment', async () => {
      await rejects(t.asUser(repA1, `insert into public.assignment_progress (assignment_id, rep_id) values ('${asgB}','${repA1}')`), /row-level security/)
      await rejects(t.asUser(repA1, `insert into public.assignment_replies (assignment_id, rep_id, kind, note_text) values ('${asgB}','${repA1}','note','hi')`), /row-level security/)
    })
    it('a rep can still write progress and replies for their own company\'s assignment', async () => {
      await t.asUser(repA1, `insert into public.assignment_progress (assignment_id, rep_id) values ('${asgA}','${repA1}')`, { commit: true })
      await t.asUser(repA1, `insert into public.assignment_replies (assignment_id, rep_id, kind, note_text) values ('${asgA}','${repA1}','note','done')`, { commit: true })
    })
  })

  describe('coaching follow-ups and field evidence', () => {
    const fu = id(301)
    beforeAll(async () => {
      await insertRow(t, 'coaching_followups', { id: fu, company_id: A, rep_id: repA1, created_by: mgrA, drill_kind: 'micro_practice' })
    })
    it('a rep cannot record "verified" field evidence about themselves', async () => {
      await rejects(t.asUser(repA1, `insert into public.coaching_field_checks (followup_id, company_id, rep_id, kind, recorded_by, observed) values ('${fu}','${A}','${repA1}','verified','${repA1}','seen')`))
    })
    it('nobody can write field evidence straight into the table, not even a manager (server only)', async () => {
      await rejects(t.asUser(mgrA, `insert into public.coaching_field_checks (followup_id, company_id, rep_id, kind, recorded_by, observed) values ('${fu}','${A}','${repA1}','verified','${mgrA}','seen')`), /row-level security/)
    })
    it('even the server cannot make a rep the author of a verified check', async () => {
      await rejects(t.asService(`insert into public.coaching_field_checks (followup_id, company_id, rep_id, kind, recorded_by, observed) values ('${fu}','${A}','${repA1}','verified','${repA1}','seen')`), /field_check_author_matches_kind/)
    })
    it('nobody can create, change or delete follow-ups directly', async () => {
      await rejects(t.asUser(mgrA, `insert into public.coaching_followups (company_id, rep_id, created_by, drill_kind) values ('${A}','${repA2}','${mgrA}','micro_practice')`), /row-level security/)
      expect(await t.asUser(repA1, `update public.coaching_followups set closed_at = now() where id = '${fu}' returning id`)).toEqual([])
      expect(await t.asUser(mgrA, `delete from public.coaching_followups where id = '${fu}' returning id`)).toEqual([])
    })
    it('the rep and their own manager can read it; another rep, another company cannot', async () => {
      expect(await t.asUser(repA1, `select id from public.coaching_followups`)).toHaveLength(1)
      expect(await t.asUser(mgrA, `select id from public.coaching_followups`)).toHaveLength(1)
      expect(await t.asUser(repA2, `select id from public.coaching_followups`)).toEqual([])
      expect(await t.asUser(mgrB, `select id from public.coaching_followups`)).toEqual([])
    })
  })

  describe('manager-visible team data stays inside the company', () => {
    it('a manager sees their own reps\' practice scores and no one else\'s', async () => {
      expect((await t.asUser(mgrA, `select id from public.roleplay_sessions`)).length).toBeGreaterThan(0)
      expect(await t.asUser(mgrB, `select id from public.roleplay_sessions`)).toEqual([])
    })
    it('a manager cannot read another company\'s profiles', async () => {
      const rows = await t.asUser(mgrA, `select id from public.profiles where company_id = '${B}'`)
      expect(rows).toEqual([])
    })
  })

  describe('immutable records', () => {
    it('nobody can edit or remove an audit event, even the server', async () => {
      await t.asService(`insert into public.audit_events (company_id, actor_id, action, subject_type, subject_id) values ('${A}','${mgrA}','test.event','rep','${repA1}')`)
      await rejects(t.asService(`update public.audit_events set action = 'x'`), /append-only/)
      await rejects(t.asService(`delete from public.audit_events`), /append-only/)
    })
    it('a rep cannot touch audit events or certificates directly', async () => {
      await rejects(t.asUser(repA1, `insert into public.audit_events (company_id, actor_id, action, subject_type, subject_id) values ('${A}','${repA1}','x','rep','${repA1}')`))
      await rejects(t.asUser(repA1, `insert into public.certifications (company_id, rep_id, rep_name, program_name, criteria, evidence, criteria_met, verify_code, issued_by) values ('${A}','${repA1}','x','x','{}','{}',true,'ABCDEFGHJKMN','${repA1}')`))
    })
  })
})

describe('production as it is today, WITHOUT the hardening migration (proves the tests can fail)', () => {
  let t: TestDb
  beforeAll(async () => { t = await createTestDb({ skip: [HARDENING] }); await seed(t) }, 120000)

  it('a rep could write progress against another company\'s assignment', async () => {
    expect(await t.asUser(repA1, `insert into public.assignment_progress (assignment_id, rep_id) values ('${asgB}','${repA1}') returning rep_id`)).toHaveLength(1)
  })
  it('a manager could read a rep\'s raw voice-practice transcript text', async () => {
    expect((await t.asUser(mgrA, `select text from public.conversation_turns`)).map(r => r.text)).toContain('PRIVATE VOICE PRACTICE LINE')
  })
  it('a rep could set their group to another company\'s group', async () => {
    expect(await t.asUser(repA1, `update public.profiles set group_id = '${groupB}' where id = '${repA1}' returning id`)).toHaveLength(1)
  })
  it('role escalation was already closed by the earlier migration', async () => {
    await rejects(t.asUser(repA1, `update public.profiles set role = 'manager' where id = '${repA1}'`), /server/)
  })
})

afterAll(() => undefined)
