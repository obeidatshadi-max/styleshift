import { applyStateDelta, type PhysicianState, type StateDelta } from '@/lib/voice-partner-core'

/** What the rep's line LOOKS like to a busy doctor — length and question
 * shape only. Deterministic, no LLM: this drives how the doctor reacts (state
 * shift + prompt cue), it is never shown to the rep and is not a score. */
export interface RepTurnShape {
  words: number
  askedQuestion: boolean
  askedOpenQuestion: boolean
  talkedTooLong: boolean
}

export const LONG_TURN_WORDS = 70
export const VERY_LONG_TURN_WORDS = 130

const OPEN_EN = /\b(what|how|why|tell me|walk me through|help me understand|could you (explain|share)|can you (explain|share)|when do you|which)\b/i
// Iraqi/Levantine/MSA interrogatives: شنو ليش شلون كيف شكو متى ماذا لماذا وين اي (which)
const OPEN_AR = /(شنو|ليش|شلون|كيف|شكو|متى|ماذا|لماذا|وين|أي |اي |احجيلي|اشرح)/

export function analyzeRepTurn(text: string): RepTurnShape {
  const trimmed = text.trim()
  const words = trimmed ? trimmed.split(/\s+/).length : 0
  const askedQuestion = /[?؟]/.test(trimmed)
  const askedOpenQuestion = askedQuestion && (OPEN_EN.test(trimmed) || OPEN_AR.test(trimmed))
  return { words, askedQuestion, askedOpenQuestion, talkedTooLong: words >= LONG_TURN_WORDS }
}

/** How this rep line shifts the doctor's feelings. A long monologue drains
 * engagement/trust; a genuine open question restores them; a closed question
 * is mildly neutral-positive. Bounded to the same -10..+10 range the state
 * engine already enforces. */
export function repTurnToDelta(shape: RepTurnShape): StateDelta {
  if (shape.words >= VERY_LONG_TURN_WORDS) {
    return { trustDelta: -3, skepticismDelta: 3, engagementDelta: shape.askedOpenQuestion ? -6 : -10 }
  }
  if (shape.talkedTooLong) {
    return { trustDelta: -2, skepticismDelta: 2, engagementDelta: shape.askedOpenQuestion ? -2 : -7 }
  }
  if (shape.askedOpenQuestion) return { trustDelta: 4, skepticismDelta: -3, engagementDelta: 8 }
  if (shape.askedQuestion) return { trustDelta: 1, skepticismDelta: 0, engagementDelta: 2 }
  return { trustDelta: 0, skepticismDelta: 0, engagementDelta: 0 }
}

export function nextPhysicianState(state: PhysicianState, shape: RepTurnShape): PhysicianState {
  return applyStateDelta(state, repTurnToDelta(shape))
}
