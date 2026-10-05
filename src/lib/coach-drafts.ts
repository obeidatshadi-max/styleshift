import type { ActionStatus, DebriefFocus, DebriefInput, DebriefResult } from './coach-debrief'
export interface CoachDraft {
  doctorId: string
  account: string
  objective: string
  successMeasure: string
  visitDate: string
  reflections: DebriefInput['reflections']
  focus: DebriefFocus | null
  actionStatus: ActionStatus | null
  result: DebriefResult | null
  saved: boolean | null
  activeId: string | null
  recoveryToken: string | null
  request: { id: string; fingerprint: string } | null
}
export interface CoachDrafts { selected: string; drafts: Record<string, CoachDraft> }
const PREFIX = 'styleshift-coach-drafts:'
const MAX_AGE = 7 * 86400_000
export function readCoachDrafts(owner: string): CoachDrafts | null {
  try {
    const data = JSON.parse(sessionStorage.getItem(PREFIX + owner) || 'null')
    if (!data || !Number.isFinite(data.updatedAt) || Date.now() - data.updatedAt > MAX_AGE) {
      sessionStorage.removeItem(PREFIX + owner); return null
    }
    if (typeof data.selected !== 'string' || !data.drafts || typeof data.drafts !== 'object') return null
    for (const draft of Object.values(data.drafts) as CoachDraft[]) {
      if (!draft || typeof draft.doctorId !== 'string' || typeof draft.account !== 'string' ||
        typeof draft.objective !== 'string' || typeof draft.successMeasure !== 'string' ||
        !draft.reflections || ['wentWell', 'changeNextTime', 'objectiveReview'].some(k => typeof draft.reflections[k as keyof typeof draft.reflections] !== 'string')) return null
    }
    return data
  } catch { return null }
}
export function writeCoachDrafts(owner: string, data: CoachDrafts): boolean {
  try { sessionStorage.setItem(PREFIX + owner, JSON.stringify({ ...data, updatedAt: Date.now() })); return true }
  catch { return false }
}
/** Drafts last only for this tab session (and at most seven days), never across sign-out. */
export function clearCoachDrafts() {
  try { for (const key of Object.keys(sessionStorage)) if (key.startsWith(PREFIX)) sessionStorage.removeItem(key) } catch { /* storage disabled */ }
}
