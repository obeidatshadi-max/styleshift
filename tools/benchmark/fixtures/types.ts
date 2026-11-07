import type { StyleKey, Specialty } from '@/types/game'
import type { Difficulty, ObjectionType } from '@/lib/voice-partner-core'
import type { StyleShiftSession } from '@/schemas/session'
import { createEmptySession } from '@/schemas/session/factory'

/** How the conversation is spoken. `iraqi` = colloquial Iraqi Arabic,
 * `codeswitch` = Iraqi Arabic with English medical/pharma terms mixed in. */
export type Mix = 'en' | 'iraqi' | 'codeswitch'
export type Performance = 'strong' | 'average' | 'weak'
export type Length = 'short' | 'medium' | 'long'
/** The user's "challenging" maps onto the app's two hard levels. */
export type BenchDifficulty = Extract<Difficulty, 'supportive' | 'realistic' | 'resistant' | 'pressure_test'>

export interface BenchFixture {
  id: string
  mix: Mix
  style: StyleKey
  difficulty: BenchDifficulty
  performance: Performance
  length: Length
  specialty: Specialty
  objection: ObjectionType | null
  /** Every line starts "D|" (doctor) or "R|" (rep). turnIndex = array index. */
  turns: string[]
  /** Answer key. `must`: a rep turn that clearly shows this scored behavior.
   * `mustNot`: a behavior that looks tempting but is NOT supported on that
   * turn (a trap). Authored by hand; native-speaker review is pending for
   * every fixture whose `mix` is not 'en'. */
  must: { behavior: string; turn: number }[]
  mustNot: { behavior: string; turn: number; why: string }[]
  /** What the reviewer should look at (meaning of a colloquial phrase etc.). */
  reviewNote?: string
}

export interface FixtureInput extends Omit<BenchFixture, 'must' | 'mustNot'> {
  must: [string, number][]
  mustNot?: [string, number, string][]
}

export function fx(i: FixtureInput): BenchFixture {
  return {
    ...i,
    must: i.must.map(([behavior, turn]) => ({ behavior, turn })),
    mustNot: (i.mustNot ?? []).map(([behavior, turn, why]) => ({ behavior, turn, why })),
  }
}

const WEIGHTS: Record<StyleKey, StyleKey> = { driver: 'driver', expressive: 'expressive', amiable: 'amiable', analytical: 'analytical' }

/** Builds the exact session both models receive. Same fixture in, same session out. */
export function toSession(f: BenchFixture): StyleShiftSession {
  const s = createEmptySession(`bench-${f.id}`, 'bench-rep')
  s.lang = f.mix === 'en' ? 'en' : 'ar'
  s.status = 'won'
  s.specialty = f.specialty
  s.difficulty = f.difficulty
  s.physician.name = 'Dr. Bench'
  s.socialStyle = {
    primary: WEIGHTS[f.style],
    weights: { driver: 0.1, expressive: 0.1, amiable: 0.1, analytical: 0.1, [f.style]: 0.7 },
    dominant: f.style, source: 'weighted', assertiveness: null, responsiveness: null,
  }
  s.objections = { activeType: f.objection, onProfile: [], notes: null }
  s.product = { name: 'Product X', context: null }
  s.transcript = f.turns.map((line, turnIndex) => {
    const role = line.startsWith('D|') ? 'doctor' : 'rep'
    if (!line.startsWith('D|') && !line.startsWith('R|')) throw new Error(`fixture ${f.id} turn ${turnIndex}: missing D| or R| prefix`)
    return {
      turnIndex, role, text: line.slice(2).trim(), objectionType: null, clearStepsHit: [],
      state: null, vocalFeedback: null, createdAt: null,
    }
  })
  return s
}
