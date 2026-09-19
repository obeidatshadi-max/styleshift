import type { SessionPatch, StyleShiftSession } from '@/schemas/session'

/** Who is allowed to change which part of the shared session. The orchestrator
 * enforces this so one agent can never overwrite another's output. */
export type PatchOwner = 'doctor' | 'behaviorAnalyst' | 'scoring' | 'coach'

const ALLOWED: Record<PatchOwner, readonly (keyof SessionPatch)[]> = {
  doctor: ['transcript'],
  behaviorAnalyst: ['observations'],
  scoring: ['scores'],
  coach: ['coaching'],
}

export class AgentBoundaryError extends Error {
  constructor(owner: PatchOwner, detail: string) {
    super(`agent_boundary_violation: ${owner} ${detail}`)
  }
}

/** Applies an agent's patch to the session, immutably. Throws if the patch
 * touches a section the agent does not own, or rewrites existing transcript. */
export function applyAgentPatch(
  owner: PatchOwner, session: StyleShiftSession, patch: SessionPatch,
): StyleShiftSession {
  for (const key of Object.keys(patch) as (keyof SessionPatch)[]) {
    if (patch[key] !== undefined && !ALLOWED[owner].includes(key)) {
      throw new AgentBoundaryError(owner, `may not modify "${key}"`)
    }
  }
  if (patch.transcript) {
    const old = session.transcript
    const untouched = patch.transcript.length >= old.length &&
      old.every((t, i) => t.turnIndex === patch.transcript![i].turnIndex && t.text === patch.transcript![i].text && t.role === patch.transcript![i].role)
    if (!untouched) throw new AgentBoundaryError(owner, 'may only append to the transcript')
  }
  return { ...session, ...patch }
}
