import { NextResponse } from 'next/server'
import { assignScenario, listAssignments, unassignScenario } from '@/lib/sim-scenarios'
import { isUuid, respond, scenarioApiContext } from '@/lib/sim-scenario-route'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const ctx = await scenarioApiContext()
  if ('response' in ctx) return ctx.response
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ errors: ['bad id'] }, { status: 400 })
  return respond(await listAssignments(ctx.userId, id))
}

/** Body: { repId: string | null, dueAt?: string }. repId null assigns the whole company. */
export async function POST(req: Request, { params }: Ctx) {
  const ctx = await scenarioApiContext()
  if ('response' in ctx) return ctx.response
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ errors: ['bad id'] }, { status: 400 })
  const body = await req.json().catch(() => null) as { repId?: unknown; dueAt?: unknown } | null
  if (!body || !(body.repId === null || isUuid(body.repId))) return NextResponse.json({ errors: ['repId must be a rep id or null'] }, { status: 400 })
  const dueAt = typeof body.dueAt === 'string' && body.dueAt ? body.dueAt : null
  return respond(await assignScenario(ctx.userId, id, body.repId, dueAt))
}

/** Body: { assignmentId: string } */
export async function DELETE(req: Request, { params }: Ctx) {
  const ctx = await scenarioApiContext()
  if ('response' in ctx) return ctx.response
  const { id } = await params
  const body = await req.json().catch(() => null) as { assignmentId?: unknown } | null
  if (!isUuid(id) || !body || !isUuid(body.assignmentId)) return NextResponse.json({ errors: ['bad id'] }, { status: 400 })
  return respond(await unassignScenario(ctx.userId, id, body.assignmentId))
}
