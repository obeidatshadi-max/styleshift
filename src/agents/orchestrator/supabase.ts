import type { SupabaseClient } from '@supabase/supabase-js'
import type { Doctor, Profile } from '@/types/game'
import { personaFromDoctor } from './persona'
import type { PersonaLoader, SessionRecord, SessionStore } from './types'

/** Persists the orchestrator record in `agent_sessions` (migration 032).
 * Uses the caller's own Supabase client, so RLS confines every read and write
 * to that rep's rows — an id belonging to someone else simply reads as absent. */
export function createSupabaseSessionStore(supabase: SupabaseClient): SessionStore {
  return {
    async get(sessionId) {
      const { data, error } = await supabase
        .from('agent_sessions').select('record').eq('id', sessionId).maybeSingle()
      if (error) throw new Error(`agent_sessions read failed: ${error.message}`)
      return (data?.record as SessionRecord | undefined) ?? null
    },
    async save(record) {
      const { error } = await supabase.from('agent_sessions').upsert({
        id: record.session.sessionId,
        rep_id: record.session.rep.repId,
        doctor_id: record.session.physician.doctorId,
        phase: record.phase,
        record,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      if (error) throw new Error(`agent_sessions write failed: ${error.message}`)
    },
  }
}

/** Reads the rep's own doctor (RLS) and profile, then maps them onto the
 * shared session's persona sections. Returns null if either is missing. */
export function createSupabasePersonaLoader(supabase: SupabaseClient): PersonaLoader {
  return {
    async load(repId, doctorId, opts) {
      const [{ data: doctor }, { data: profile }] = await Promise.all([
        supabase.from('doctors').select('*').eq('id', doctorId).eq('rep_id', repId).maybeSingle(),
        supabase.from('profiles').select('id, display_name, company_id, sps_top_key, sps_profile').eq('id', repId).maybeSingle(),
      ])
      if (!doctor || !profile) return null
      return personaFromDoctor(
        doctor as Doctor,
        profile as Pick<Profile, 'id' | 'display_name' | 'company_id' | 'sps_top_key' | 'sps_profile'>,
        opts,
      )
    },
  }
}
