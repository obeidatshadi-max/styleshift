import type { StyleDef, StyleKey, Specialty, SpecialtyDef, Rank, XpValues } from '@/types/game'

/** Small game constants used across the app (style names, specialties, ranks, XP). The level
 * scenarios stay in game-data.ts, which re-exports these. Split out for page size (review F9). */
export const STYLES: Record<StyleKey, StyleDef> = {
  driver:     { name:'Driver',     cls:'driver',     icon:'▲', drive:'Control & Achievement', blurb:'Direct and firm. Focused on results and return. Decides fast and dislikes wasted time.' },
  expressive: { name:'Expressive', cls:'expressive', icon:'✦', drive:'Recognition & Ideas',   blurb:'Energetic, full of big ideas, likes to work with others. Loves being seen as new and different.' },
  amiable:    { name:'Amiable',    cls:'amiable',    icon:'♥', drive:'Security & Harmony',    blurb:'Warm and patient. Puts relationships first. Avoids risk and wants everyone to agree.' },
  analytical: { name:'Analytical', cls:'analytical', icon:'◆', drive:'Certainty & Accuracy',  blurb:'Exact and logical. Led by data. Wants evidence and time to decide.' },
}


export const STYLE_ORDER: StyleKey[] = ['driver','expressive','amiable','analytical']


export const SPECIALTIES: Record<Specialty, SpecialtyDef> = {
  cardiology:           { name:'Cardiology',            icon:'♡' },
  endocrinology:        { name:'Endocrinology',         icon:'⚖' },
  oncology:             { name:'Oncology',               icon:'✚' },
  pediatrics:           { name:'Pediatrics',             icon:'★' },
  general_practice:     { name:'General Practice',       icon:'●' },
  dermatology:          { name:'Dermatology',            icon:'◐' },
  respiratory:          { name:'Respiratory',            icon:'≈' },
  psychiatry_neurology: { name:'Psychiatry & Neurology', icon:'◈' },
}


export const SPECIALTY_ORDER: Specialty[] = [
  'cardiology', 'endocrinology', 'oncology', 'pediatrics',
  'general_practice', 'dermatology', 'respiratory', 'psychiatry_neurology',
]


export const RANKS: Rank[] = [
  { name:'Rookie',       minXp:0 },
  { name:'Field Rep',    minXp:200 },
  { name:'Style Reader', minXp:500 },
  { name:'Drive Expert', minXp:1000 },
  { name:'Style Master', minXp:2000 },
]


export const XP_VALUES: XpValues = {
  correct:         20,
  fastBonus:       10,
  levelComplete:   50,
  perfectLevel:    100,
  dailyStreak:     30,
  roleplayComplete: 40,
  voicePartnerWin:  40,
}

