import { NextResponse } from 'next/server'
import { getForManager, setSimScenarioStatus, updateSimScenario } from '@/lib/sim-scenarios'
import { SCENARIO_STATUSES } from '@/schemas/scenario'
import { isUuid, respond, scenarioApiContext } from '@/lib/sim-scenario-route'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const ctx = await scenarioApiContext()
  if ('response' in ctx) return ctx.response
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ errors: ['bad id'] }, { status: 400 })
  return respond(await getForManager(ctx.userId, id))
}

/** Replace the scenario content. An approved scenario goes back to draft and needs re-approval. */
export async function PUT(req: Request, { params }: Ctx) {
  const ctx = await scenarioApiContext()
  if ('response' in ctx) return ctx.response
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ errors: ['bad id'] }, { status: 400 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ errors: ['body must be JSON'] }, { status: 400 })
  return respond(await updateSimScenario(ctx.userId, id, body))
}

/** Approve, archive, or return to draft. */
export async function PATCH(req: Request, { params }: Ctx) {
  const ctx = await scenarioApiContext()
  if ('response' in ctx) return ctx.response
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ errors: ['bad id'] }, { status: 400 })
  const body = await req.json().catch(() => null) as { status?: unknown } | null
  if (!body || typeof body.status !== 'string' || !(SCENARIO_STATUSES as readonly string[]).includes(body.status)) {
    return NextResponse.json({ errors: [`status must be one of: ${SCENARIO_STATUSES.join(', ')}`] }, { status: 400 })
  }
  return respond(await setSimScenarioStatus(ctx.userId, id, body.status as typeof SCENARIO_STATUSES[number]))
}
