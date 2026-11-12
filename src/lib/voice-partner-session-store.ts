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

export interface SessionState {
  /** The server opened this session for this rep (it stored at least one turn row). */
  started: boolean
  /** Doctor of the session's first stored row, or null when not started. */
  doctorId: string | null
  /** Turn rows the server stored: the next turn's index. */
  rowCount: number
  /** Rep turns the server stored. */
  count: number
  clearSteps: ClearStep[]
  /** The judge already resolved this session (its result row exists). */
  resolved: boolean
}

/** What the server itself stored for this session so far. Everything here comes from rows
 * written with the service role, never from what the browser resends. */
export async function sessionState(admin: Admin, sessionId: string, repId: string): Promise<SessionState> {
  const [turns, result] = await Promise.all([
    admin.from('conversation_turns').select('turn_index, role, clear_steps_hit, doctor_id')
      .eq('session_id', sessionId).eq('rep_id', repId),
    admin.from('voice_partner_sessions').select('id').eq('id', sessionId).maybeSingle(),
  ])
  const rows = ((turns.data ?? []) as { turn_index: number; role: string; clear_steps_hit: unknown; doctor_id: string | null }[])
    .sort((a, b) => a.turn_index - b.turn_index)
  const rep = rows.filter(r => r.role === 'rep')
  const steps = rep.flatMap(r => (Array.isArray(r.clear_steps_hit) ? r.clear_steps_hit.filter(isClearStep) : []))
  return {
    started: rows.length > 0, doctorId: rows[0]?.doctor_id ?? null, rowCount: rows.length,
    count: rep.length, clearSteps: [...new Set(steps)], resolved: !!result.data,
  }
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
