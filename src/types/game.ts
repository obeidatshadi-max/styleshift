export type StyleKey = 'driver' | 'expressive' | 'amiable' | 'analytical'

export interface StyleDef {
  name: string
  cls: string
  icon: string
  drive: string
  blurb: string
}

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
  perfectLevel: number; dailyStreak: number
}

export interface Profile {
  id: string
  display_name: string | null
  xp: number
  last_visit: string | null
  company_id: string | null
  role: string
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
}

// Fields a rep can set when creating/editing a doctor profile.
export type DoctorInput = Omit<Doctor, 'id' | 'rep_id' | 'created_at' | 'updated_at'>

// An AI-generated, doctor-specific objection drill (Visit Prep Layer 2).
export interface GeneratedScenario {
  name: string
  style: StyleKey
  crisis: string
  q: string
  opts: { t: string; r: 'win' | 'escalate'; why: string }[]
}
