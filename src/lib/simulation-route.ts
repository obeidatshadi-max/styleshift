import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { createDefaultOrchestrator } from '@/agents/orchestrator/default'
import { createSupabasePersonaLoader, createSupabaseSessionStore } from '@/agents/orchestrator/supabase'
import type { OrchestratorError } from '@/agents/orchestrator/types'

const STATUS: Record<OrchestratorError, number> = {
  not_found: 404, forbidden: 403, persona_not_found: 404, empty_message: 400, wrong_phase: 409,
  turn_limit: 409, doctor_unavailable: 502, no_rep_turns: 422, analysis_failed: 502, store_failed: 500,
}

export function errorResponse(error: OrchestratorError) {
  return NextResponse.json({ error }, { status: STATUS[error] })
}

/** Every simulation route: same feature flag, key check, auth and rate limit as
 * the existing AI voice routes, then hands back a ready orchestrator. */
export async function simulationContext() {
  if (process.env.AI_VOICE_PARTNER_ENABLED !== 'true' || !process.env.ANTHROPIC_API_KEY) {
    return { response: NextResponse.json({ error: 'not_configured' }, { status: 503 }) } as const
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) } as const

  // Own bucket: a simulation is many small calls (1 per message, 3 to finish),
  // unlike the voice partner's one-call-per-turn budget.
  if (!(await checkRateLimit('agent-sim', user.id, 60, 3600))) {
    return { response: NextResponse.json({ error: 'rate_limited' }, { status: 429 }) } as const
  }

  const orchestrator = createDefaultOrchestrator(
    createSupabaseSessionStore(supabase), createSupabasePersonaLoader(supabase),
  )
  if (!orchestrator) return { response: NextResponse.json({ error: 'not_configured' }, { status: 503 }) } as const
  return { orchestrator, userId: user.id } as const
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)
export const MAX_MESSAGE_CHARS = 2000
