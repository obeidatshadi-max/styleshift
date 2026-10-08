import { NextResponse } from 'next/server'
import { createPack, listPacks } from '@/lib/knowledge-packs'
import { knowledgeApiContext, respond } from '@/lib/knowledge-pack-route'

/** Manager: every knowledge pack of their company. */
export async function GET() {
  const ctx = await knowledgeApiContext()
  if ('response' in ctx) return ctx.response
  return respond(await listPacks(ctx.userId))
}

/** Manager: create a draft knowledge pack. */
export async function POST(req: Request) {
  const ctx = await knowledgeApiContext()
  if ('response' in ctx) return ctx.response
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ errors: ['body must be JSON'] }, { status: 400 })
  return respond(await createPack(ctx.userId, body))
}
