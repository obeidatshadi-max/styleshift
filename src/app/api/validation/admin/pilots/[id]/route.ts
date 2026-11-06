import { NextResponse } from 'next/server'
import { adminContext, isUuid } from '@/lib/validation/pilot-admin-route'
import { respond } from '@/lib/validation/assessor-route'
import { getPilot } from '@/lib/validation/pilot-admin-service'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const ctx = await adminContext()
  if ('response' in ctx) return ctx.response
  return respond(() => getPilot(ctx.store, id))
}
