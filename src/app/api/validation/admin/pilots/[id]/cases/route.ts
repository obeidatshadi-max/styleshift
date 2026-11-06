import { NextResponse } from 'next/server'
import { adminContext, isUuid, jsonBody } from '@/lib/validation/pilot-admin-route'
import { respond } from '@/lib/validation/assessor-route'
import { addCase } from '@/lib/validation/pilot-admin-service'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const ctx = await adminContext()
  if ('response' in ctx) return ctx.response
  return respond(async () => addCase(ctx.store, id, await jsonBody(req)))
}
