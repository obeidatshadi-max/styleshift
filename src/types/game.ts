export type StyleKey = 'driver' | 'expressive' | 'amiable' | 'analytical'

export interface StyleDef {
  name: string
  cls: string
  icon: string
  drive: string
  blurb: string
}

export interface L1Item {
  style: StyleKey
  name: string
  persona: string
  cues: string[]
}

export interface L2Option { t: string; r: 'win' | 'escalate'; why: string }
export interface L2Item {
  style: StyleKey; name: string; crisis: string; q: string; opts: L2Option[]
}

export interface L3Option { t: string; correct: boolean; why: string }
export interface L3Item {
  multi: boolean; style?: StyleKey; name: string; persona: string
  situation: string; q: string; opts: L3Option[]
}

export interface L4Option { t: string; quota: number; morale: number; risk: number; why: string }
export interface L4Item { q: string; opts: L4Option[] }

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
