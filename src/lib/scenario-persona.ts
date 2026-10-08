import type { Doctor, Profile, StyleKey } from '@/types/game'
import { SPECIALTIES } from '@/lib/game-data'
import { pickObjectionType, type ObjectionType } from '@/lib/voice-partner-core'
import { personaFromDoctor } from '@/agents/orchestrator/persona'
import type { PersonaData } from '@/agents/orchestrator/types'
import type { LearningObjective } from '@/schemas/session'
import {
  toEngineSetup, type AdoptionAttitude, type EngineSetup, type Seniority, type SimScenario,
} from '@/schemas/scenario'

const SENIORITY_LABEL: Record<Seniority, string> = {
  resident: 'Resident', specialist: 'Specialist', consultant: 'Consultant',
  professor: 'Professor', head_of_department: 'Head of department',
}

/** Merrill-Reid axes behind each style (same mapping social-style.ts uses to derive a style). */
const AXES: Record<StyleKey, { assertiveness: 'ask' | 'tell'; responsiveness: 'controls' | 'emotes' }> = {
  driver: { assertiveness: 'tell', responsiveness: 'controls' },
  expressive: { assertiveness: 'tell', responsiveness: 'emotes' },
  amiable: { assertiveness: 'ask', responsiveness: 'emotes' },
  analytical: { assertiveness: 'ask', responsiveness: 'controls' },
}

/** Starting-state nudges from the doctor's stated attitude to the product (on the 0-100 state scale). */
const ATTITUDE_NUDGE: Record<AdoptionAttitude, { trust: number; skepticism: number; engagement: number }> = {
  enthusiastic: { trust: 10, skepticism: -10, engagement: 10 },
  open: { trust: 5, skepticism: -5, engagement: 5 },
  neutral: { trust: 0, skepticism: 0, engagement: 0 },
  cautious: { trust: -5, skepticism: 5, engagement: 0 },
  opposed: { trust: -10, skepticism: 10, engagement: -5 },
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

/**
 * A scenario has no `doctors` row, so it is mapped to an in-memory one and
 * pushed through the SAME personaFromDoctor the saved-doctor path uses. The
 * doctor agent, analyst and scorer therefore see a scenario exactly like any
 * other doctor.
 */
export function doctorFromScenario(s: SimScenario, repId: string): Doctor {
  const axes = AXES[s.physician.style]
  const background = [
    `Relationship with the rep: ${s.physician.relationshipStage}.`,
    `Attitude to adopting the product: ${s.physician.adoptionAttitude}.`,
    s.competitorSituation ? `Competitor situation: ${s.competitorSituation}` : '',
    s.patientPopulation ? `Patient population: ${s.patientPopulation}` : '',
    `Purpose of this visit: ${s.visitPurpose}`,
    s.desiredNextStep ? `A good outcome would be: ${s.desiredNextStep}` : '',
    s.optionalObjections.length ? `You may also raise: ${s.optionalObjections.map(o => o.text ?? o.type.replace(/_/g, ' ')).join('; ')}.` : '',
  ].filter(Boolean).join(' ')
  return {
    id: 'scenario', rep_id: repId,
    name: `${SENIORITY_LABEL[s.physician.seniority]} ${SPECIALTIES[s.physician.specialty].name.toLowerCase()} specialist`,
    specialty: s.physician.specialty, workplace: null,
    style: s.physician.style, assertiveness: axes.assertiveness, responsiveness: axes.responsiveness,
    key_phrases: null,
    objections: [...s.mainConcerns, ...s.requiredObjections.flatMap(o => o.text ? [o.text] : [])],
    objection_notes: null, notes: background, created_at: '', updated_at: '',
    hidden_concern: s.hiddenConcern,
    product_context: [s.productName ? `Product: ${s.productName}.` : '', `Therapeutic area: ${s.therapeuticArea}.`].filter(Boolean).join(' '),
    meeting_stage: `${s.physician.relationshipStage} relationship; ${s.visitPurpose}`,
    available_time_min: s.availableTimeMin,
  }
}

export interface ScenarioRun {
  persona: PersonaData
  setup: EngineSetup
  objectionType: ObjectionType
  learningObjectives: LearningObjective[]
}

/** Everything the orchestrator needs to start a simulation from a scenario. */
export function scenarioRun(
  s: SimScenario,
  profile: Pick<Profile, 'id' | 'display_name' | 'company_id' | 'sps_top_key' | 'sps_profile'>,
  pick: () => ObjectionType = pickObjectionType,
): ScenarioRun {
  const setup = toEngineSetup(s)
  const persona = personaFromDoctor(doctorFromScenario(s, profile.id), profile, { difficulty: setup.difficulty })
  // A scenario is not a saved doctor: nothing to link in agent_sessions.doctor_id.
  persona.physician.doctorId = null
  if (persona.physician.initialState) {
    const n = ATTITUDE_NUDGE[s.physician.adoptionAttitude]
    const st = persona.physician.initialState
    persona.physician.initialState = {
      ...st,
      trust: clamp(st.trust + n.trust),
      skepticism: clamp(st.skepticism + n.skepticism + setup.skepticismBias * 100),
      engagement: clamp(st.engagement + n.engagement),
    }
  }
  // Required objections are guaranteed to appear first; with none required the engine picks as usual.
  const objectionType = s.requiredObjections[0]?.type ?? s.optionalObjections[0]?.type ?? pick()
  const learningObjectives: LearningObjective[] = s.learningObjectives.map((label, i) => ({
    id: `scenario-${i + 1}`, label, focusStep: null, targetObjection: null, source: 'manager',
  }))
  return { persona, setup, objectionType, learningObjectives }
}

export interface ScenarioPreview {
  headline: string
  doctorBrief: string[]
  engine: string[]
  warnings: string[]
}

/** Plain-language preview for the builder: what the doctor will be and how it will run. */
export function previewScenario(s: SimScenario): ScenarioPreview {
  const setup = toEngineSetup(s)
  const doc = doctorFromScenario(s, 'preview')
  const warnings: string[] = []
  if (!s.hiddenConcern) warnings.push('No hidden concern: the doctor will have nothing to hold back until earned.')
  if (!s.requiredObjections.length) warnings.push('No required objection: the engine will pick one at random.')
  if (s.language === 'ar') warnings.push('Arabic doctor speech uses the Iraqi dialect setting; text written here is not translated for you.')
  if (s.knowledgePackId) warnings.push('Knowledge pack linked: the doctor, coach and report use its approved items. Product claims outside them stay unavailable. If the pack is not approved when a rep starts, the session runs without it.')
  if (setup.skepticismBias > 0) warnings.push('"Skeptical" runs as Normal with a higher starting skepticism.')
  return {
    headline: `${doc.name} · ${s.physician.style} · ${s.difficulty.replace('_', ' ')} · ${s.availableTimeMin} min`,
    doctorBrief: [
      `Main concerns: ${s.mainConcerns.join('; ')}`,
      s.hiddenConcern ? `Hidden concern (only if earned): ${s.hiddenConcern}` : '',
      `Visit purpose: ${s.visitPurpose}`,
      s.desiredNextStep ? `Desired next step: ${s.desiredNextStep}` : '',
      s.requiredObjections.length ? `Required objections: ${s.requiredObjections.map(o => o.text ?? o.type).join('; ')}` : '',
    ].filter(Boolean),
    engine: [`Engine difficulty: ${setup.difficulty}`, `Language: ${s.language}${setup.arabicVariant ? ` (${setup.arabicVariant})` : ''}`],
    warnings,
  }
}
