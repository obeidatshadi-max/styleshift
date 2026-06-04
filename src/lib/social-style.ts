import type { StyleKey } from '@/types/game'

// The Social Style model is defined by two behavioral dimensions:
//   Assertiveness:  ASK (asks, slower, reserved)  ↔  TELL (asserts, fast, direct)
//   Responsiveness: CONTROLS (task-focused)        ↔  EMOTES (people-focused)
// The four quadrants are the four styles.

export type Assertiveness = 'ask' | 'tell'
export type Responsiveness = 'controls' | 'emotes'

export const OBJECTION_CATEGORIES = ['evidence', 'price', 'safety', 'time', 'competitor', 'logistics', 'trust'] as const
export type ObjectionCategory = (typeof OBJECTION_CATEGORIES)[number]

/** Map a position on the two axes to a social style. */
export function deriveStyle(a: Assertiveness, r: Responsiveness): StyleKey {
  if (a === 'tell') return r === 'controls' ? 'driver' : 'expressive'
  return r === 'controls' ? 'analytical' : 'amiable'
}
