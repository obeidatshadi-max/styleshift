import { createAdminClient } from '@/lib/supabase-admin'
import type { Assignment, AssignmentReply, AssignmentRepStatus, RepAssignment, RoleplaySessionSummary } from '@/types/game'

/**
 * Reduces a list of replies (any order) to the single most recent one per
 * rep — the manager-facing panel shows one line per rep, not a full feed.
 */
export function latestReplyPerRep(replies: AssignmentReply[]): Map<string, AssignmentReply> {
  const byRep = new Map<string, AssignmentReply>()
  for (const r of replies) {
    const current = byRep.get(r.rep_id)
    if (!current || r.created_at > current.created_at) byRep.set(r.rep_id, r)
  }
  return byRep
}

/**
 * The active assignment targeting this rep, with their completion state.
 * Returns null when there is no active assignment, the rep has no company,
 * or the assignment targets a subset that excludes them.
 */
export async function getAssignmentForRep(userId: string): Promise<RepAssignment | null> {
  const admin = createAdminClient()

  const { data: me } = await admin
    .from('profiles')
    .select('company_id, role')
    .eq('id', userId)
    .single()
  if (!me?.company_id) return null

  const { data: assignment } = await admin
    .from('assignments')
    .select('*')
    .eq('company_id', me.company_id)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!assignment) return null
  // rep_ids null targets every rep — but not the manager playing the game.
  if (assignment.rep_ids ? !assignment.rep_ids.includes(userId) : me.role !== 'rep') return null

  const { data: progress } = await admin
    .from('assignment_progress')
    .select('completed_at')
    .eq('assignment_id', assignment.id)
    .eq('rep_id', userId)
    .maybeSingle()

  return { assignment: assignment as Assignment, completed: !!progress }
}

export interface ManagerAssignmentView {
  assignment: Assignment
  reps: AssignmentRepStatus[]
}

/**
 * The active assignment for the company managed by `userId`, with one status
 * row per targeted rep. Returns null if the user is not a manager or there is
 * no active assignment.
 */
export async function getAssignmentForManager(userId: string): Promise<ManagerAssignmentView | null> {
  const admin = createAdminClient()

  const { data: manager } = await admin
    .from('profiles')
    .select('company_id, role')
    .eq('id', userId)
    .single()
  if (!manager?.company_id || manager.role !== 'manager') return null

  const { data: assignment } = await admin
    .from('assignments')
    .select('*')
    .eq('company_id', manager.company_id)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!assignment) return null

  const { data: reps } = await admin
    .from('profiles')
    .select('id, display_name')
    .eq('company_id', manager.company_id)
    .eq('role', 'rep')

  const targeted = (reps ?? []).filter(
    r => !assignment.rep_ids || assignment.rep_ids.includes(r.id)
  )

  const { data: progress } = await admin
    .from('assignment_progress')
    .select('rep_id, completed_at')
    .eq('assignment_id', assignment.id)
  const doneAt = new Map((progress ?? []).map(p => [p.rep_id, p.completed_at as string]))

  const { data: replies } = await admin
    .from('assignment_replies')
    .select('*')
    .eq('assignment_id', assignment.id)
  const latestReply = latestReplyPerRep((replies ?? []) as AssignmentReply[])

  const sessionIds = [...latestReply.values()].map(r => r.session_id).filter((id): id is string => !!id)
  const { data: sessions } = sessionIds.length
    ? await admin
        .from('roleplay_sessions')
        .select('id, created_at, duration_sec, talk_ratio, question_ratio, open_question_ratio, paraphrase_score, active_listening_score, rep_style, rep_confidence')
        .in('id', sessionIds)
    : { data: [] }
  const sessionById = new Map((sessions ?? []).map(s => [s.id, s as RoleplaySessionSummary]))

  return {
    assignment: assignment as Assignment,
    reps: targeted.map(r => {
      const reply = latestReply.get(r.id) ?? null
      return {
        rep_id: r.id,
        name: r.display_name,
        completed_at: doneAt.get(r.id) ?? null,
        reply: reply ? { ...reply, session: reply.session_id ? sessionById.get(reply.session_id) ?? null : null } : null,
      }
    }),
  }
}

/**
 * Records a rep's opt-in share against their active assignment — one
 * roleplay session's scores, or a free-text note — then marks the
 * assignment complete (idempotent, same as a qualifying run). Returns null
 * if the rep has no active assignment, the note is empty, or a session kind
 * doesn't reference one of the rep's own sessions.
 */
export async function createAssignmentReply(
  userId: string,
  input: { kind: 'doctor_session' | 'colleague_session' | 'note'; session_id?: string; note_text?: string }
): Promise<AssignmentReply | null> {
  const current = await getAssignmentForRep(userId)
  if (!current) return null

  const admin = createAdminClient()

  if (input.kind === 'note') {
    const note = input.note_text?.trim()
    if (!note) return null
    const { data } = await admin
      .from('assignment_replies')
      .insert({ assignment_id: current.assignment.id, rep_id: userId, kind: 'note', note_text: note })
      .select('*')
      .single()
    if (!data) return null
    await completeAssignment(userId)
    return data as AssignmentReply
  }

  if (!input.session_id) return null
  const { data: session } = await admin
    .from('roleplay_sessions')
    .select('id')
    .eq('id', input.session_id)
    .eq('rep_id', userId)
    .maybeSingle()
  if (!session) return null

  const { data } = await admin
    .from('assignment_replies')
    .insert({ assignment_id: current.assignment.id, rep_id: userId, kind: input.kind, session_id: input.session_id })
    .select('*')
    .single()
  if (!data) return null
  await completeAssignment(userId)
  return data as AssignmentReply
}

/**
 * Creates a new assignment for the manager's company and deactivates any
 * previous one (one active assignment per company). Returns the new row,
 * or null if the caller is not a manager.
 */
export async function createAssignment(
  userId: string,
  input: { target_type: 'category' | 'level'; target_key: string; rep_ids: string[] | null }
): Promise<Assignment | null> {
  const admin = createAdminClient()

  const { data: manager } = await admin
    .from('profiles')
    .select('company_id, role')
    .eq('id', userId)
    .single()
  if (!manager?.company_id || manager.role !== 'manager') return null

  await admin
    .from('assignments')
    .update({ active: false })
    .eq('company_id', manager.company_id)
    .eq('active', true)

  const { data } = await admin
    .from('assignments')
    .insert({
      company_id: manager.company_id,
      created_by: userId,
      target_type: input.target_type,
      target_key: input.target_key,
      rep_ids: input.rep_ids,
    })
    .select('*')
    .single()

  return (data as Assignment) ?? null
}

/**
 * Marks the rep's active assignment as completed (idempotent — the PK makes a
 * repeat insert a no-op). Returns true if the rep had an active assignment.
 */
export async function completeAssignment(userId: string): Promise<boolean> {
  const current = await getAssignmentForRep(userId)
  if (!current) return false
  if (current.completed) return true

  const admin = createAdminClient()
  await admin
    .from('assignment_progress')
    .upsert(
      { assignment_id: current.assignment.id, rep_id: userId },
      { onConflict: 'assignment_id,rep_id', ignoreDuplicates: true }
    )
  return true
}
