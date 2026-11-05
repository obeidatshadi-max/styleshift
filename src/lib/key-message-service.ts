import type { SupabaseClient } from '@supabase/supabase-js'
import type { CompleteFn } from '@/agents/llm'
import {
  applyFidelity, feedbackPrompt, fidelityPrompt, parseFeedback, parseFidelity, parseVersions, versionsPrompt, visibleToRep,
  type Feedback, type KeyMessageInput, type KmMode, type KmStyle, type PracticeInput, type Versions,
} from './key-message'

/**
 * Database work for key-message practice. The client is the service-role client, so every function
 * checks role, company and ownership itself before it reads or writes. Results are plain
 * { status, body } so the routes stay thin and tests need no HTTP.
 */
export interface Result { status: number; body: Record<string, unknown> }
const fail = (status: number, error: string): Result => ({ status, body: { error } })

interface Me { company_id: string | null; role: 'manager' | 'rep' | string }
interface Row {
  id: string; company_id: string; created_by: string; created_by_role: 'manager' | 'rep'; rep_ids: string[] | null
  doctor_id: string | null; message_text: string; mode: KmMode; versions: Versions | null; due_date: string | null; active: boolean; created_at: string
}

async function me(db: SupabaseClient, userId: string): Promise<Me | null> {
  const { data } = await db.from('profiles').select('company_id, role').eq('id', userId).maybeSingle()
  return (data as Me | null) ?? null
}

/** Rep: messages addressed to them or written by them, with their doctors for the style hint. Manager: the messages they set, with completion counts. */
export async function listForUser(db: SupabaseClient, userId: string): Promise<Result> {
  const profile = await me(db, userId)
  if (!profile?.company_id) return { status: 200, body: { role: profile?.role ?? 'rep', messages: [], doctors: [] } }
  // The audience filter goes in the query, before the cap, so other people's messages can never push
  // someone's own out of the 100-row window. userId comes from the session and is a uuid.
  const base = db.from('key_messages').select('*').eq('company_id', profile.company_id).eq('active', true)
  const scoped = profile.role === 'manager' ? base.eq('created_by_role', 'manager') : base.or(`created_by.eq.${userId},rep_ids.is.null,rep_ids.cs.{${userId}}`)
  const { data, error } = await scoped.order('created_at', { ascending: false }).limit(100)
  if (error) return fail(503, 'storage_unavailable')
  const rows = (data as Row[] | null) ?? []

  if (profile.role === 'manager') {
    const mine = rows.filter(r => r.created_by_role === 'manager')
    const ids = mine.map(r => r.id)
    const { data: progress } = ids.length ? await db.from('key_message_progress').select('key_message_id, rep_id').in('key_message_id', ids) : { data: [] }
    const { data: reps } = await db.from('profiles').select('id, display_name').eq('company_id', profile.company_id).eq('role', 'rep')
    const repList = (reps as Array<{ id: string; display_name: string | null }> | null) ?? []
    const done = new Map<string, Set<string>>()
    for (const p of (progress as Array<{ key_message_id: string; rep_id: string }> | null) ?? []) done.set(p.key_message_id, (done.get(p.key_message_id) ?? new Set()).add(p.rep_id))
    // Practice text reaches the manager only when the rep ticked share on that attempt.
    const { data: shared } = ids.length ? await db.from('key_message_attempts').select('key_message_id, rep_id, style, attempt_text, feedback, created_at').eq('shared_with_manager', true).in('key_message_id', ids).order('created_at', { ascending: false }) : { data: [] }
    const sharedBy = new Map<string, unknown[]>()
    for (const a of (shared as Array<{ key_message_id: string; rep_id: string; style: string; attempt_text: string; feedback: unknown; created_at: string }> | null) ?? []) {
      const name = repList.find(r => r.id === a.rep_id)?.display_name ?? null
      sharedBy.set(a.key_message_id, [...(sharedBy.get(a.key_message_id) ?? []), { repName: name, style: a.style, text: a.attempt_text, feedback: a.feedback, createdAt: a.created_at }])
    }
    return {
      status: 200,
      body: {
        role: 'manager',
        reps: repList.map(r => ({ id: r.id, name: r.display_name })),
        messages: mine.map(r => {
          const audience = r.rep_ids ? repList.filter(x => r.rep_ids!.includes(x.id)) : repList
          const finished = done.get(r.id) ?? new Set<string>()
          return { id: r.id, text: r.message_text, mode: r.mode, versions: r.versions, dueDate: r.due_date, createdAt: r.created_at, total: audience.length, completed: audience.filter(x => finished.has(x.id)).length, shared: sharedBy.get(r.id) ?? [] }
        }),
      },
    }
  }

  const visible = visibleToRep(rows, userId)
  const ids = visible.map(r => r.id)
  const { data: progress } = ids.length ? await db.from('key_message_progress').select('key_message_id').eq('rep_id', userId).in('key_message_id', ids) : { data: [] }
  const finished = new Set(((progress as Array<{ key_message_id: string }> | null) ?? []).map(p => p.key_message_id))
  const { data: doctors } = await db.from('doctors').select('id, name, style').eq('rep_id', userId).order('updated_at', { ascending: false }).limit(100)
  return {
    status: 200,
    body: {
      role: 'rep',
      doctors: (doctors as Array<{ id: string; name: string; style: KmStyle | null }> | null) ?? [],
      messages: visible.map(r => ({ id: r.id, text: r.message_text, mode: r.mode, versions: r.versions, dueDate: r.due_date, doctorId: r.doctor_id, fromManager: r.created_by_role === 'manager', completed: finished.has(r.id) })),
    },
  }
}

