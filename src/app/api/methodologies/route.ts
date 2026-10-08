import { NextResponse } from 'next/server'
import { createMethodology, listMethodologies } from '@/lib/methodologies'
import { methodologyApiContext, respond } from '@/lib/methodology-route'

/** Manager: every methodology of their company. */
export async function GET() {
  const ctx = await methodologyApiContext()
  if ('response' in ctx) return ctx.response
  return respond(await listMethodologies(ctx.userId))
}

/** Manager: create a draft methodology. */
export async function POST(req: Request) {
  const ctx = await methodologyApiContext()
  if ('response' in ctx) return ctx.response
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ errors: ['body must be JSON'] }, { status: 400 })
  return respond(await createMethodology(ctx.userId, body))
}
