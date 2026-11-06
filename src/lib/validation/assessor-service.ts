import { validateRating, type RatingInput, type RatingItemInput } from './rating'

/** Switch for the whole pilot workflow. Off unless the owner turns it on, and only after the validation migration is applied. */
export const validationEnabled = () => process.env.VALIDATION_PILOT_ENABLED === 'true'

export interface CaseSummary {
  assignmentId: string
  scenarioType: 'A' | 'B' | 'C' | 'D'
  /** Null when this assessor has not started the case. */
  ratingStatus: 'draft' | 'submitted' | null
}

export interface Turn { index: number; role: 'rep' | 'doctor'; text: string }

export interface SavedRating { id: string; status: 'draft' | 'submitted'; unscorable: boolean; items: RatingItemInput[] }

/**
 * What the service needs from storage. The real implementation (assessor-store.ts) runs every assessor read and write
 * as the signed-in assessor, so row-level security is the authorisation; the one admin-side read is the transcript,
 * which returns turns only: no rep, no phase, no earlier-attempt flag.
 */
export interface AssessorStore {
  /** The cases this assessor is assigned, de-identified. */
  assignedCases(): Promise<{ assignmentId: string; scenarioType: CaseSummary['scenarioType'] }[]>
  myRatings(): Promise<{ assignmentId: string; status: 'draft' | 'submitted' }[]>
  /** `null` when the case has no transcript this tool can show yet. */
  turns(assignmentId: string): Promise<Turn[] | null>
  myRating(assignmentId: string): Promise<SavedRating | null>
  /** Create the draft if needed and replace its items. Throws if the database refuses. */
  saveDraft(assignmentId: string, input: RatingInput): Promise<{ ratingId: string }>
  /** Submit the draft. Returns false when there was nothing to submit (already submitted, or not theirs). */
  submit(ratingId: string): Promise<boolean>
}

export interface Result<T> { status: number; body: T | { error: string } }

export async function listCases(store: AssessorStore): Promise<Result<{ cases: CaseSummary[] }>> {
  const [cases, ratings] = await Promise.all([store.assignedCases(), store.myRatings()])
  const byCase = new Map(ratings.map(r => [r.assignmentId, r.status]))
  return {
    status: 200,
    body: { cases: cases.map(c => ({ ...c, ratingStatus: byCase.get(c.assignmentId) ?? null })) },
  }
}

export async function getCase(store: AssessorStore, assignmentId: string): Promise<Result<{ scenarioType: CaseSummary['scenarioType']; turns: Turn[]; rating: SavedRating | null }>> {
  const mine = (await store.assignedCases()).find(c => c.assignmentId === assignmentId)
  if (!mine) return { status: 404, body: { error: 'not_found' } }
  const turns = await store.turns(assignmentId)
  if (!turns) return { status: 409, body: { error: 'transcript_not_available' } }
  return { status: 200, body: { scenarioType: mine.scenarioType, turns, rating: await store.myRating(assignmentId) } }
}

/**
 * Save a draft, or (with `submit`) save and submit. Validation happens first and against the turns that really exist
 * in the case, so a rating can never cite a turn that is not there. A submitted rating can never change again; the
 * database refuses it, and so does this function before asking.
 */
export async function saveRating(store: AssessorStore, assignmentId: string, raw: unknown, submit: boolean): Promise<Result<{ ratingId: string; status: 'draft' | 'submitted' }>> {
  const mine = (await store.assignedCases()).find(c => c.assignmentId === assignmentId)
  if (!mine) return { status: 404, body: { error: 'not_found' } }
  const turns = await store.turns(assignmentId)
  if (!turns) return { status: 409, body: { error: 'transcript_not_available' } }
  const existing = await store.myRating(assignmentId)
  if (existing?.status === 'submitted') return { status: 409, body: { error: 'already_submitted' } }

  const checked = validateRating(raw, { submit, turnIndexes: turns.map(t => t.index) })
  if (!checked.ok) return { status: 400, body: { error: checked.error } }

  const { ratingId } = await store.saveDraft(assignmentId, checked.value)
  if (!submit) return { status: 200, body: { ratingId, status: 'draft' } }
  if (!(await store.submit(ratingId))) return { status: 409, body: { error: 'already_submitted' } }
  return { status: 200, body: { ratingId, status: 'submitted' } }
}
