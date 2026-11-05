import type { SupabaseClient } from '@supabase/supabase-js'
import { isMobileRepEmail, mobileFromEmail } from './rep-pin'

/**
 * A manager resets the PIN of one of their own reps. The client is the service-role client, so this
 * checks the rep belongs to the caller's team itself. Every reset leaves an audit record first, so a
 * PIN cannot change without one; the new PIN is returned once and never stored or logged.
 */
export interface Result { status: number; body: Record<string, unknown> }
const fail = (status: number, error: string): Result => ({ status, body: { error } })

export interface ManagerStats { companyId: string; reps: Array<{ id: string; display_name: string | null }> }

/** Each rep, and whether they sign in with a mobile number + PIN (resettable here) or with an email. */
export async function listReps(db: SupabaseClient, stats: ManagerStats): Promise<Result> {
  const reps = await Promise.all(stats.reps.map(async r => {
    const { data } = await db.auth.admin.getUserById(r.id)
    const email = data?.user?.email
    return isMobileRepEmail(email)
      ? { id: r.id, name: r.display_name, kind: 'mobile' as const, mobile: mobileFromEmail(email) }
      : { id: r.id, name: r.display_name, kind: 'email' as const, mobile: null }
  }))
  return { status: 200, body: { reps } }
}

export async function resetPin(db: SupabaseClient, managerId: string, stats: ManagerStats, repId: unknown, newPin: string): Promise<Result> {
  const rep = typeof repId === 'string' ? stats.reps.find(r => r.id === repId) : undefined
  if (!rep) return fail(404, 'That rep is not in your team')

  const { data, error: lookupError } = await db.auth.admin.getUserById(rep.id)
  if (lookupError || !data?.user) return fail(503, 'lookup_unavailable')
  if (!isMobileRepEmail(data.user.email)) return fail(409, 'not_a_pin_account')

  const details = { rep_name: rep.display_name, mobile: mobileFromEmail(data.user.email!) }
  const record = (action: string) => db.from('audit_events').insert({
    company_id: stats.companyId, actor_id: managerId, action, subject_type: 'rep', subject_id: rep.id, details,
  })
  // Record first: if the record cannot be written, nothing changes.
  const { error: auditError } = await record('rep.pin_reset')
  if (auditError) return fail(503, 'audit_unavailable')

  const { error: updateError } = await db.auth.admin.updateUserById(rep.id, { password: newPin })
  if (updateError) {
    await record('rep.pin_reset_failed')
    return fail(503, 'reset_failed')
  }
  return { status: 200, body: { pin: newPin, repName: rep.display_name, mobile: details.mobile } }
}
