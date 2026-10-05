// The "Before you walk in" brief and the promise list behind it. Pure: callers pass what they loaded.

export interface BriefDoctor {
  plan_objective?: string | null
  plan_success_measure?: string | null
  hidden_concern?: string | null
}
export interface BriefVisit {
  id: string
  source: string
  created_at: string
  objection_raised: string | null
  promise_made: string | null
  what_worked: string | null
  promise_done_at?: string | null
}
export interface BriefDebrief { created_at: string; nextAction: string }

export interface OpenPromise { id: string; text: string; daysAgo: number }

export interface VisitBrief {
  goal: string | null
  measure: string | null
  promises: OpenPromise[]
  lastContactDaysAgo: number | null
  lastNextAction: string | null
  lastObjection: string | null
  whatWorked: string | null
  hiddenConcern: string | null
  hasContent: boolean
}

const DAY_MS = 86_400_000
const daysSince = (iso: string, nowMs: number) => Math.max(0, Math.floor((nowMs - Date.parse(iso)) / DAY_MS))
const clean = (s: string | null | undefined) => s?.trim() || null

/** Promises still to keep, longest-waiting first. */
export function openPromises(visits: BriefVisit[], nowMs: number): OpenPromise[] {
  return visits
    .filter(v => clean(v.promise_made) && !v.promise_done_at)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .map(v => ({ id: v.id, text: v.promise_made!.trim(), daysAgo: daysSince(v.created_at, nowMs) }))
}

export function buildVisitBrief(doctor: BriefDoctor, visits: BriefVisit[], debriefs: BriefDebrief[], nowMs: number): VisitBrief {
  // Practice sessions are rehearsals: only a manually logged visit or a coach debrief counts as contact.
  const real = visits.filter(v => v.source === 'manual').sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  const latestDebrief = [...debriefs].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0]
  const contactDates = [real[0]?.created_at, latestDebrief?.created_at].filter((d): d is string => !!d)
  const newestContact = contactDates.sort((a, b) => Date.parse(b) - Date.parse(a))[0]
  const brief = {
    goal: clean(doctor.plan_objective),
    measure: clean(doctor.plan_success_measure),
    promises: openPromises(visits, nowMs),
    lastContactDaysAgo: newestContact ? daysSince(newestContact, nowMs) : null,
    lastNextAction: clean(latestDebrief?.nextAction),
    lastObjection: clean(real.find(v => clean(v.objection_raised))?.objection_raised),
    whatWorked: clean(real.find(v => clean(v.what_worked))?.what_worked),
    hiddenConcern: clean(doctor.hidden_concern),
  }
  return { ...brief, hasContent: !!(brief.goal || brief.promises.length || brief.lastNextAction || brief.lastObjection || brief.whatWorked || brief.hiddenConcern) }
}
