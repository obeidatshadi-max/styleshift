import { NextResponse } from 'next/server'
import { getPack, setPackStatus, updatePack } from '@/lib/knowledge-packs'
import { knowledgeApiContext, respond } from '@/lib/knowledge-pack-route'

type Ctx = { params: Promise<{ id: string }> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STATUSES = ['draft', 'approved', 'archived'] as const

export async function GET(_req: Request, { params }: Ctx) {
  const ctx = await knowledgeApiContext()
  if ('response' in ctx) return ctx.response
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ errors: ['bad id'] }, { status: 400 })
  return respond(await getPack(ctx.userId, id))
}

/** Replace the content. Editing an approved pack returns it to draft. */
export async function PUT(req: Request, { params }: Ctx) {
  const ctx = await knowledgeApiContext()
  if ('response' in ctx) return ctx.response
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ errors: ['bad id'] }, { status: 400 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ errors: ['body must be JSON'] }, { status: 400 })
  return respond(await updatePack(ctx.userId, id, body))
}

/** Approve, return to draft, or archive. */
export async function PATCH(req: Request, { params }: Ctx) {
  const ctx = await knowledgeApiContext()
  if ('response' in ctx) return ctx.response
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ errors: ['bad id'] }, { status: 400 })
  const body = await req.json().catch(() => null) as { status?: unknown } | null
  if (!body || typeof body.status !== 'string' || !(STATUSES as readonly string[]).includes(body.status)) {
    return NextResponse.json({ errors: [`status must be one of: ${STATUSES.join(', ')}`] }, { status: 400 })
  }
  return respond(await setPackStatus(ctx.userId, id, body.status as typeof STATUSES[number]))
}
