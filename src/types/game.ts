import type { SpsKey, SpsResult } from '@/lib/sps-core'
import type { ObjectionCategory } from '@/lib/social-style'

export type StyleKey = 'driver' | 'expressive' | 'amiable' | 'analytical'

export interface StyleDef {
  name: string
  cls: string
  icon: string
  drive: string
  blurb: string
}

export type Specialty =
  | 'cardiology' | 'endocrinology' | 'oncology' | 'pediatrics'
  | 'general_practice' | 'dermatology' | 'respiratory' | 'psychiatry_neurology'

export interface SpecialtyDef { name: string; icon: string }

export interface L1Item {
  id: number
  style: StyleKey
  name: string
  persona: string
  cues: string[]
  difficulty?: number
}

export interface L2Option { t: string; r: 'win' | 'escalate'; why: string }
export interface L2Item {
  id: number; style: StyleKey; name: string; crisis: string; q: string; opts: L2Option[]; difficulty?: number
}

export interface L3Option { t: string; correct: boolean; why: string }
export interface L3Item {
  id: number; multi: boolean; style?: StyleKey; name: string; persona: string
  situation: string; q: string; opts: L3Option[]; difficulty?: number
}

export interface L4Option { t: string; quota: number; morale: number; risk: number; why: string }
export interface L4Item { id: number; q: string; opts: L4Option[]; difficulty?: number }

export interface Rank { name: string; minXp: number }

export interface XpValues {
  correct: number; fastBonus: number; levelComplete: number
  perfectLevel: number; dailyStreak: number; roleplayComplete: number
  voicePartnerWin: number
}

export interface Profile {
  id: string
  display_name: string | null
  xp: number
  last_visit: string | null
  company_id: string | null
  group_id: string | null
  role: string
  avatar_url: string | null
  sps_top_key: SpsKey | null
  sps_profile: SpsResult | null
}

export interface GameSession {
  level: number
  idx: number
  results: boolean[]
  stress?: number
  meters?: { quota: number; morale: number; risk: number }
}

export type BadgeName =
  | 'First Scan'
  | 'Crisis Tamer'
  | 'Drive Whisperer'
  | 'Boardroom Ace'
  | 'Style Master'

export interface Doctor {
  id: string
  rep_id: string
  name: string
  specialty: string | null
  workplace: string | null
  style: StyleKey | null
  assertiveness: 'ask' | 'tell' | null
  responsiveness: 'controls' | 'emotes' | null
  key_phrases: string | null
  objections: string[]
  objection_notes: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // Phase 1 AI-Doctor additions (all nullable/optional — no UI authors these
  // yet, so every existing row and every existing literal keeps compiling
  // and behaving exactly as before). See docs/ai-doctor-phase-1-plan.md 1.4/1.5/1.8.
  style_driver?: number | null
  style_expressive?: number | null
  style_amiable?: number | null
  style_analytical?: number | null
  hidden_concern?: string | null
  product_context?: string | null
  meeting_stage?: string | null
  available_time_min?: number | null
}

// Fields a rep can set when creating/editing a doctor profile.
export type DoctorInput = Omit<Doctor, 'id' | 'rep_id' | 'created_at' | 'updated_at'>

// A timestamped entry on a doctor's Digital Twin: a real visit or an
// auto-logged practice session, so prep sharpens with each visit.
export interface DoctorVisit {
  id: string
  doctor_id: string
  rep_id: string
  source: 'manual' | 'warmup' | 'ai_drill' | 'voice_partner' | 'voice_partner_opening' | 'voice_partner_question' | 'voice_partner_fab' | 'voice_partner_closing'
  objection_raised: string | null
  promise_made: string | null
  what_worked: string | null
  note: string | null
  created_at: string
}

export type DoctorVisitInput = Pick<DoctorVisit, 'source'> &
  Partial<Pick<DoctorVisit, 'objection_raised' | 'promise_made' | 'what_worked' | 'note'>>

// A single persisted turn in an AI-Doctor voice-partner session — the
// evidence store Phase 2 (docs/ai-doctor-phase-1-plan.md's "Deferred" list)
// reads to ground every score/critical-moment in a real transcript line.
// See supabase/migrations/026_ai_doctor_phase1.sql.
export interface ConversationTurn {
  id: string
  session_id: string
  rep_id: string
  doctor_id: string | null
  turn_index: number
  role: 'doctor' | 'rep'
  text: string
  objection_type: string | null
  clear_steps_hit: string[]
  trust: number | null
  skepticism: number | null
  engagement: number | null
  time_pressure: number | null
  created_at: string
}

// A named practice colleague — deliberately minimal (see `colleagues`
// migration comment): a practice partner's identity, not a prep target.
export interface Colleague {
  id: string
  rep_id: string
  name: string
  created_at: string
}

export type ColleagueInput = Pick<Colleague, 'name'>

// A row from a colleague's (or doctor's) roleplay session history —
// scores only, matching the privacy shape of `roleplay_sessions` itself:
// never the transcript, never the audio.
export interface RoleplaySessionSummary {
  id: string
  created_at: string
  duration_sec: number
  talk_ratio: number
  question_ratio: number
  open_question_ratio: number | null
  paraphrase_score: number | null
  active_listening_score: number | null
  rep_style: StyleKey | null
  rep_confidence: number | null
}

// A coaching assignment: the manager targets one objection category or one
// level; each targeted rep completes one qualifying run before the due date.
export interface Assignment {
  id: string
  company_id: string
  target_type: 'category' | 'level'
  target_key: string
  rep_ids: string[] | null
  due_date: string
  active: boolean
  created_at: string
}

// The rep-facing view returned by GET /api/assignments.
export interface RepAssignment {
  assignment: Assignment
  completed: boolean
}

// A rep's opt-in share of proof-of-work against an assignment: one roleplay
// session's scores, or a free-text note. Never automatic — the rep picks
// what (if anything) the manager sees.
export interface AssignmentReply {
  id: string
  assignment_id: string
  rep_id: string
  kind: 'doctor_session' | 'colleague_session' | 'note'
  session_id: string | null
  note_text: string | null
  created_at: string
}

// One row of the manager-facing completion table.
export interface AssignmentRepStatus {
  rep_id: string
  name: string | null
  completed_at: string | null
  /** The rep's most recent shared reply, if any — never fetched unless shared. */
  reply: (AssignmentReply & { session: RoleplaySessionSummary | null }) | null
}

// An AI-generated, doctor-specific objection drill (Visit Prep Layer 2).
// `category` is optional — the AI-drill prompt doesn't ask for one (yet),
// but a company-authored scenario always carries it, driving the bias callout.
export interface GeneratedScenario {
  name: string
  style: StyleKey
  crisis: string
  q: string
  opts: { t: string; r: 'win' | 'escalate'; why: string }[]
  category?: ObjectionCategory
}

// A company-authored objection drill. Same playable shape as GeneratedScenario
// (name/style/crisis/q/opts/category), plus a manager-authoring/approval
// workflow — draft is manager-only, approved is visible to the whole
// company's reps.
export interface CompanyScenario {
  id: string
  company_id: string
  created_by: string
  style: StyleKey
  name: string
  crisis: string
  q: string
  opts: { t: string; r: 'win' | 'escalate'; why: string }[]
  category: ObjectionCategory
  status: 'draft' | 'approved' | 'archived'
  approved_by: string | null
  approved_at: string | null
  created_at: string
}

export type CompanyScenarioInput = Pick<CompanyScenario, 'style' | 'name' | 'crisis' | 'q' | 'opts' | 'category'>
