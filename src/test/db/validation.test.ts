import { beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './supabaseTestDb'

/**
 * The validation tables (migration 20261106140000), attacked as each kind of user against a real Postgres.
 * The point is blindness and integrity: assessors cannot see each other or the rep, submitted ratings never change,
 * adjudications are append-only and cite real submitted ratings, nobody adjudicates a case they rate, and an erased
 * account or a deleted report never gets blocked by the append-only rule.
 */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CO = id(1), CO_B = id(2)
const admin = id(11), assessorA = id(12), assessorB = id(13), adjud = id(14), dual = id(15), ghost = id(16)
const rep1 = id(21), rep2 = id(22), mgrA = id(31), mgrB = id(32), stranger = id(41)
const pilot = id(101), asg1 = id(111), asg2 = id(112), asg3 = id(113)
const rA1 = id(201), rB1 = id(202), rA2 = id(203), rDual2 = id(204), rGhost2 = id(205), rA3 = id(206), rB3 = id(207)
const reportRep1 = id(401), reportOther = id(402)

async function rejects(p: Promise<unknown>, match?: RegExp) {
  let msg: string | null = null
  try { await p } catch (e) { msg = (e as Error).message }
  expect(msg, 'the statement was allowed but should have been refused').not.toBeNull()
  if (match) expect(msg).toMatch(match)
}

let t: TestDb
const draft = (rater: string, assignment: string, ratingId: string) =>
  t.asUser(rater, `insert into public.human_ratings (id, assignment_id, rater_id, rubric_version) values ('${ratingId}','${assignment}','${rater}','hrr-1.0.0')`, { commit: true })
const submit = (rater: string, ratingId: string) =>
  t.asUser(rater, `update public.human_ratings set status = 'submitted' where id = '${ratingId}' returning id`, { commit: true })

beforeAll(async () => {
  t = await createTestDb()
  const users = [admin, assessorA, assessorB, adjud, dual, ghost, rep1, rep2, mgrA, mgrB, stranger]
  await t.db.exec(`insert into auth.users (id, email) select u, u::text || '@test.invalid' from unnest(array[${users.map(u => `'${u}'`).join(',')}]::uuid[]) u`)
  await t.asService(`insert into public.companies (id, name) values ('${CO}','A'),('${CO_B}','B')`)
  await t.asService(`insert into public.profiles (id, company_id, role, display_name) values
    ('${admin}','${CO}','manager','Admin'),('${assessorA}',null,'rep','Assessor A'),('${assessorB}',null,'rep','Assessor B'),
    ('${adjud}',null,'rep','Adjudicator'),('${dual}',null,'rep','Dual'),('${ghost}',null,'rep','Ghost'),('${rep1}','${CO}','rep','Rep 1'),
    ('${rep2}','${CO}','rep','Rep 2'),('${mgrA}','${CO}','manager','Manager A'),('${mgrB}','${CO_B}','manager','Manager B'),('${stranger}',null,'rep','Stranger')`)
  await t.asService(`insert into public.validation_pilots (id, company_id, name, data_source, rubric_version, methodology_version, protocol_version, status, created_by)
    values ('${pilot}','${CO}','Pilot','synthetic','hrr-1.0.0','mm-1.0.0','bvp-1.0.0','running','${admin}')`)
  await t.asService(`insert into public.validation_pilot_members (pilot_id, user_id, role) values
    ('${pilot}','${admin}','administrator'),('${pilot}','${assessorA}','assessor'),('${pilot}','${assessorB}','assessor'),
    ('${pilot}','${adjud}','adjudicator'),('${pilot}','${dual}','assessor'),('${pilot}','${dual}','adjudicator'),('${pilot}','${ghost}','assessor')`)
  await t.asService(`insert into public.validation_assignments (id, pilot_id, rep_id, session_type, session_id, scenario_type, scenario_version, phase, seen_before) values
    ('${asg1}','${pilot}','${rep1}','human_partner','${id(301)}','A','v1','baseline',false),
    ('${asg2}','${pilot}','${rep2}','human_partner','${id(302)}','B','v1','followup',false),
    ('${asg3}','${pilot}','${rep2}','human_partner','${id(303)}','C','v1','followup',false)`)
  await t.asService(`insert into public.validation_assessor_assignments (assignment_id, assessor_id, pilot_id, scenario_type) values
    ('${asg1}','${assessorA}','${pilot}','A'),('${asg1}','${assessorB}','${pilot}','A'),('${asg1}','${dual}','${pilot}','A'),
    ('${asg2}','${assessorA}','${pilot}','B'),('${asg2}','${dual}','${pilot}','B'),('${asg2}','${ghost}','${pilot}','B'),
    ('${asg3}','${assessorA}','${pilot}','C'),('${asg3}','${assessorB}','${pilot}','C')`)
}, 120000)

describe('who can see the pilot and its cases', () => {
  it('members read their pilot; reps, managers and outsiders do not', async () => {
    for (const u of [admin, assessorA, adjud]) expect(await t.asUser(u, `select id from public.validation_pilots`)).toHaveLength(1)
    for (const u of [rep1, mgrA, mgrB, stranger]) expect(await t.asUser(u, `select id from public.validation_pilots`), u).toEqual([])
  })
  it('an assessor sees only their own membership; the administrator sees all', async () => {
    expect(await t.asUser(assessorA, `select user_id from public.validation_pilot_members`)).toHaveLength(1)
    expect(await t.asUser(admin, `select user_id from public.validation_pilot_members`)).toHaveLength(7)
    expect(await t.asUser(rep1, `select user_id from public.validation_pilot_members`)).toEqual([])
  })
  it('a rep sees only their own assignments; an assessor and an adjudicator see none (no rep identity)', async () => {
    expect(await t.asUser(rep1, `select id from public.validation_assignments`)).toHaveLength(1)
    expect(await t.asUser(admin, `select id from public.validation_assignments`)).toHaveLength(3)
    for (const u of [assessorA, adjud, dual, mgrA, mgrB]) expect(await t.asUser(u, `select id from public.validation_assignments`), u).toEqual([])
  })
  it('the assessor\'s case list holds no rep, phase or seen-before column', async () => {
    const cols = (await t.db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'validation_assessor_assignments'`)).rows.map(r => r.column_name)
    expect(cols).not.toContain('rep_id')
    expect(cols).not.toContain('phase')
    expect(cols).not.toContain('seen_before')
  })
  it('each assessor sees only their own cases', async () => {
    expect(await t.asUser(assessorA, `select assignment_id from public.validation_assessor_assignments`)).toHaveLength(3)
    expect(await t.asUser(assessorB, `select assignment_id from public.validation_assessor_assignments`)).toHaveLength(2)
    expect(await t.asUser(rep1, `select assignment_id from public.validation_assessor_assignments`)).toEqual([])
  })
  it('anonymous visitors have no access at all', async () => {
    for (const table of ['validation_pilots', 'validation_pilot_members', 'validation_assignments', 'validation_assessor_assignments', 'human_ratings', 'human_rating_items', 'rating_adjudications', 'claim_adjudications'])
      await rejects(t.asAnon(`select 1 from public.${table}`), /permission denied/)
  })
})

describe('separation of duties among members', () => {
  it('an administrator cannot also be an assessor in the same pilot, in either order', async () => {
    await rejects(t.asService(`insert into public.validation_pilot_members (pilot_id, user_id, role) values ('${pilot}','${admin}','assessor')`), /administrator cannot also be an assessor/)
    await rejects(t.asService(`insert into public.validation_pilot_members (pilot_id, user_id, role) values ('${pilot}','${assessorA}','administrator')`), /administrator cannot also be an assessor/)
  })
  it('an assessor who is also an adjudicator is allowed (a small pilot needs a third rater)', async () => {
    expect(await t.asService(`select role from public.validation_pilot_members where user_id = '${dual}'`)).toHaveLength(2)
  })
})

describe('writing a rating', () => {
  it('an assessor starts a draft on a case assigned to them', async () => { await draft(assessorA, asg1, rA1) })
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
  it('a draft keeps its case, rater and creation time', async () => {
    await rejects(t.asUser(assessorA, `update public.human_ratings set assignment_id = '${asg2}' where id = '${rA1}'`), /keeps its case/)
    await rejects(t.asUser(assessorA, `update public.human_ratings set created_at = '2001-01-01' where id = '${rA1}'`), /keeps its case/)
  })
  it('writes need the pilot to be running', async () => {
    await t.asService(`update public.validation_pilots set status = 'closed' where id = '${pilot}'`)
    await rejects(t.asUser(assessorB, `insert into public.human_ratings (assignment_id, rater_id, rubric_version) values ('${asg1}','${assessorB}','hrr-1.0.0')`), /row-level security/)
    expect(await t.asUser(assessorA, `update public.human_ratings set unscorable = false where id = '${rA1}' returning id`)).toEqual([])
    await t.asService(`update public.validation_pilots set status = 'running' where id = '${pilot}'`)
  })
  it('a member who is removed can no longer edit or submit their draft, or add items', async () => {
    await draft(ghost, asg2, rGhost2)
    await t.asService(`delete from public.validation_pilot_members where user_id = '${ghost}'`)
    expect(await t.asUser(ghost, `update public.human_ratings set status = 'submitted' where id = '${rGhost2}' returning id`)).toEqual([])
    await rejects(t.asUser(ghost, `insert into public.human_rating_items (rating_id, domain, observable, score, turn_refs) values ('${rGhost2}','opening',true,3,'{1}')`), /row-level security/)
  })
})

describe('the items of a rating', () => {
  it('an observable domain needs a score and at least one turn reference', async () => {
    await t.asUser(assessorA, `insert into public.human_rating_items (rating_id, domain, observable, score, turn_refs) values ('${rA1}','opening',true,4,'{2}')`, { commit: true })
    await rejects(t.asUser(assessorA, `insert into public.human_rating_items (rating_id, domain, observable, score, turn_refs) values ('${rA1}','questioning',true,3,'{}')`), /check/)
    await rejects(t.asUser(assessorA, `insert into public.human_rating_items (rating_id, domain, observable, score) values ('${rA1}','questioning',true,null)`), /check/)
  })
  it('"not observable" holds no score, and a score is never 0 or above 5', async () => {
    await t.asUser(assessorA, `insert into public.human_rating_items (rating_id, domain, observable, score) values ('${rA1}','composure',false,null)`, { commit: true })
    await rejects(t.asUser(assessorA, `insert into public.human_rating_items (rating_id, domain, observable, score) values ('${rA1}','closing',false,1)`), /check/)
    await rejects(t.asUser(assessorA, `insert into public.human_rating_items (rating_id, domain, observable, score, turn_refs) values ('${rA1}','closing',true,6,'{1}')`), /check/)
    await rejects(t.asUser(assessorA, `insert into public.human_rating_items (rating_id, domain, observable, score, turn_refs) values ('${rA1}','closing',true,0,'{1}')`), /check/)
  })
  it('only the owner adds items, and only to a draft', async () => {
    await rejects(t.asUser(assessorB, `insert into public.human_rating_items (rating_id, domain, observable, score, turn_refs) values ('${rA1}','closing',true,3,'{1}')`), /row-level security/)
  })
})

describe('blindness', () => {
  it('another assessor, an administrator and an adjudicator cannot see a draft', async () => {
    for (const u of [assessorB, admin, adjud]) {
      expect(await t.asUser(u, `select id from public.human_ratings where id = '${rA1}'`), u).toEqual([])
      expect(await t.asUser(u, `select 1 from public.human_rating_items`), u).toEqual([])
    }
  })
  it('the owner sees their own draft and items', async () => {
    expect(await t.asUser(assessorA, `select id from public.human_ratings where id = '${rA1}'`)).toHaveLength(1)
    expect((await t.asUser(assessorA, `select 1 from public.human_rating_items`)).length).toBeGreaterThan(0)
  })
  it('submitting stamps the time on the server, whatever the client sends', async () => {
    const r = await t.asUser(assessorA, `update public.human_ratings set status = 'submitted', submitted_at = '2001-01-01' where id = '${rA1}' returning submitted_at`, { commit: true })
    expect(new Date(r[0].submitted_at as string).getFullYear()).toBeGreaterThanOrEqual(2026)
  })
  it('a second assessor rates and submits the same case independently', async () => {
    await draft(assessorB, asg1, rB1)
    await submit(assessorB, rB1)
  })
  it('after submission, other assessors, reps and managers still cannot see it; the administrator and an adjudicator who is not assigned can', async () => {
    for (const u of [rep1, rep2, mgrA, mgrB, stranger]) {
      expect(await t.asUser(u, `select id from public.human_ratings`), `ratings as ${u}`).toEqual([])
      expect(await t.asUser(u, `select 1 from public.human_rating_items`), `items as ${u}`).toEqual([])
    }
    expect((await t.asUser(assessorB, `select id from public.human_ratings`)).map(r => r.id)).toEqual([rB1])
    expect((await t.asUser(admin, `select id from public.human_ratings`)).map(r => r.id).sort()).toEqual([rA1, rB1].sort())
    expect((await t.asUser(adjud, `select id from public.human_ratings`)).length).toBe(2)
  })
})

describe('someone who is both assessor and adjudicator stays blind to a case they are assigned to', () => {
  it('cannot read other raters\' submitted ratings of that case until they have submitted their own', async () => {
    await draft(assessorA, asg2, rA2)
    await submit(assessorA, rA2)
    expect(await t.asUser(dual, `select id from public.human_ratings where assignment_id = '${asg2}'`)).toEqual([])
    expect(await t.asUser(dual, `select id from public.human_ratings where assignment_id = '${asg1}'`)).toEqual([])
  })
  it('can once their own rating of that case is submitted', async () => {
    await draft(dual, asg2, rDual2)
    expect(await t.asUser(dual, `select id from public.human_ratings where assignment_id = '${asg2}'`)).toHaveLength(1) // still only their own draft
    await submit(dual, rDual2)
    expect((await t.asUser(dual, `select id from public.human_ratings where assignment_id = '${asg2}'`)).length).toBe(2)
  })
  it('stays blind to a case they are assigned to but have not rated (asg1)', async () => {
    expect(await t.asUser(dual, `select id from public.human_ratings where assignment_id = '${asg1}'`)).toEqual([])
  })
})

describe('a submitted rating never changes', () => {
  it('not the rating, not its items, for the assessor', async () => {
    expect(await t.asUser(assessorA, `update public.human_ratings set unscorable = true where id = '${rA1}' returning id`)).toEqual([])
    await rejects(t.asUser(assessorA, `insert into public.human_rating_items (rating_id, domain, observable, score, turn_refs) values ('${rA1}','closing',true,5,'{9}')`), /row-level security|submitted rating cannot change/)
    expect(await t.asUser(assessorA, `update public.human_rating_items set score = 1 where rating_id = '${rA1}' returning domain`)).toEqual([])
    expect(await t.asUser(assessorA, `delete from public.human_rating_items where rating_id = '${rA1}' returning domain`)).toEqual([])
  })
  it('not even for the server', async () => {
    await rejects(t.asService(`update public.human_ratings set unscorable = true where id = '${rA1}'`), /submitted rating cannot change/)
    await rejects(t.asService(`update public.human_rating_items set score = 1 where rating_id = '${rA1}'`), /submitted rating cannot change/)
    await rejects(t.asService(`insert into public.human_rating_items (rating_id, domain, observable, score, turn_refs) values ('${rA1}','closing',true,5,'{9}')`), /submitted rating cannot change/)
  })
  it('a signed-in user cannot delete a rating (no delete privilege exists)', async () => {
    await rejects(t.asUser(assessorA, `delete from public.human_ratings where id = '${rA1}'`), /permission denied/)
    await rejects(t.asUser(admin, `delete from public.human_ratings where id = '${rA1}'`), /permission denied/)
  })
})

describe('adjudication', () => {
  const adjudicate = (who: string, assignment: string, domain: string, originals = [rA1, rB1]) =>
    `insert into public.rating_adjudications (assignment_id, domain, adjudicator_id, score, reason, original_rating_ids) values ('${assignment}','${domain}','${who}',3,'raters differed by two points','{${originals.join(',')}}')`

  it('an adjudicator who is not assigned to the case records one', async () => {
    await t.asUser(adjud, adjudicate(adjud, asg1, 'opening'), { commit: true })
  })
  it('an assessor, an administrator and a rep cannot', async () => {
    for (const u of [assessorB, admin, rep1, mgrA]) await rejects(t.asUser(u, adjudicate(u, asg1, 'questioning')), /row-level security/)
  })
  it('nobody adjudicates in another person\'s name', async () => {
    await rejects(t.asUser(adjud, adjudicate(assessorA, asg1, 'questioning')), /row-level security/)
  })
  it('someone assigned to rate the case cannot adjudicate it, even before rating, or after', async () => {
    await rejects(t.asUser(dual, adjudicate(dual, asg1, 'questioning')), /row-level security/) // assigned, not rated
    await rejects(t.asUser(dual, adjudicate(dual, asg2, 'questioning', [rA2, rDual2])), /row-level security/) // assigned and rated
  })
  it('the same person can adjudicate a case they were never assigned to, and read it', async () => {
    await draft(assessorA, asg3, rA3); await submit(assessorA, rA3)
    await draft(assessorB, asg3, rB3); await submit(assessorB, rB3)
    await t.asUser(dual, adjudicate(dual, asg3, 'closing', [rA3, rB3]), { commit: true })
    expect((await t.asUser(dual, `select id from public.human_ratings where assignment_id = '${asg3}'`)).length).toBe(2)
  })
  it('nobody who adjudicated a case can be assigned to rate it afterwards', async () => {
    await rejects(t.asService(`insert into public.validation_assessor_assignments (assignment_id, assessor_id, pilot_id, scenario_type) values ('${asg1}','${adjud}','${pilot}','A')`), /has adjudicated the case/)
  })
  it('it must cite at least two distinct SUBMITTED ratings of the SAME case', async () => {
    await rejects(t.asUser(adjud, adjudicate(adjud, asg1, 'questioning', [rA1])), /check|at least two/)
    await rejects(t.asUser(adjud, adjudicate(adjud, asg1, 'questioning', [rA1, rA1])), /distinct submitted ratings/)
    await rejects(t.asUser(adjud, adjudicate(adjud, asg1, 'questioning', [rA1, rA3])), /distinct submitted ratings/) // a rating of another case
    await rejects(t.asUser(adjud, adjudicate(adjud, asg1, 'questioning', [rA1, id(999)])), /distinct submitted ratings/) // does not exist
    await rejects(t.asUser(adjud, adjudicate(adjud, asg2, 'questioning', [rA2, rGhost2])), /distinct submitted ratings|row-level/) // one is a draft
  })
  it('one adjudication per case and domain', async () => {
    await rejects(t.asUser(adjud, adjudicate(adjud, asg1, 'opening')), /duplicate key/)
  })
  it('an adjudication can never be edited, and a signed-in user cannot delete it', async () => {
    await rejects(t.asUser(adjud, `update public.rating_adjudications set score = 5 where assignment_id = '${asg1}'`), /permission denied|cannot be edited/)
    await rejects(t.asService(`update public.rating_adjudications set score = 5 where assignment_id = '${asg1}'`), /cannot be edited/)
    await rejects(t.asUser(adjud, `delete from public.rating_adjudications where assignment_id = '${asg1}'`), /permission denied/)
  })
  it('only administrators and adjudicators read them, and an adjudicator who is assigned to the case and has not rated it does not', async () => {
    expect((await t.asUser(admin, `select id from public.rating_adjudications`)).length).toBeGreaterThan(0)
    for (const u of [assessorB, rep1, mgrA, stranger]) expect(await t.asUser(u, `select id from public.rating_adjudications`), u).toEqual([])
    expect(await t.asUser(dual, `select id from public.rating_adjudications where assignment_id = '${asg1}'`)).toEqual([])
  })
})

describe('claim verdicts', () => {
  const verdict = (who: string, v: string, assignment = asg1, report: string | null = null) =>
    `insert into public.claim_adjudications (assignment_id, claim_ref, certainty, verdict, adjudicator_id, report_id) values ('${assignment}','performance[0]','stated','${v}','${who}',${report ? `'${report}'` : 'null'})`

  it('an adjudicator records one; an assessor cannot; the verdict must be one of three', async () => {
    await t.asUser(adjud, verdict(adjud, 'unsupported'), { commit: true })
    await rejects(t.asUser(assessorB, verdict(assessorB, 'supported')), /row-level security/)
    await rejects(t.asUser(adjud, verdict(adjud, 'maybe')), /check/)
  })
  it('someone assigned to rate the case cannot record a verdict on it', async () => {
    await rejects(t.asUser(dual, verdict(dual, 'supported')), /row-level security/)
  })
  it('a verdict that cites a report must cite the report of that case', async () => {
    await t.asService(`insert into public.conversation_reports (id, session_type, session_id, rep_id, report, status) values
      ('${reportRep1}','human_partner','${id(301)}','${rep1}','{}'::jsonb,'complete'),('${reportOther}','human_partner','${id(302)}','${rep2}','{}'::jsonb,'complete')`)
    await rejects(t.asUser(adjud, verdict(adjud, 'supported', asg1, reportOther).replace('performance[0]', 'performance[1]')), /does not belong/)
    await t.asUser(adjud, verdict(adjud, 'supported', asg1, reportRep1).replace('performance[0]', 'performance[2]'), { commit: true })
  })
  it('it cannot be edited afterwards', async () => {
    await rejects(t.asService(`update public.claim_adjudications set verdict = 'supported'`), /cannot be edited/)
  })
  it('a rep can still delete their own report: the verdict stays and loses only the link', async () => {
    const gone = await t.asUser(rep1, `delete from public.conversation_reports where id = '${reportRep1}' returning id`, { commit: true })
    expect(gone).toHaveLength(1)
    const rows = await t.asService(`select report_id from public.claim_adjudications where claim_ref = 'performance[2]'`)
    expect(rows).toEqual([{ report_id: null }])
  })
})

describe('erasing an account does not get blocked by the append-only rule', () => {
  it('deleting a rater keeps their submitted rating without the person', async () => {
    await t.asService(`delete from public.profiles where id = '${assessorB}'`)
    const rows = await t.asService(`select rater_id, status from public.human_ratings where id = '${rB1}'`)
    expect(rows).toEqual([{ rater_id: null, status: 'submitted' }])
  })
  it('deleting an adjudicator keeps their adjudications without the person', async () => {
    await t.asService(`delete from public.profiles where id = '${adjud}'`)
    expect(await t.asService(`select adjudicator_id from public.rating_adjudications where assignment_id = '${asg1}'`)).toEqual([{ adjudicator_id: null }])
    expect((await t.asService(`select adjudicator_id from public.claim_adjudications where assignment_id = '${asg1}'`)).every(r => r.adjudicator_id === null)).toBe(true)
  })
  it('the erasure path cannot be used to change anything else', async () => {
    await rejects(t.asService(`update public.human_ratings set rater_id = null, unscorable = true where id = '${rA1}'`), /submitted rating cannot change/)
  })
})

describe('withdrawal', () => {
  it('deleting a rep through the server removes their case and its ratings and adjudications, and nobody else\'s', async () => {
    await t.asService(`delete from public.profiles where id = '${rep1}'`)
    expect(await t.asService(`select id from public.validation_assignments where id = '${asg1}'`)).toEqual([])
    expect(await t.asService(`select id from public.human_ratings where assignment_id = '${asg1}'`)).toEqual([])
    expect(await t.asService(`select id from public.rating_adjudications where assignment_id = '${asg1}'`)).toEqual([])
    expect(await t.asService(`select id from public.claim_adjudications where assignment_id = '${asg1}'`)).toEqual([])
    expect((await t.asService(`select id from public.human_ratings where assignment_id = '${asg2}'`)).length).toBeGreaterThan(0)
  })
})
