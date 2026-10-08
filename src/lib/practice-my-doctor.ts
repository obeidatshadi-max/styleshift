import type { SupabaseClient } from '@supabase/supabase-js'
import type { Doctor, DoctorVisit, Profile } from '@/types/game'
import { personaFromDoctor } from '@/agents/orchestrator/persona'
import type { PersonaData } from '@/agents/orchestrator/types'
import type { Difficulty } from '@/lib/voice-partner-core'
import { openPromises } from '@/lib/visit-brief'
import { buildHcpContext, contextPromptBlock, withoutFacts, type DebriefLite, type HcpContext } from '@/lib/hcp-context'

/** Feature flag for "Practice my doctor" (preview and start). */
export function practiceMyDoctorEnabled(): boolean {
  return process.env.PRACTICE_MY_DOCTOR_ENABLED === 'true'
}

const DAY_MS = 86_400_000

type VisitRow = Pick<DoctorVisit, 'id' | 'doctor_id' | 'source' | 'objection_raised' | 'promise_made' | 'what_worked' | 'promise_done_at' | 'is_contact' | 'contact_at' | 'created_at' | 'note'>
type DebriefRow = DebriefLite & { doctorId: string }

export interface RepData {
  doctors: Doctor[]
  visits: Map<string, VisitRow[]>
  debriefs: Map<string, DebriefRow[]>
}

const group = <T extends { doctor_id?: string; doctorId?: string }>(rows: T[]) => {
  const m = new Map<string, T[]>()
  for (const r of rows) { const k = (r.doctor_id ?? r.doctorId) as string; if (k) m.set(k, [...(m.get(k) ?? []), r]) }
  return m
}

/** The rep's own doctors, visits and coach debriefs. The caller's client is used, so row-level security confines every read to their rows. */
export async function loadRepData(supabase: SupabaseClient, repId: string): Promise<RepData> {
  const [{ data: doctors }, { data: visits }, { data: debriefs }] = await Promise.all([
    supabase.from('doctors').select('*').eq('rep_id', repId).order('updated_at', { ascending: false }).limit(100),
    supabase.from('doctor_visits').select('id, doctor_id, source, objection_raised, promise_made, what_worked, promise_done_at, is_contact, contact_at, created_at, note')
      .eq('rep_id', repId).order('created_at', { ascending: false }).limit(500),
    supabase.from('coach_debriefs').select('id, created_at, doctorId:input->>doctorId, visitDate:input->>visitDate, nextAction:result->report->>nextAction')
      .eq('rep_id', repId).order('created_at', { ascending: false }).limit(200),
  ])
  const debriefRows = ((debriefs as unknown as Array<{ id: string; created_at: string; doctorId: string | null; visitDate: string | null; nextAction: string | null }> | null) ?? [])
    .filter(d => d.doctorId && d.nextAction).map(d => ({ id: d.id, created_at: d.created_at, doctorId: d.doctorId as string, visitDate: d.visitDate, nextAction: d.nextAction as string }))
  return { doctors: (doctors as Doctor[] | null) ?? [], visits: group((visits as VisitRow[] | null) ?? []), debriefs: group(debriefRows) }
}

export type NextVisitReason = 'promise' | 'plan' | 'next_action' | 'stale' | 'recent'

/**
 * "Practice my next visit": the doctor most likely to be next, from what the rep
 * recorded (open promises, a visit plan, a coach next action, time since
 * contact). No visit calendar exists, so this is a suggestion the rep can
 * override, and the reason is always shown.
 */
export function pickNextVisit(data: RepData, nowMs: number): { doctorId: string; reason: NextVisitReason } | null {
  let best: { doctorId: string; score: number; reason: NextVisitReason } | null = null
  for (const d of data.doctors) {
    const visits = data.visits.get(d.id) ?? []
    const promises = openPromises(visits, nowMs).length
    const hasPlan = !!d.plan_objective?.trim()
    const hasNext = (data.debriefs.get(d.id) ?? []).length > 0
    const real = visits.filter(v => v.source === 'manual' && v.is_contact !== false)
    const last = real.map(v => Date.parse(v.contact_at ?? v.created_at)).sort((a, b) => b - a)[0]
    const days = Number.isFinite(last) ? (nowMs - last) / DAY_MS : 0
    const stale = days >= 30 ? 2 : days >= 14 ? 1 : 0
    const score = 3 * Math.min(promises, 2) + (hasPlan ? 2 : 0) + (hasNext ? 2 : 0) + stale
    const reason: NextVisitReason = promises ? 'promise' : hasPlan ? 'plan' : hasNext ? 'next_action' : stale ? 'stale' : 'recent'
    if (!best || score > best.score) best = { doctorId: d.id, score, reason }
  }
  return best ? { doctorId: best.doctorId, reason: best.score > 0 ? best.reason : 'recent' } : null
}

export interface Prepared {
  doctor: Doctor
  context: HcpContext
  reason: NextVisitReason | 'chosen'
}

/** Resolves the doctor (chosen, or the suggested next visit) and builds the context for it. */
export function prepare(data: RepData, opts: { doctorId?: string; seed: string; nowMs: number }): Prepared | null {
  const picked = opts.doctorId ? { doctorId: opts.doctorId, reason: 'chosen' as const } : pickNextVisit(data, opts.nowMs)
  const doctor = picked && data.doctors.find(d => d.id === picked.doctorId)
  if (!picked || !doctor) return null
  const context = buildHcpContext(doctor, data.visits.get(doctor.id) ?? [], data.debriefs.get(doctor.id) ?? [], opts.seed, opts.nowMs)
  return { doctor, context, reason: picked.reason }
}

type RunProfile = Pick<Profile, 'id' | 'display_name' | 'company_id' | 'sps_top_key' | 'sps_profile'>

/**
 * The persona for the simulation: the saved doctor exactly as the normal path
 * builds it, plus the labelled context block. A "short time" challenge also
 * really shortens the time available.
 */
export function personaForPractice(doctor: Doctor, profile: RunProfile, context: HcpContext, difficulty: Difficulty, excludedFactIds: readonly string[]): { persona: PersonaData; used: HcpContext } {
  const used = withoutFacts(context, excludedFactIds)
  const persona = personaFromDoctor(doctor, profile, { difficulty })
  persona.physician.notes = [persona.physician.notes, contextPromptBlock(used)].filter(Boolean).join('\n')
  if (used.challenge === 'short_time') persona.physician.availableTimeMin = Math.min(persona.physician.availableTimeMin ?? 5, 3)
  return { persona, used }
}
