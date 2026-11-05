import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CERTIFICATION_WINDOW_DAYS, buildEvidence, evaluate, makeVerifyCode, parseCriteria,
  type Criteria, type Evidence, type GameStat, type ScorecardRow, type VoiceRow,
} from './certification'

/**
 * Database work for certificates. The client is the service-role client, so each function checks the
 * caller's role and company itself. Results are plain { status, body } so routes stay thin.
 * Issuing and revoking write the audit trail through a database trigger (see the migration), not
 * from this file, so a certificate can never change without a record.
 */
export interface Result { status: number; body: Record<string, unknown> }
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Result => ({ status, body: { error, ...extra } })

export interface ManagerStats { companyId: string; companyName: string; reps: Array<GameStat & { display_name: string | null }> }

interface CertRow {
  id: string; company_id: string; rep_id: string; rep_name: string; program_name: string
  criteria: Criteria; evidence: Evidence; criteria_met: boolean; exception_reason: string | null
  verify_code: string; issued_by: string; issued_at: string
  revoked_at: string | null; revoked_by: string | null; revoke_reason: string | null
}

const publicCert = (c: CertRow) => ({
  id: c.id, repId: c.rep_id, repName: c.rep_name, program: c.program_name, criteria: c.criteria, evidence: c.evidence,
  criteriaMet: c.criteria_met, exceptionReason: c.exception_reason, verifyCode: c.verify_code,
  issuedAt: c.issued_at, revokedAt: c.revoked_at, revokeReason: c.revoke_reason,
})

const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n))

async function repEvidence(db: SupabaseClient, repId: string, game: GameStat | undefined, now: Date): Promise<Evidence> {
  const since = new Date(now.getTime() - CERTIFICATION_WINDOW_DAYS * 86_400_000).toISOString()
  // One rep at a time: a team-wide query would hit the API's row cap and quietly undercount.
  const [voice, cards] = await Promise.all([
    db.from('voice_partner_sessions').select('rep_id, outcome, created_at').eq('rep_id', repId).gte('created_at', since),
    db.from('session_scorecards').select('rep_id, adaptation_score').eq('rep_id', repId).gte('created_at', since),
  ])
  return buildEvidence(game, (voice.data as VoiceRow[] | null) ?? [], (cards.data as ScorecardRow[] | null) ?? [], now)
}

/** Everything the manager panel shows: each rep's current evidence, issued certificates, recent audit events. */
export async function overview(db: SupabaseClient, stats: ManagerStats, now = new Date()): Promise<Result> {
  const repEvidences = await Promise.all(stats.reps.map(async r => ({
    id: r.id, name: r.display_name, evidence: await repEvidence(db, r.id, r, now),
  })))
  const [{ data: certs, error: certError }, { data: events, error: eventError }] = await Promise.all([
    db.from('certifications').select('*').eq('company_id', stats.companyId).order('issued_at', { ascending: false }).limit(200),
    db.from('audit_events').select('id, actor_id, action, subject_type, subject_id, details, created_at')
      .eq('company_id', stats.companyId).order('id', { ascending: false }).limit(100),
  ])
  if (certError || eventError) return fail(503, 'storage_unavailable')
  const names = new Map(stats.reps.map(r => [r.id, r.display_name]))
  const actorIds = [...new Set(((events as Array<{ actor_id: string | null }> | null) ?? []).map(e => e.actor_id).filter((i): i is string => !!i && !names.has(i)))]
  const { data: actors } = actorIds.length ? await db.from('profiles').select('id, display_name').in('id', actorIds) : { data: [] }
  for (const a of (actors as Array<{ id: string; display_name: string | null }> | null) ?? []) names.set(a.id, a.display_name)
  return {
    status: 200,
    body: {
      windowDays: CERTIFICATION_WINDOW_DAYS,
      reps: repEvidences,
      certificates: ((certs as CertRow[] | null) ?? []).map(publicCert),
      audit: ((events as Array<{ id: number; actor_id: string | null; action: string; subject_type: string; subject_id: string | null; details: unknown; created_at: string }> | null) ?? [])
        .map(e => ({ id: e.id, actor: e.actor_id ? names.get(e.actor_id) ?? null : null, action: e.action, subjectType: e.subject_type, subjectId: e.subject_id, details: e.details, at: e.created_at })),
    },
  }
}

export interface IssueInput { repId?: unknown; programName?: unknown; criteria?: unknown; exceptionReason?: unknown }

