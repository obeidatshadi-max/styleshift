// In-app nudges that bring a rep back to the AI Coach debrief. Pure: callers pass what they loaded.
// Priority: a planned visit awaiting its debrief, then a promise made to a doctor, then a next step
// the coach set, then a quiet streak.

export interface NudgeDoctor { id: string; name: string; plan_objective?: string | null }
export interface NudgeDebrief { doctor_id: string | null; created_at: string; nextAction?: string | null }
/** A promise the rep made to a doctor and has not ticked off. */
export interface NudgePromise { id: string; doctor_id: string; text: string; created_at: string }

export type Nudge =
  | { kind: 'planned_visit'; key: string; doctorId: string; doctorName: string; text: string }
  | { kind: 'open_promise'; key: string; doctorId: string; doctorName: string; text: string; days: number }
  | { kind: 'open_action'; key: string; doctorId: string; doctorName: string; text: string }
  | { kind: 'quiet'; key: string; days: number }

const DAY_MS = 86_400_000
/** A coach next step is "open" from a day after the debrief until it is old news. */
/** A promise is worth a reminder once it is a couple of days old. */
const PROMISE_MIN_AGE_DAYS = 2
const ACTION_MIN_AGE_DAYS = 1
const ACTION_MAX_AGE_DAYS = 14
const QUIET_AFTER_DAYS = 3

/** `snoozedUntil` maps a nudge key to the time (ms) before which it stays hidden. */
export function buildNudge(
  doctors: NudgeDoctor[], debriefs: NudgeDebrief[], nowMs: number, snoozedUntil: Record<string, number> = {},
  promises: NudgePromise[] = [],
): Nudge | null {
  const visible = (key: string) => (snoozedUntil[key] ?? 0) <= nowMs
  const byName = new Map(doctors.map(d => [d.id, d.name]))

  for (const d of doctors) {
    const objective = d.plan_objective?.trim()
    const key = `plan:${d.id}:${objective}`
    if (objective && visible(key)) return { kind: 'planned_visit', key, doctorId: d.id, doctorName: d.name, text: objective }
  }

  // The longest-waiting promise comes first: that is the one most at risk of being forgotten.
  const owed = [...promises].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  for (const p of owed) {
    const days = Math.floor((nowMs - Date.parse(p.created_at)) / DAY_MS)
    const key = `promise:${p.id}`
    if (byName.has(p.doctor_id) && p.text.trim() && days >= PROMISE_MIN_AGE_DAYS && visible(key)) {
      return { kind: 'open_promise', key, doctorId: p.doctor_id, doctorName: byName.get(p.doctor_id)!, text: p.text.trim(), days }
    }
  }

  // Debriefs arrive newest-first; the first one seen per doctor is that doctor's latest.
  const sorted = [...debriefs].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  const latest = new Map<string, NudgeDebrief>()
  for (const e of sorted) if (e.doctor_id && byName.has(e.doctor_id) && !latest.has(e.doctor_id)) latest.set(e.doctor_id, e)
  for (const [doctorId, e] of latest) {
    const ageDays = (nowMs - Date.parse(e.created_at)) / DAY_MS
    const text = e.nextAction?.trim()
    const key = `act:${doctorId}:${e.created_at}`
    if (text && ageDays >= ACTION_MIN_AGE_DAYS && ageDays <= ACTION_MAX_AGE_DAYS && visible(key)) {
      return { kind: 'open_action', key, doctorId, doctorName: byName.get(doctorId)!, text }
    }
  }

  const newest = sorted[0]
  if (newest && doctors.length > 0) {
    const days = Math.floor((nowMs - Date.parse(newest.created_at)) / DAY_MS)
    const key = `quiet:${newest.created_at}`
    if (days >= QUIET_AFTER_DAYS && visible(key)) return { kind: 'quiet', key, days }
  }
  return null
}
