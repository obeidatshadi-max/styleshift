import type { Agent } from '@/agents/types'
import { createAnthropicComplete, type CompleteFn } from '@/agents/llm'
import type { Observation } from '@/schemas/observation'
import type { StyleShiftSession } from '@/schemas/session'
import { extractJson, groundObservations } from './ground'
import { ANALYST_SYSTEM, buildAnalystPrompt } from './prompt'

const RETRY_NOTE = '\n\nYour previous response was not valid JSON in the exact shape requested, or had no usable evidence quotes. Return ONLY the JSON object, with every quote copied verbatim from the transcript.'

export type AnalystError = 'session_not_complete' | 'no_rep_turns' | 'upstream' | 'invalid'

export interface AnalystResult { observations: Observation[]; dropped: number }

export function createBehaviorAnalystAgent(complete: CompleteFn) {
  /** Read-only over the finished transcript. Returns an error code instead of
   * throwing so callers (routes) can map it to a status. */
  async function analyze(session: Readonly<StyleShiftSession>): Promise<AnalystResult | { error: AnalystError }> {
    if (session.status === 'in_progress') return { error: 'session_not_complete' }
    if (!session.transcript.some(t => t.role === 'rep')) return { error: 'no_rep_turns' }

    const prompt = buildAnalystPrompt(session as StyleShiftSession)
    let sawResponse = false
    for (const suffix of ['', RETRY_NOTE]) {
      const raw = await complete({ system: ANALYST_SYSTEM, prompt: prompt + suffix, maxTokens: 3000 })
      if (!raw) continue
      sawResponse = true
      const grounded = groundObservations(extractJson(raw), session.transcript)
      // An empty-but-valid result is legitimate only if the model returned a
      // valid shape; anything that dropped everything is retried once.
      if (grounded && grounded.observations.length > 0) return grounded
    }
    return { error: sawResponse ? 'invalid' : 'upstream' }
  }

  const agent: Agent = {
    name: 'behaviorAnalyst',
    async run(session) {
      const out = await analyze(session)
      if ('error' in out) throw new Error(`behavior_analyst_${out.error}`)
      return { observations: out.observations }
    },
  }
  return { agent, analyze }
}

export function createDefaultBehaviorAnalystAgent() {
  const key = process.env.ANTHROPIC_API_KEY
  return key ? createBehaviorAnalystAgent(createAnthropicComplete(key)) : null
}
