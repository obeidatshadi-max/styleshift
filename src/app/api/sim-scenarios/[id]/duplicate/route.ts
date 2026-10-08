import { NextResponse } from 'next/server'
import { duplicateSimScenario } from '@/lib/sim-scenarios'
import { isUuid, respond, scenarioApiContext } from '@/lib/sim-scenario-route'

/** Copy a scenario as a new draft. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await scenarioApiContext()
  if ('response' in ctx) return ctx.response
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ errors: ['bad id'] }, { status: 400 })
  return respond(await duplicateSimScenario(ctx.userId, id))
}
