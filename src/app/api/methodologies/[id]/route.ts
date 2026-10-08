import { NextResponse } from 'next/server'
import { getMethodology, setMethodologyStatus, updateMethodology } from '@/lib/methodologies'
import { methodologyApiContext, respond } from '@/lib/methodology-route'

type Ctx = { params: Promise<{ id: string }> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STATUSES = ['draft', 'active', 'archived'] as const

export async function GET(_req: Request, { params }: Ctx) {
  const ctx = await methodologyApiContext()
  if ('response' in ctx) return ctx.response
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ errors: ['bad id'] }, { status: 400 })
  return respond(await getMethodology(ctx.userId, id))
}

/** Replace the content. Editing the active methodology creates a new draft version; the active one is untouched. */
export async function PUT(req: Request, { params }: Ctx) {
  const ctx = await methodologyApiContext()
  if ('response' in ctx) return ctx.response
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ errors: ['bad id'] }, { status: 400 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ errors: ['body must be JSON'] }, { status: 400 })
  return respond(await updateMethodology(ctx.userId, id, body))
}

/** Activate (archiving the current active one), return to draft, or archive. */
export async function PATCH(req: Request, { params }: Ctx) {
  const ctx = await methodologyApiContext()
  if ('response' in ctx) return ctx.response
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ errors: ['bad id'] }, { status: 400 })
  const body = await req.json().catch(() => null) as { status?: unknown } | null
  if (!body || typeof body.status !== 'string' || !(STATUSES as readonly string[]).includes(body.status)) {
    return NextResponse.json({ errors: [`status must be one of: ${STATUSES.join(', ')}`] }, { status: 400 })
  }
  return respond(await setMethodologyStatus(ctx.userId, id, body.status as typeof STATUSES[number]))
}