/** Judges the rep on fresh evidence the server computes (never numbers sent by the browser), then issues. */
export async function issue(db: SupabaseClient, managerId: string, stats: ManagerStats, input: IssueInput, now = new Date()): Promise<Result> {
  const program = typeof input.programName === 'string' ? input.programName.trim() : ''
  if (program.length < 1 || program.length > 120) return fail(400, 'Give the certificate a name (up to 120 characters)')
  const parsed = parseCriteria(input.criteria)
  if (!parsed.ok) return fail(400, parsed.error)
  const rep = stats.reps.find(r => r.id === input.repId)
  if (!rep) return fail(404, 'That rep is not in your team')

  const reason = typeof input.exceptionReason === 'string' ? input.exceptionReason.trim() : ''
  if (reason.length > 500) return fail(400, 'The reason is too long (up to 500 characters)')

  const { data: live, error: liveError } = await db.from('certifications').select('id')
    .eq('rep_id', rep.id).is('revoked_at', null).ilike('program_name', program.replace(/[%_\\]/g, m => `\\${m}`)).limit(1)
  if (liveError) return fail(503, 'storage_unavailable')
  if ((live as unknown[] | null)?.length) return fail(409, 'already_certified')

  const evidence = await repEvidence(db, rep.id, rep, now)
  const eligibility = evaluate(evidence, parsed.criteria)
  if (!eligibility.met && !reason) return fail(409, 'criteria_not_met', { checks: eligibility.checks })

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db.from('certifications').insert({
      company_id: stats.companyId, rep_id: rep.id, rep_name: rep.display_name?.trim() || 'Rep', program_name: program,
      criteria: parsed.criteria, evidence, criteria_met: eligibility.met,
      exception_reason: eligibility.met ? null : reason, verify_code: makeVerifyCode(randomBytes), issued_by: managerId,
    }).select('*').single()
    if (!error) return { status: 201, body: { certificate: publicCert(data as CertRow) } }
    if (error.code !== '23505') return fail(503, 'storage_unavailable')
    // A clash on the live-per-programme index means someone just issued it; a clash on the code means try a new code.
    if (!/verify_code/.test(error.message ?? '')) return fail(409, 'already_certified')
  }
  return fail(503, 'storage_unavailable')
}

export async function revoke(db: SupabaseClient, managerId: string, stats: ManagerStats, input: { id?: unknown; reason?: unknown }, now = new Date()): Promise<Result> {
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (typeof input.id !== 'string' || reason.length < 1 || reason.length > 500) return fail(400, 'A reason is required (up to 500 characters)')
  const { data, error } = await db.from('certifications').update({ revoked_at: now.toISOString(), revoked_by: managerId, revoke_reason: reason })
    .eq('id', input.id).eq('company_id', stats.companyId).is('revoked_at', null).select('*').maybeSingle()
  if (error) return fail(503, 'storage_unavailable')
  if (!data) return fail(404, 'Certificate not found, or already revoked')
  return { status: 200, body: { certificate: publicCert(data as CertRow) } }
}

/** A rep's own certificates, for their home screen. */
export async function listMine(db: SupabaseClient, repId: string): Promise<Result> {
  const { data, error } = await db.from('certifications').select('id, program_name, verify_code, issued_at, revoked_at, company_id')
    .eq('rep_id', repId).order('issued_at', { ascending: false }).limit(50)
  if (error) return fail(503, 'storage_unavailable')
  return {
    status: 200,
    body: {
      certificates: ((data as Array<{ id: string; program_name: string; verify_code: string; issued_at: string; revoked_at: string | null }> | null) ?? [])
        .map(c => ({ id: c.id, program: c.program_name, verifyCode: c.verify_code, issuedAt: c.issued_at, revoked: !!c.revoked_at })),
    },
  }
}

export interface PublicCertificate { program: string; repName: string; companyName: string; issuedAt: string; revokedAt: string | null }

/** What anyone holding the code may see: who, what, for which company, when, and whether it still stands. No evidence, no reasons. */
export async function lookupByCode(db: SupabaseClient, code: string): Promise<PublicCertificate | null> {
  const { data } = await db.from('certifications').select('program_name, rep_name, company_id, issued_at, revoked_at').eq('verify_code', code).maybeSingle()
  const row = data as { program_name: string; rep_name: string; company_id: string; issued_at: string; revoked_at: string | null } | null
  if (!row) return null
  const { data: company } = await db.from('companies').select('name').eq('id', row.company_id).maybeSingle()
  return { program: row.program_name, repName: row.rep_name, companyName: (company as { name: string } | null)?.name ?? '', issuedAt: row.issued_at, revokedAt: row.revoked_at }
}
