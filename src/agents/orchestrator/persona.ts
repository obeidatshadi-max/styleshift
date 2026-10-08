import type { Doctor, Profile } from '@/types/game'
import { isSpecialty, seedPhysicianState, type Difficulty } from '@/lib/voice-partner-core'
import { resolveDoctorStyleProfile } from '@/lib/session-evaluator'
import type { PersonaData } from './types'

/** Pure mapping from the rows the app already stores (a `doctors` row and the
 * rep's `profiles` row) to the shared session's persona sections. A database
 * adapter reads the rows (RLS keeps a rep to their own doctors) and calls this. */
export function personaFromDoctor(
  doctor: Doctor,
  profile: Pick<Profile, 'id' | 'display_name' | 'company_id' | 'sps_top_key' | 'sps_profile'>,
  opts: { difficulty: Difficulty },
): PersonaData {
  const style = resolveDoctorStyleProfile(doctor)
  return {
    rep: {
      repId: profile.id, displayName: profile.display_name, companyId: profile.company_id,
      spsTopKey: profile.sps_top_key, spsProfile: profile.sps_profile,
    },
    physician: {
      doctorId: doctor.id, name: doctor.name, workplace: doctor.workplace, keyPhrases: doctor.key_phrases,
      hiddenConcern: doctor.hidden_concern ?? null, notes: doctor.notes,
      meetingStage: doctor.meeting_stage ?? null, availableTimeMin: doctor.available_time_min ?? null,
      initialState: seedPhysicianState(doctor, opts.difficulty),
    },
    specialty: isSpecialty(doctor.specialty) ? doctor.specialty : null,
    socialStyle: {
      primary: doctor.style, weights: style.weights, dominant: style.dominant, source: style.source,
      assertiveness: doctor.assertiveness, responsiveness: doctor.responsiveness,
    },
    objections: { activeType: null, onProfile: doctor.objections ?? [], notes: doctor.objection_notes },
    product: { name: null, context: doctor.product_context ?? null },
  }
}
