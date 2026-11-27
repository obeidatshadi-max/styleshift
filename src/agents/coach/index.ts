import type { Agent } from '@/agents/types'
import { createAnthropicComplete, type CompleteFn } from '@/agents/llm'
import type { CoachingRecommendation } from '@/schemas/coaching'
import type { StyleShiftSession } from '@/schemas/session'
import { extractJson, groundCoaching } from './ground'
import { buildCoachPrompt, COACH_SYSTEM } from './prompt'
import { selectCoachingCandidates } from './select'
import { feedbackLanguageRule } from '@/lib/prompt-language'
import type { FeedbackDialect } from '@/lib/feedback-dialect'

const RETRY_NOTE = '\n\nYour previous response was not valid JSON in the exact shape requested, or a field was empty/too long or mentioned a score or percentage. Return ONLY the JSON object, one entry per coaching point, using each point\'s exact "ref".'

export type CoachError = 'session_not_complete' | 'missing_observations' | 'missing_scores' | 'nothing_to_coach' | 'upstream' | 'invalid'
export interface CoachResult { coaching: CoachingRecommendation[]; dropped: number }

/** `dialect`: the rep's feedback-dialect choice. 'iraqi' makes Arabic coaching text Iraqi (rule appended last). */
export function createCoachAgent(complete: CompleteFn, dialect: FeedbackDialect = 'msa') {
  /** Writes coaching for the points the app selected from the analyst's
   * observations and the engine's scores. Never computes or edits a score. */
  async function coach(session: Readonly<StyleShiftSession>): Promise<CoachResult | { error: CoachError }> {
    if (session.status === 'in_progress') return { error: 'session_not_complete' }
    if (session.observations.length === 0) return { error: 'missing_observations' }
    if (!session.scores) return { error: 'missing_scores' }

    const candidates = selectCoachingCandidates(session as StyleShiftSession)
    if (candidates.length === 0) return { error: 'nothing_to_coach' }

    const prompt = buildCoachPrompt(session as StyleShiftSession, candidates) + feedbackLanguageRule(session.lang, dialect)
    let sawResponse = false
    for (const suffix of ['', RETRY_NOTE]) {
      const raw = await complete({ system: COACH_SYSTEM, prompt: prompt + suffix, maxTokens: 2500 })
      if (!raw) continue
      sawResponse = true
      const grounded = groundCoaching(extractJson(raw), candidates, session.learningObjectives)
      if (grounded && grounded.coaching.length > 0) return grounded
    }
    return { error: sawResponse ? 'invalid' : 'upstream' }
  }

  const agent: Agent = {
    name: 'coach',
    async run(session) {
      const out = await coach(session)
      if ('error' in out) throw new Error(`coach_${out.error}`)
      return { coaching: out.coaching }
    },
  }
  return { agent, coach }
}

export function createDefaultCoachAgent() {
  const key = process.env.ANTHROPIC_API_KEY
  return key ? createCoachAgent(createAnthropicComplete(key)) : null
}
