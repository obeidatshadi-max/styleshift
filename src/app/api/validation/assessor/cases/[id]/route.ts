import { NextResponse } from 'next/server'
import { assessorContext, respond } from '@/lib/validation/assessor-route'
import { getCase, saveRating } from '@/lib/validation/assessor-service'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const ctx = await assessorContext()
  if ('response' in ctx) return ctx.response
  return respond(() => getCase(ctx.store, id))
}

/** Body: { unscorable?, items: [...], submit?: boolean }. Without `submit` the rating is saved as a draft. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const ctx = await assessorContext()
  if ('response' in ctx) return ctx.response
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const { submit, ...rating } = body as Record<string, unknown>
  return respond(() => saveRating(ctx.store, id, rating, submit === true))
}
