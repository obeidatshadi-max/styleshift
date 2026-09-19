import type { SessionPatch, StyleShiftSession } from '@/schemas/session'

export type AgentName = 'orchestrator' | 'doctor' | 'behaviorAnalyst' | 'coach'

/** Every agent reads the shared session and returns a patch for the sections
 * it owns. No route, auth or rate-limit concerns inside (those stay in the
 * API route / orchestrator guard). */
export interface Agent<TInput = void> {
  name: AgentName
  run(session: Readonly<StyleShiftSession>, input: TInput): Promise<SessionPatch>
}
