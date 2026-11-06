import { beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './supabaseTestDb'

/**
 * The columns and filters src/lib/validation/analysis-loader.ts selects, run against the real tables: they exist,
 * drafts are never read, and only submitted ratings reach the analysis.
 */
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CO = id(1), mgr = id(11), a1 = id(12), a2 = id(13), rep = id(21)
const pilot = id(101), asg = id(111), session = id(301)
let t: TestDb

beforeAll(async () => {
  t = await createTestDb()
  await t.db.exec(`insert into auth.users (id, email) select u, u::text || '@test.invalid' from unnest(array['${mgr}','${a1}','${a2}','${rep}']::uuid[]) u`)
  await t.asService(`insert into public.companies (id, name) values ('${CO}','A')`)
  await t.asService(`insert into public.profiles (id, company_id, role, display_name) values ('${mgr}','${CO}','manager','M'),('${a1}','${CO}','rep','A1'),('${a2}','${CO}','rep','A2'),('${rep}','${CO}','rep','R')`)
  await t.asService(`insert into public.validation_pilots (id, company_id, name, data_source, rubric_version, methodology_version, protocol_version, status, created_by) values ('${pilot}','${CO}','P','synthetic','hrr-1.0.0','mm-1.0.0','bvp-1.0.0','running','${mgr}')`)
  await t.asService(`insert into public.validation_pilot_members (pilot_id, user_id, role) values ('${pilot}','${mgr}','administrator'),('${pilot}','${a1}','assessor'),('${pilot}','${a2}','assessor')`)
  await t.asService(`insert into public.validation_assignments (id, pilot_id, rep_id, session_type, session_id, scenario_type, scenario_version, phase, seen_before) values ('${asg}','${pilot}','${rep}','ai_doctor_text','${session}','A','v1','baseline',false)`)
  await t.asService(`insert into public.validation_assessor_assignments (assignment_id, assessor_id, pilot_id, scenario_type) values ('${asg}','${a1}','${pilot}','A'),('${asg}','${a2}','${pilot}','A')`)
  // a1 submits an unscorable rating; a2 leaves a draft with one item.
  await t.asUser(a1, `insert into public.human_ratings (id, assignment_id, rater_id, rubric_version, unscorable) values ('${id(201)}','${asg}','${a1}','hrr-1.0.0',true)`, { commit: true })
  await t.asUser(a1, `update public.human_ratings set status = 'submitted' where id = '${id(201)}'`, { commit: true })
  await t.asUser(a2, `insert into public.human_ratings (id, assignment_id, rater_id, rubric_version) values ('${id(202)}','${asg}','${a2}','hrr-1.0.0')`, { commit: true })
  await t.asUser(a2, `insert into public.human_rating_items (rating_id, domain, observable, score, turn_refs) values ('${id(202)}','opening',true,4,'{1}')`, { commit: true })
  await t.asService(`insert into public.session_scorecards (session_id, rep_id, competencies, signals, model, adaptation) values ('${session}','${rep}','{"opening":{"score":70}}','{}','m','{}')`)
}, 120000)

describe('analysis loader queries', () => {
  it('reads the pilot\'s data source, its assignments and their scenario fields', async () => {
    expect(await t.asService(`select data_source from public.validation_pilots where id = '${pilot}'`)).toEqual([{ data_source: 'synthetic' }])
    const rows = await t.asService(`select id, rep_id, session_type, session_id, scenario_type, scenario_version, phase from public.validation_assignments where pilot_id = '${pilot}'`)
    expect(rows).toHaveLength(1)
  })

  it('reads submitted ratings only: a draft never reaches the analysis', async () => {
    const rows = await t.asService(`select id, assignment_id, rater_id, unscorable from public.human_ratings where assignment_id in ('${asg}') and status = 'submitted'`)
    expect(rows).toEqual([{ id: id(201), assignment_id: asg, rater_id: a1, unscorable: true }])
    const items = await t.asService(`select rating_id, domain, observable, score from public.human_rating_items where rating_id in ('${id(201)}')`)
    expect(items).toEqual([])
  })

  it('reads claim verdicts and the AI scorecard columns the loader names', async () => {
    expect(await t.asService(`select assignment_id, claim_ref, certainty, verdict, adjudicator_id from public.claim_adjudications where assignment_id in ('${asg}')`)).toEqual([])
    const cards = await t.asService<{ session_id: string; competencies: unknown; adaptation: unknown }>(`select session_id, competencies, adaptation from public.session_scorecards where session_id in ('${session}')`)
    expect(cards).toHaveLength(1)
    expect(cards[0].competencies).toEqual({ opening: { score: 70 } })
  })
})
