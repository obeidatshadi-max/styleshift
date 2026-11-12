import { createAnthropicComplete } from '@/agents/llm'
import { createDoctorAgent } from '@/agents/doctor'
import { createBehaviorAnalystAgent, ANALYST_REQUEST } from '@/agents/behaviorAnalyst'
import { createCoachAgent } from '@/agents/coach'
import { createOrchestrator, type OrchestratorDeps, type OrchestratorOptions } from './index'
import type { PersonaLoader, SessionStore } from './types'

/** Wires the real agents to the Anthropic key. Returns null when the key is
 * not configured, so a route can answer 503 exactly like the existing
 * voice-partner routes do. */
export function createDefaultOrchestrator(
  store: SessionStore, personas: PersonaLoader, options?: OrchestratorOptions, extra: Partial<Pick<OrchestratorDeps, 'methodology' | 'knowledge'>> = {},
) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  const complete = createAnthropicComplete(key)
  return createOrchestrator({
    store, personas,
    doctor: createDoctorAgent(complete),
    analyst: createBehaviorAnalystAgent(createAnthropicComplete(key, ANALYST_REQUEST)),
    coach: createCoachAgent(complete),
    ...extra,
  }, options)
}