export async function createKeyMessage(db: SupabaseClient, complete: CompleteFn, userId: string, input: KeyMessageInput): Promise<Result> {
  const profile = await me(db, userId)
  if (!profile?.company_id) return fail(403, 'no_company')
  const role = profile.role === 'manager' ? 'manager' : 'rep'

  let repIds: string[] | null
  let doctorId: string | null = null
  if (role === 'manager') {
    if (input.doctorId) return fail(400, 'invalid_input')
    repIds = input.repIds
    if (repIds) {
      const { data } = await db.from('profiles').select('id').eq('company_id', profile.company_id).eq('role', 'rep').in('id', repIds)
      if (((data as unknown[] | null) ?? []).length !== repIds.length) return fail(400, 'invalid_reps')
    }
  } else {
    repIds = [userId]
    if (input.repIds && (input.repIds.length !== 1 || input.repIds[0] !== userId)) return fail(403, 'forbidden')
    if (input.doctorId) {
      const { data: doctor } = await db.from('doctors').select('id').eq('id', input.doctorId).eq('rep_id', userId).maybeSingle()
      if (!doctor) return fail(404, 'doctor_not_found')
      doctorId = input.doctorId
    }
  }

  const raw = await complete(versionsPrompt(input.text))
  let versions = raw ? parseVersions(raw) : null
  if (!versions) return fail(502, 'generation_unavailable')
  // Second pass: drop sentences that add a claim the message never made. Fails open.
  const checkRaw = await complete(fidelityPrompt(input.text, versions))
  const added = checkRaw ? parseFidelity(checkRaw) : null
  let uncleaned: KmStyle[] = []
  if (added) {
    const checked = applyFidelity(versions, added)
    versions = checked.versions
    uncleaned = checked.kept
    if (checked.removed) console.warn('[key-message] removed added claims', checked.removed)
  }

  const row = {
    company_id: profile.company_id, created_by: userId, created_by_role: role, rep_ids: repIds, doctor_id: doctorId,
    message_text: input.text, mode: input.mode, versions, due_date: input.dueDate, active: true,
  }
  const { data, error } = await db.from('key_messages').insert(row).select('id').single()
  if (error || !data) return fail(503, 'storage_unavailable')
  return { status: 200, body: { id: (data as { id: string }).id, versions, uncleaned } }
}

export async function practiceKeyMessage(db: SupabaseClient, complete: CompleteFn, userId: string, messageId: string, input: PracticeInput & { share: boolean }): Promise<Result> {
  const profile = await me(db, userId)
  if (!profile?.company_id) return fail(403, 'no_company')
  if (profile.role === 'manager') return fail(403, 'reps_only')
  const { data } = await db.from('key_messages').select('*').eq('id', messageId).eq('company_id', profile.company_id).maybeSingle()
  const message = data as Row | null
  if (!message || visibleToRep([message], userId).length === 0) return fail(404, 'not_found')

  const raw = await complete(feedbackPrompt(message.message_text, input.style, input.text))
  const feedback: Feedback | null = raw ? parseFeedback(raw) : null
  if (!feedback) return fail(502, 'coach_unavailable')

  const { data: attempt, error } = await db.from('key_message_attempts').insert({
    key_message_id: message.id, rep_id: userId, style: input.style, attempt_text: input.text, feedback, shared_with_manager: input.share && message.created_by_role === 'manager',
  }).select('id').single()
  if (error || !attempt) return fail(503, 'storage_unavailable')
  // Finishing is one attempt, in any style. Manager sees this row only, never the text unless shared.
  await db.from('key_message_progress').upsert({ key_message_id: message.id, rep_id: userId }, { onConflict: 'key_message_id,rep_id', ignoreDuplicates: true })
  return { status: 200, body: { id: (attempt as { id: string }).id, feedback } }
}
