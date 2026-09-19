import { NextResponse } from 'next/server'
import { simulationContext, errorResponse, isUuid } from '@/lib/simulation-route'

export async function POST(req: Request) {
  const ctx = await simulationContext()
  if ('response' in ctx) return ctx.response

  const body = await req.json().catch(() => null) as { sessionId?: unknown } | null
  if (!body || !isUuid(body.sessionId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  // The user pressing End Simulation ends it as "abandoned" — win/escalate is
  // the voice judge's call, not something the rep declares.
  const result = await ctx.orchestrator.endSimulation(body.sessionId, ctx.userId)
  if (!result.ok) return errorResponse(result.error)
  return NextResponse.json({ report: result.report, phase: result.phase })
}
