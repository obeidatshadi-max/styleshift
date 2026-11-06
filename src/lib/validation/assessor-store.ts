import type { SupabaseClient } from '@supabase/supabase-js'
import type { AssessorStore, CaseSummary, SavedRating, Turn } from './assessor-service'
import type { RatingInput, RatingItemInput } from './rating'
import { RUBRIC_VERSION, isRubricDomain } from './rubric'

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data
}

/**
 * Supabase implementation of AssessorStore.
 *
 * `userDb` is the signed-in assessor's own client, so row-level security decides what they can read and write: only
 * their own cases and ratings, only while the pilot runs, never a submitted rating. `adminDb` is used for one read
 * only, the transcript, and returns turns without any rep, phase or earlier-attempt information.
 */
export function supabaseAssessorStore(userDb: SupabaseClient, adminDb: SupabaseClient, userId: string): AssessorStore {
  async function ownRatingRow(assignmentId: string) {
    return check(await userDb.from('human_ratings').select('id, status, unscorable').eq('assignment_id', assignmentId).eq('rater_id', userId).maybeSingle())
  }

  return {
    async assignedCases() {
      const rows = check(await userDb.from('validation_assessor_assignments').select('assignment_id, scenario_type').eq('assessor_id', userId)) ?? []
      return rows.map(r => ({ assignmentId: r.assignment_id as string, scenarioType: r.scenario_type as CaseSummary['scenarioType'] }))
    },

    async myRatings() {
      const rows = check(await userDb.from('human_ratings').select('assignment_id, status').eq('rater_id', userId)) ?? []
      return rows.map(r => ({ assignmentId: r.assignment_id as string, status: r.status as 'draft' | 'submitted' }))
    },

    async turns(assignmentId) {
      const a = check(await adminDb.from('validation_assignments').select('session_type, session_id').eq('id', assignmentId).maybeSingle())
      // Only AI-doctor sessions keep their turns in conversation_turns. Human-partner calls are recorded as audio and
      // need a transcript view of their own; until then those cases are reported as not available, never guessed.
      if (!a || (a.session_type !== 'ai_doctor_voice' && a.session_type !== 'ai_doctor_text')) return null
      const rows = check(await adminDb.from('conversation_turns').select('turn_index, role, text').eq('session_id', a.session_id).order('turn_index')) ?? []
      if (!rows.length) return null
      return rows.map((r): Turn => ({ index: r.turn_index as number, role: r.role as Turn['role'], text: r.text as string }))
    },

    async myRating(assignmentId) {
      const row = await ownRatingRow(assignmentId)
      if (!row) return null
      const items = check(await userDb.from('human_rating_items').select('domain, observable, score, turn_refs, note, uncertain').eq('rating_id', row.id)) ?? []
      const saved: SavedRating = {
        id: row.id as string,
        status: row.status as 'draft' | 'submitted',
        unscorable: row.unscorable as boolean,
        items: items.filter(i => isRubricDomain(i.domain)).map((i): RatingItemInput => ({
          domain: i.domain, observable: i.observable as boolean, score: (i.score as number | null) ?? null,
          turnRefs: (i.turn_refs as number[]) ?? [], note: (i.note as string | null) ?? null, uncertain: i.uncertain as boolean,
        })),
      }
      return saved
    },

    async saveDraft(assignmentId: string, input: RatingInput) {
      const existing = await ownRatingRow(assignmentId)
      let ratingId = existing?.id as string | undefined
      if (!ratingId) {
        const created = check(await userDb.from('human_ratings').insert({ assignment_id: assignmentId, rater_id: userId, rubric_version: RUBRIC_VERSION }).select('id').single())
        if (!created) throw new Error('rating was not created')
        ratingId = created.id as string
      }
      check(await userDb.from('human_ratings').update({ unscorable: input.unscorable }).eq('id', ratingId).select('id'))
      // A draft is replaced as a whole. These are separate requests, not one transaction: if the insert fails after
      // the delete, the draft is empty and the screen still holds what the assessor typed, so they can save again.
      check(await userDb.from('human_rating_items').delete().eq('rating_id', ratingId).select('rating_id'))
      if (input.items.length) {
        check(await userDb.from('human_rating_items').insert(input.items.map(i => ({
          rating_id: ratingId, domain: i.domain, observable: i.observable, score: i.score, turn_refs: i.turnRefs, note: i.note, uncertain: i.uncertain,
        }))))
      }
      return { ratingId }
    },

    async submit(ratingId) {
      const rows = check(await userDb.from('human_ratings').update({ status: 'submitted' }).eq('id', ratingId).eq('rater_id', userId).eq('status', 'draft').select('id')) ?? []
      return rows.length > 0
    },
  }
}
