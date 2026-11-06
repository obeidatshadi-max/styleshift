import type { SupabaseClient } from '@supabase/supabase-js'
import type { CaseRow, DataSource, Member, MemberRole, NewCase, Person, Pilot, PilotAdminStore, PilotStatus, SessionType } from './pilot-admin-service'
import { RUBRIC_VERSION } from './rubric'
import { METHODOLOGY_VERSION, PROTOCOL_VERSION } from './pilot-admin-service'

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data
}

type PilotRow = { id: string; name: string; status: PilotStatus; data_source: DataSource; company_id: string }
const toPilot = (r: PilotRow): Pilot => ({ id: r.id, name: r.name, status: r.status, dataSource: r.data_source, companyId: r.company_id })

/**
 * Supabase implementation of PilotAdminStore.
 *
 * Who counts as an administrator is decided as the signed-in user (`userDb`), through row-level security: they must
 * hold an administrator membership of the pilot. Every write goes through `adminDb` because these tables have no
 * write policy for signed-in users, and happens only after that check. Reads of other people's profiles are limited
 * to the pilot's own company.
 */
export function supabasePilotAdminStore(userDb: SupabaseClient, adminDb: SupabaseClient, userId: string): PilotAdminStore {
  async function administeredPilotIds(): Promise<string[]> {
    const rows = check(await userDb.from('validation_pilot_members').select('pilot_id').eq('user_id', userId).eq('role', 'administrator')) ?? []
    return rows.map(r => r.pilot_id as string)
  }

  return {
    async myPilots() {
      const ids = await administeredPilotIds()
      if (!ids.length) return []
      // Same rule as pilot(): the pilots listed are the ones the caller can still administer.
      const rows = check(await userDb.from('validation_pilots').select('id, name, status, data_source, company_id').in('id', ids).order('created_at', { ascending: false })) ?? []
      return (rows as PilotRow[]).map(toPilot)
    },

    async pilot(pilotId) {
      if (!(await administeredPilotIds()).includes(pilotId)) return null
      const row = check(await userDb.from('validation_pilots').select('id, name, status, data_source, company_id').eq('id', pilotId).maybeSingle())
      if (!row) return null
      // Administrator rights follow the caller's CURRENT profile, read by the server: still a manager, still in the
      // pilot's company. (The database policy checks the same, so a stale membership row grants nothing in either place.)
      const me = check(await adminDb.from('profiles').select('role, company_id').eq('id', userId).maybeSingle())
      if (!me || me.role !== 'manager' || me.company_id !== (row as PilotRow).company_id) return null
      return toPilot(row as PilotRow)
    },

    async createPilot({ companyId, name, dataSource }) {
      const made = check(await adminDb.from('validation_pilots').insert({
        company_id: companyId, name, data_source: dataSource, rubric_version: RUBRIC_VERSION,
        methodology_version: METHODOLOGY_VERSION, protocol_version: PROTOCOL_VERSION, created_by: userId,
      }).select('id').single())
      if (!made) throw new Error('pilot was not created')
      const id = made.id as string
      const member = await adminDb.from('validation_pilot_members').insert({ pilot_id: id, user_id: userId, role: 'administrator' })
      if (member.error) {
        await adminDb.from('validation_pilots').delete().eq('id', id)  // no pilot without an administrator
        throw new Error(member.error.message)
      }
      return { id }
    },

    async members(pilotId) {
      const rows = check(await adminDb.from('validation_pilot_members').select('user_id, role').eq('pilot_id', pilotId)) ?? []
      const ids = rows.map(r => r.user_id as string)
      const names = ids.length ? check(await adminDb.from('profiles').select('id, display_name').in('id', ids)) ?? [] : []
      const nameOf = new Map(names.map(p => [p.id as string, (p.display_name as string | null) ?? '']))
      return rows.map((r): Member => ({ userId: r.user_id as string, role: r.role as MemberRole, displayName: nameOf.get(r.user_id as string) || 'Unnamed' }))
    },

    async people(companyId) {
      const rows = check(await adminDb.from('profiles').select('id, display_name, role').eq('company_id', companyId).order('display_name')) ?? []
      return rows.map((p): Person => ({ id: p.id as string, displayName: (p.display_name as string | null) || 'Unnamed', role: p.role as string }))
    },

    async profile(id) {
      const p = check(await adminDb.from('profiles').select('id, display_name, role, company_id').eq('id', id).maybeSingle())
      return p ? { id: p.id as string, displayName: (p.display_name as string | null) || 'Unnamed', role: p.role as string, companyId: (p.company_id as string | null) ?? null } : null
    },

    async addMember(pilotId, uid, role) {
      check(await adminDb.from('validation_pilot_members').insert({ pilot_id: pilotId, user_id: uid, role }))
    },

    async cases(pilotId) {
      const asg = check(await adminDb.from('validation_assignments').select('id, rep_id, scenario_type, phase').eq('pilot_id', pilotId)) ?? []
      const links = check(await adminDb.from('validation_assessor_assignments').select('assignment_id, assessor_id').eq('pilot_id', pilotId)) ?? []
      return asg.map((a): CaseRow => ({
        id: a.id as string, repId: a.rep_id as string, scenarioType: a.scenario_type as string, phase: a.phase as string,
        assessorIds: links.filter(l => l.assignment_id === a.id).map(l => l.assessor_id as string),
      }))
    },

    async sessionBelongsToRep(type: SessionType, sessionId, repId) {
      // AI-doctor turns live in conversation_turns; human-partner (colleague) calls are roleplay_sessions.
      const q = type === 'human_partner'
        ? adminDb.from('roleplay_sessions').select('id').eq('id', sessionId).eq('rep_id', repId).limit(1)
        : adminDb.from('conversation_turns').select('id').eq('session_id', sessionId).eq('rep_id', repId).limit(1)
      return (check(await q) ?? []).length > 0
    },

    async addCase(pilotId, c: NewCase) {
      const made = check(await adminDb.from('validation_assignments').insert({
        pilot_id: pilotId, rep_id: c.repId, session_type: c.sessionType, session_id: c.sessionId, scenario_type: c.scenarioType,
        scenario_version: c.scenarioVersion, phase: c.phase, seen_before: c.seenBefore,
      }).select('id').single())
      if (!made) throw new Error('case was not created')
      const id = made.id as string
      const links = await adminDb.from('validation_assessor_assignments').insert(c.assessorIds.map(a => ({ assignment_id: id, assessor_id: a, pilot_id: pilotId, scenario_type: c.scenarioType })))
      if (links.error) {
        await adminDb.from('validation_assignments').delete().eq('id', id)  // no case without its assessors
        throw new Error(links.error.message)
      }
      return { id }
    },

    async setStatus(pilotId, status) {
      check(await adminDb.from('validation_pilots').update({ status }).eq('id', pilotId).select('id'))
    },
  }
}
