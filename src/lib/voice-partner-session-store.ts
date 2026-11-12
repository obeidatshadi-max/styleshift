import type { createAdminClient } from '@/lib/supabase-admin'
import { isClearStep, type ClearStep, type ObjectionType } from '@/lib/voice-partner-core'

// AI-Doctor results are written by the server, never by the browser (validation audit
// 2026-11-12, W5). The judge routes call these with the service-role client after they
// have checked who the rep is and that the doctor is theirs, so every write here sets
// rep_id from the authenticated user. Migration 20261112120000 removes reps' own insert
// rights on conversation_turns and voice_partner_sessions.
//
// Still not proven: that the conversation the judge saw is real. Turn-based history is
// still sent by the browser each turn, and the live call's transcript is assembled in the
// browser. What is proven: the outcome, turn count and CLEAR steps stored for a session are
// the server judge's, and a lost session is stored whether or not the browser reports it.

type Admin = ReturnType<typeof createAdminClient>

/** The rep turns the server itself stored for this session so far. `started` is false when
 * the server never opened this session for this rep (no turn rows at all). */
export async function priorRepTurns(admin: Admin, sessionId: string, repId: string): Promise<{ started: boolean; count: number; clearSteps: ClearStep[] }> {
  const { data } = await admin.from('conversation_turns').select('role, clear_steps_hit')
    .eq('session_id', sessionId).eq('rep_id', repId)
  const rows = (data ?? []) as { role: string; clear_steps_hit: unknown }[]
  const rep = rows.filter(r => r.role === 'rep')
  const steps = rep.flatMap(r => (Array.isArray(r.clear_steps_hit) ? r.clear_steps_hit.filter(isClearStep) : []))
  return { started: rows.length > 0, count: rep.length, clearSteps: [...new Set(steps)] }
}

export interface ResolvedSession {
  id: string
  repId: string
  doctorId: string
  style: string | null
  objectionType: ObjectionType
  outcome: 'won' | 'escalated'
  clearSteps: ClearStep[]
  turnCount: number
  difficulty: string | null
}

/** Stores the judge's result once. A second resolution of the same session never
 * overwrites the first, so a lost session cannot be re-rolled into a win. */
export async function recordResolvedSession(admin: Admin, s: ResolvedSession): Promise<'saved' | 'exists' | 'failed'> {
  const { error } = await admin.from('voice_partner_sessions').insert({
    id: s.id, rep_id: s.repId, doctor_id: s.doctorId, style: s.style, objection_type: s.objectionType,
    outcome: s.outcome, clear_steps_hit: [...new Set(s.clearSteps)], turn_count: s.turnCount,
    ...(s.difficulty ? { difficulty: s.difficulty } : {}),
  })
  if (!error) return 'saved'
  if ((error as { code?: string }).code === '23505') return 'exists'
  console.warn('voice_partner_sessions insert failed:', error.message)
  return 'failed'
}
