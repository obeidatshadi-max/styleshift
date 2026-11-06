import type { SupabaseClient } from '@supabase/supabase-js'
import type { AnalysisCase, AnalysisInput, AnalysisRating, ClaimVerdict } from './analysis'
import { aiDomainScore, AI_COMPARABLE_DOMAINS, RUBRIC_DOMAINS, isRubricDomain, type RubricDomain } from './rubric'
import type { AdaptationScores, CompetencyScores } from '@/lib/session-evaluator'

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data
}
const chunks = <T>(xs: T[], n = 100): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))
async function inChunks<T>(ids: string[], run: (part: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (const part of chunks(ids)) out.push(...(check(await run(part)) ?? []))
  return out
}

/**
 * Read one pilot's stored results into the plain rows the analysis takes. Server-side only (admin client): it reads
 * every assessor's SUBMITTED ratings, which no single assessor can see. Drafts are never read. AI scores come from the
 * session scorecards of the AI-doctor sessions and are joined here, after the human ratings were given, so a rater
 * never meets them. Human-partner calls have no AI scorecard in this table, so their AI scores are left empty (not 0).
 */
export async function loadAnalysisInput(db: SupabaseClient, pilotId: string, extra: Pick<AnalysisInput, 'securityGate' | 'criticalIncidents'>): Promise<AnalysisInput> {
  const pilot = check(await db.from('validation_pilots').select('data_source').eq('id', pilotId).maybeSingle())
  if (!pilot) throw new Error('pilot not found')
  const assignments = check(await db.from('validation_assignments').select('id, rep_id, session_type, session_id, scenario_type, scenario_version, phase').eq('pilot_id', pilotId)) ?? []
  const ids = assignments.map(a => a.id as string)

  const ratings = await inChunks<{ id: string; assignment_id: string; rater_id: string | null; unscorable: boolean }>(ids, part =>
    db.from('human_ratings').select('id, assignment_id, rater_id, unscorable').in('assignment_id', part).eq('status', 'submitted'))
  const items = await inChunks<{ rating_id: string; domain: string; observable: boolean; score: number | null }>(ratings.map(r => r.id), part =>
    db.from('human_rating_items').select('rating_id, domain, observable, score').in('rating_id', part))
  const claimRows = await inChunks<{ assignment_id: string; claim_ref: string; certainty: ClaimVerdict['certainty']; verdict: ClaimVerdict['verdict']; adjudicator_id: string | null }>(ids, part =>
    db.from('claim_adjudications').select('assignment_id, claim_ref, certainty, verdict, adjudicator_id').in('assignment_id', part))

  const aiSessionIds = assignments.filter(a => a.session_type === 'ai_doctor_voice' || a.session_type === 'ai_doctor_text').map(a => a.session_id as string)
  const cards = await inChunks<{ session_id: string; competencies: CompetencyScores | null; adaptation: AdaptationScores | null }>(aiSessionIds, part =>
    db.from('session_scorecards').select('session_id, competencies, adaptation').in('session_id', part))
  const cardOf = new Map(cards.map(c => [c.session_id, c]))

  const itemsOf = new Map<string, typeof items>()
  for (const it of items) itemsOf.set(it.rating_id, [...(itemsOf.get(it.rating_id) ?? []), it])

  const cases: AnalysisCase[] = assignments.map(a => {
    const rs: AnalysisRating[] = ratings.filter(r => r.assignment_id === a.id).map(r => {
      const scores: Partial<Record<RubricDomain, number | null>> = {}
      for (const it of itemsOf.get(r.id) ?? []) if (isRubricDomain(it.domain)) scores[it.domain] = it.observable ? it.score : null
      return { raterId: r.rater_id ?? `erased:${r.id}`, unscorable: r.unscorable, scores }
    })
    const card = cardOf.get(a.session_id as string)
    const ai: AnalysisCase['ai'] = {}
    for (const d of AI_COMPARABLE_DOMAINS) ai[d] = card ? aiDomainScore(d, card.competencies, card.adaptation) : null
    return {
      assignmentId: a.id as string, repId: a.rep_id as string, scenarioType: a.scenario_type, scenarioVersion: a.scenario_version, phase: a.phase,
      ratings: rs, ai,
    }
  })

  return {
    dataSource: pilot.data_source as AnalysisInput['dataSource'],
    cases,
    claims: claimRows.map(c => ({ assignmentId: c.assignment_id, claimRef: c.claim_ref, certainty: c.certainty, verdict: c.verdict, adjudicatorId: c.adjudicator_id })),
    securityGate: extra.securityGate,
    criticalIncidents: extra.criticalIncidents,
  }
}

void RUBRIC_DOMAINS
