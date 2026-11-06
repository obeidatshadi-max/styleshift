import { beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './supabaseTestDb'

/**
 * The validation tables (migration 20261106140000), attacked as each kind of user against a real Postgres.
 * The point is blindness and integrity: assessors cannot see each other or the rep, submitted ratings never change,
 * adjudications are append-only, and nobody adjudicates a case they rated.
 */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CO = id(1), CO_B = id(2)
const admin = id(11), assessorA = id(12), assessorB = id(13), adjud = id(14), dual = id(15)
const rep1 = id(21), rep2 = id(22), mgrA = id(31), mgrB = id(32), stranger = id(41)
const pilot = id(101), asg1 = id(111), asg2 = id(112)
const ratingOfA = id(201)

async function rejects(p: Promise<unknown>, match?: RegExp) {
  let msg: string | null = null
  try { await p } catch (e) { msg = (e as Error).message }
  expect(msg, 'the statement was allowed but should have been refused').not.toBeNull()
  if (match) expect(msg).toMatch(match)
}

let t: TestDb
beforeAll(async () => {
  t = await createTestDb()
  const users = [admin, assessorA, assessorB, adjud, dual, rep1, rep2, mgrA, mgrB, stranger]
  await t.db.exec(`insert into auth.users (id, email) select u, u::text || '@test.invalid' from unnest(array[${users.map(u => `'${u}'`).join(',')}]::uuid[]) u`)
  await t.asService(`insert into public.companies (id, name) values ('${CO}','A'),('${CO_B}','B')`)
  await t.asService(`insert into public.profiles (id, company_id, role, display_name) values
    ('${admin}','${CO}','manager','Admin'),('${assessorA}',null,'rep','Assessor A'),('${assessorB}',null,'rep','Assessor B'),
    ('${adjud}',null,'rep','Adjudicator'),('${dual}',null,'rep','Dual'),('${rep1}','${CO}','rep','Rep 1'),('${rep2}','${CO}','rep','Rep 2'),
    ('${mgrA}','${CO}','manager','Manager A'),('${mgrB}','${CO_B}','manager','Manager B'),('${stranger}',null,'rep','Stranger')`)
  await t.asService(`insert into public.validation_pilots (id, company_id, name, data_source, rubric_version, methodology_version, protocol_version, created_by)
    values ('${pilot}','${CO}','Pilot','synthetic','hrr-1.0.0','mm-1.0.0','bvp-1.0.0','${admin}')`)
  await t.asService(`insert into public.validation_pilot_members (pilot_id, user_id, role) values
    ('${pilot}','${admin}','administrator'),('${pilot}','${assessorA}','assessor'),('${pilot}','${assessorB}','assessor'),
    ('${pilot}','${adjud}','adjudicator'),('${pilot}','${dual}','assessor'),('${pilot}','${dual}','adjudicator')`)
  await t.asService(`insert into public.validation_assignments (id, pilot_id, rep_id, session_type, session_id, scenario_type, scenario_version, phase, seen_before) values
    ('${asg1}','${pilot}','${rep1}','human_partner','${id(301)}','A','v1','baseline',false),
    ('${asg2}','${pilot}','${rep2}','human_partner','${id(302)}','B','v1','followup',false)`)
  await t.asService(`insert into public.validation_assessor_assignments (assignment_id, assessor_id, pilot_id, scenario_type) values
    ('${asg1}','${assessorA}','${pilot}','A'),('${asg1}','${assessorB}','${pilot}','A'),('${asg2}','${assessorA}','${pilot}','B'),('${asg2}','${dual}','${pilot}','B')`)
}, 120000)

describe('who can see the pilot and its cases', () => {
  it('members read their pilot; reps, managers and outsiders do not', async () => {
    for (const u of [admin, assessorA, adjud]) expect(await t.asUser(u, `select id from public.validation_pilots`)).toHaveLength(1)
    for (const u of [rep1, mgrA, mgrB, stranger]) expect(await t.asUser(u, `select id from public.validation_pilots`), u).toEqual([])
  })
  it('an assessor sees only their own membership; the administrator sees all', async () => {
    expect(await t.asUser(assessorA, `select user_id from public.validation_pilot_members`)).toHaveLength(1)
    expect(await t.asUser(admin, `select user_id from public.validation_pilot_members`)).toHaveLength(6)
    expect(await t.asUser(rep1, `select user_id from public.validation_pilot_members`)).toEqual([])
  })
  it('a rep sees only their own assignment; an assessor and an adjudicator see none (no rep identity)', async () => {
    expect(await t.asUser(rep1, `select id from public.validation_assignments`)).toHaveLength(1)
    expect(await t.asUser(admin, `select id from public.validation_assignments`)).toHaveLength(2)
    for (const u of [assessorA, adjud, mgrA, mgrB]) expect(await t.asUser(u, `select id from public.validation_assignments`), u).toEqual([])
  })
  it('the assessor\'s case list holds no rep, phase or seen-before column', async () => {
    const cols = (await t.db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'validation_assessor_assignments'`)).rows.map(r => r.column_name)
    expect(cols).not.toContain('rep_id')
    expect(cols).not.toContain('phase')
    expect(cols).not.toContain('seen_before')
  })
  it('each assessor sees only their own cases', async () => {
    expect(await t.asUser(assessorA, `select assignment_id from public.validation_assessor_assignments`)).toHaveLength(2)
    expect(await t.asUser(assessorB, `select assignment_id from public.validation_assessor_assignments`)).toHaveLength(1)
    expect(await t.asUser(rep1, `select assignment_id from public.validation_assessor_assignments`)).toEqual([])
  })
  it('anonymous visitors have no access at all', async () => {
    for (const table of ['validation_pilots', 'validation_pilot_members', 'validation_assignments', 'validation_assessor_assignments', 'human_ratings', 'human_rating_items', 'rating_adjudications', 'claim_adjudications'])
      await rejects(t.asAnon(`select 1 from public.${table}`), /permission denied/)
  })
})

describe('writing a rating', () => {
  it('an assessor starts a draft on a case assigned to them', async () => {
    await t.asUser(assessorA, `insert into public.human_ratings (id, assignment_id, rater_id, rubric_version) values ('${ratingOfA}','${asg1}','${assessorA}','hrr-1.0.0')`, { commit: true })
  })
  it('not on a case that was not assigned to them', async () => {
    await rejects(t.asUser(assessorB, `insert into public.human_ratings (assignment_id, rater_id, rubric_version) values ('${asg2}','${assessorB}','hrr-1.0.0')`), /row-level security/)
  })
  it('not as someone who is not an assessor of the pilot', async () => {
    await rejects(t.asUser(adjud, `insert into public.human_ratings (assignment_id, rater_id, rubric_version) values ('${asg1}','${adjud}','hrr-1.0.0')`), /row-level security/)
    await rejects(t.asUser(rep1, `insert into public.human_ratings (assignment_id, rater_id, rubric_version) values ('${asg1}','${rep1}','hrr-1.0.0')`), /row-level security/)
  })
  it('not in the name of another rater, and not already submitted', async () => {
    await rejects(t.asUser(assessorB, `insert into public.human_ratings (assignment_id, rater_id, rubric_version) values ('${asg1}','${assessorA}','hrr-1.0.0')`), /row-level security/)
    await rejects(t.asUser(assessorB, `insert into public.human_ratings (assignment_id, rater_id, rubric_version, status, submitted_at) values ('${asg1}','${assessorB}','hrr-1.0.0','submitted',now())`), /row-level security/)
  })
  it('one rating per assessor per case', async () => {
    await rejects(t.asUser(assessorA, `insert into public.human_ratings (assignment_id, rater_id, rubric_version) values ('${asg1}','${assessorA}','hrr-1.0.0')`), /duplicate key/)
  })
  it('a draft keeps its case and rater', async () => {
    await rejects(t.asUser(assessorA, `update public.human_ratings set assignment_id = '${asg2}' where id = '${ratingOfA}'`), /keeps its case/)
  })
})

describe('the items of a rating', () => {
  it('an observable domain needs a score and at least one turn reference', async () => {
    await t.asUser(assessorA, `insert into public.human_rating_items (rating_id, domain, observable, score, turn_refs) values ('${ratingOfA}','opening',true,4,'{2}')`, { commit: true })
    await rejects(t.asUser(assessorA, `insert into public.human_rating_items (rating_id, domain, observable, score, turn_refs) values ('${ratingOfA}','questioning',true,3,'{}')`), /check/)
    await rejects(t.asUser(assessorA, `insert into public.human_rating_items (rating_id, domain, observable, score) values ('${ratingOfA}','questioning',true,null)`), /check/)
  })
  it('"not observable" holds no score, and a score is never 0 or above 5', async () => {
    await t.asUser(assessorA, `insert into public.human_rating_items (rating_id, domain, observable, score) values ('${ratingOfA}','composure',false,null)`, { commit: true })
    await rejects(t.asUser(assessorA, `insert into public.human_rating_items (rating_id, domain, observable, score) values ('${ratingOfA}','closing',false,1)`), /check/)
    await rejects(t.asUser(assessorA, `insert into public.human_rating_items (rating_id, domain, observable, score, turn_refs) values ('${ratingOfA}','closing',true,6,'{1}')`), /check/)
    await rejects(t.asUser(assessorA, `insert into public.human_rating_items (rating_id, domain, observable, score, turn_refs) values ('${ratingOfA}','closing',true,0,'{1}')`), /check/)
  })
  it('only the owner adds items, and only to a draft', async () => {
    await rejects(t.asUser(assessorB, `insert into public.human_rating_items (rating_id, domain, observable, score, turn_refs) values ('${ratingOfA}','closing',true,3,'{1}')`), /row-level security/)
  })
})

describe('blindness', () => {
  it('another assessor cannot see a draft, an administrator cannot either', async () => {
    expect(await t.asUser(assessorB, `select id from public.human_ratings`)).toEqual([])
    expect(await t.asUser(admin, `select id from public.human_ratings`)).toEqual([])
    expect(await t.asUser(adjud, `select id from public.human_ratings`)).toEqual([])
    expect(await t.asUser(assessorB, `select 1 from public.human_rating_items`)).toEqual([])
    expect(await t.asUser(admin, `select 1 from public.human_rating_items`)).toEqual([])
  })
  it('the owner sees their own draft and items', async () => {
    expect(await t.asUser(assessorA, `select id from public.human_ratings`)).toHaveLength(1)
    expect((await t.asUser(assessorA, `select 1 from public.human_rating_items`)).length).toBeGreaterThan(0)
  })
  it('after submission, other assessors, reps and managers still cannot see it; the administrator and adjudicator can', async () => {
    await t.asUser(assessorA, `update public.human_ratings set status = 'submitted', submitted_at = now() where id = '${ratingOfA}'`, { commit: true })
    for (const u of [assessorB, rep1, rep2, mgrA, mgrB, stranger]) {
      expect(await t.asUser(u, `select id from public.human_ratings`), `ratings as ${u}`).toEqual([])
      expect(await t.asUser(u, `select 1 from public.human_rating_items`), `items as ${u}`).toEqual([])
    }
    expect(await t.asUser(admin, `select id from public.human_ratings`)).toHaveLength(1)
    expect(await t.asUser(adjud, `select id from public.human_ratings`)).toHaveLength(1)
    expect((await t.asUser(adjud, `select 1 from public.human_rating_items`)).length).toBeGreaterThan(0)
  })
})

describe('a submitted rating never changes', () => {
  it('not the rating, not its items, for the assessor', async () => {
    expect(await t.asUser(assessorA, `update public.human_ratings set unscorable = true where id = '${ratingOfA}' returning id`)).toEqual([])
    await rejects(t.asUser(assessorA, `insert into public.human_rating_items (rating_id, domain, observable, score, turn_refs) values ('${ratingOfA}','closing',true,5,'{9}')`), /row-level security|submitted rating cannot change/)
    expect(await t.asUser(assessorA, `update public.human_rating_items set score = 1 where rating_id = '${ratingOfA}' returning domain`)).toEqual([])
    expect(await t.asUser(assessorA, `delete from public.human_rating_items where rating_id = '${ratingOfA}' returning domain`)).toEqual([])
  })
  it('not even for the server', async () => {
    await rejects(t.asService(`update public.human_ratings set unscorable = true where id = '${ratingOfA}'`), /submitted rating cannot change/)
    await rejects(t.asService(`update public.human_rating_items set score = 1 where rating_id = '${ratingOfA}'`), /submitted rating cannot change/)
    await rejects(t.asService(`insert into public.human_rating_items (rating_id, domain, observable, score, turn_refs) values ('${ratingOfA}','closing',true,5,'{9}')`), /submitted rating cannot change/)
  })
  it('a signed-in user cannot delete a rating (no delete privilege exists)', async () => {
    await rejects(t.asUser(assessorA, `delete from public.human_ratings where id = '${ratingOfA}'`), /permission denied/)
    await rejects(t.asUser(admin, `delete from public.human_ratings where id = '${ratingOfA}'`), /permission denied/)
  })
})

describe('adjudication', () => {
  const adjudicate = (who: string, assignment: string, domain: string, reason = 'raters differed by two points') =>
    `insert into public.rating_adjudications (assignment_id, domain, adjudicator_id, score, reason, original_rating_ids) values ('${assignment}','${domain}','${who}',3,'${reason}','{${id(901)},${id(902)}}')`

  it('an adjudicator records one for a case they did not rate', async () => {
    await t.asUser(adjud, adjudicate(adjud, asg1, 'opening'), { commit: true })
  })
  it('an assessor, an administrator and a rep cannot', async () => {
    for (const u of [assessorB, admin, rep1, mgrA]) await rejects(t.asUser(u, adjudicate(u, asg1, 'questioning')), /row-level security/)
  })
  it('nobody adjudicates in another person\'s name', async () => {
    await rejects(t.asUser(adjud, adjudicate(assessorA, asg1, 'questioning')), /row-level security/)
  })
  it('a person who rated a case cannot adjudicate it, but can adjudicate one they did not rate', async () => {
    await t.asUser(dual, `insert into public.human_ratings (assignment_id, rater_id, rubric_version) values ('${asg2}','${dual}','hrr-1.0.0')`, { commit: true })
    await rejects(t.asUser(dual, adjudicate(dual, asg2, 'opening')), /row-level security/)
    await t.asUser(dual, adjudicate(dual, asg1, 'closing'), { commit: true })
  })
  it('one adjudication per case and domain; at least two original ratings are cited', async () => {
    await rejects(t.asUser(adjud, adjudicate(adjud, asg1, 'opening')), /duplicate key/)
    await rejects(t.asUser(adjud, `insert into public.rating_adjudications (assignment_id, domain, adjudicator_id, score, reason, original_rating_ids) values ('${asg1}','composure','${adjud}',3,'x','{${id(901)}}')`), /check/)
  })
  it('an adjudication can never be edited, and a signed-in user cannot delete it', async () => {
    await rejects(t.asUser(adjud, `update public.rating_adjudications set score = 5 where assignment_id = '${asg1}'`), /permission denied|cannot be edited/)
    await rejects(t.asService(`update public.rating_adjudications set score = 5 where assignment_id = '${asg1}'`), /cannot be edited/)
    await rejects(t.asUser(adjud, `delete from public.rating_adjudications where assignment_id = '${asg1}'`), /permission denied/)
  })
  it('only administrators and adjudicators read them', async () => {
    expect((await t.asUser(admin, `select id from public.rating_adjudications`)).length).toBeGreaterThan(0)
    for (const u of [assessorB, rep1, mgrA, stranger]) expect(await t.asUser(u, `select id from public.rating_adjudications`), u).toEqual([])
  })
})

describe('claim verdicts', () => {
  const verdict = (who: string, v: string) =>
    `insert into public.claim_adjudications (assignment_id, claim_ref, certainty, verdict, adjudicator_id) values ('${asg1}','performance[0]','stated','${v}','${who}')`
  it('an adjudicator records one; an assessor cannot; the verdict must be one of three', async () => {
    await t.asUser(adjud, verdict(adjud, 'unsupported'), { commit: true })
    await rejects(t.asUser(assessorB, verdict(assessorB, 'supported')), /row-level security/)
    await rejects(t.asUser(adjud, verdict(adjud, 'maybe')), /check/)
  })
  it('it cannot be edited afterwards', async () => {
    await rejects(t.asService(`update public.claim_adjudications set verdict = 'supported'`), /cannot be edited/)
  })
})

describe('withdrawal', () => {
  it('deleting a rep through the server removes their case and its ratings and adjudications, and nobody else\'s', async () => {
    await t.asService(`delete from public.profiles where id = '${rep1}'`)
    expect(await t.asService(`select id from public.validation_assignments`)).toHaveLength(1)
    expect(await t.asService(`select id from public.human_ratings where assignment_id = '${asg1}'`)).toEqual([])
    expect(await t.asService(`select id from public.rating_adjudications where assignment_id = '${asg1}'`)).toEqual([])
    expect((await t.asService(`select id from public.human_ratings where assignment_id = '${asg2}'`)).length).toBe(1)
  })
})
