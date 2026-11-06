import { SIGNAL_CATEGORIES, isSocialStyle, type SocialStyle, type TodayObservation, type UsualPatternSource } from '@/schemas/conversationReport'

/**
 * "Calls side by side": for one colleague, each call's quoted observations next to the others, grouped by the
 * doctor the colleague was asked to play. It only lays out what each stored report already holds. Nothing is
 * counted, ranked, averaged or scored across calls, and no trait or state is inferred from the comparison.
 */

export interface CallSession { id: string; created_at: string; doctor_id: string | null }

/** A stored report row. `usual` is the report's own usualVsToday part, selected on its own to keep the read small. */
export interface CallReportRow { session_id: string; created_at: string; superseded_by: string | null; usual: unknown }

export type CallStatus = 'no_report' | 'older_report' | 'ready'

export interface CallColumn {
  sessionId: string
  createdAt: string
  status: CallStatus
  /** The practice setting that call was run with, when its report recorded one. */
  practice: { style: SocialStyle; source: UsualPatternSource } | null
  observations: { category: TodayObservation['category']; quote: string }[]
  limited: boolean
}

export interface CallGroup { doctorId: string | null; calls: CallColumn[] }

/** At most this many of the most recent calls are shown per doctor, so the row stays readable. */
export const MAX_CALLS_PER_DOCTOR = 6

const KNOWN_CATEGORIES: readonly string[] = [...SIGNAL_CATEGORIES, 'brief_replies']
const SOURCES: readonly string[] = ['rep_recorded', 'practice_setting', 'none']

/** Stored JSON is untrusted: keep only well-formed observations, and report null when the part is not there at all. */
function readUsual(raw: unknown): Pick<CallColumn, 'practice' | 'observations' | 'limited'> | null {
  if (!raw || typeof raw !== 'object') return null
  const u = raw as Record<string, unknown>
  if (!Array.isArray(u.observations)) return null
  const observations = u.observations.flatMap(item => {
    const o = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const ev = (o.evidence && typeof o.evidence === 'object' ? o.evidence : {}) as Record<string, unknown>
    if (typeof o.category !== 'string' || !KNOWN_CATEGORIES.includes(o.category)) return []
    if (typeof ev.quote !== 'string' || ev.quote.trim() === '') return []
    return [{ category: o.category as TodayObservation['category'], quote: ev.quote }]
  })
  const usual = (u.usual && typeof u.usual === 'object' ? u.usual : {}) as Record<string, unknown>
  const practice = isSocialStyle(usual.style) && typeof usual.source === 'string' && SOURCES.includes(usual.source) && usual.source !== 'none'
    ? { style: usual.style, source: usual.source as UsualPatternSource } : null
  return { practice, observations, limited: u.limited === true }
}

export function buildCallGroups(sessions: CallSession[], reports: CallReportRow[], maxPerDoctor = MAX_CALLS_PER_DOCTOR): CallGroup[] {
  // The newest report of each call that has not been replaced by a corrected transcript.
  const latest = new Map<string, CallReportRow>()
  for (const r of reports) {
    if (r.superseded_by) continue
    const have = latest.get(r.session_id)
    if (!have || Date.parse(r.created_at) > Date.parse(have.created_at)) latest.set(r.session_id, r)
  }

  const columns = new Map<string | null, CallColumn[]>()
  for (const s of sessions) {
    const report = latest.get(s.id)
    const parsed = report ? readUsual(report.usual) : null
    const col: CallColumn = {
      sessionId: s.id, createdAt: s.created_at,
      status: !report ? 'no_report' : parsed ? 'ready' : 'older_report',
      practice: parsed?.practice ?? null, observations: parsed?.observations ?? [], limited: parsed?.limited ?? false,
    }
    columns.set(s.doctor_id, [...(columns.get(s.doctor_id) ?? []), col])
  }

  const groups: CallGroup[] = [...columns.entries()].map(([doctorId, calls]) => ({
    doctorId,
    // Most recent calls only, then oldest to newest so the row reads as a sequence.
    calls: [...calls].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, maxPerDoctor)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
  }))
  // The doctor with the most recent call first.
  const newest = (g: CallGroup) => Math.max(...g.calls.map(c => Date.parse(c.createdAt)))
  return groups.sort((a, b) => newest(b) - newest(a))
}
