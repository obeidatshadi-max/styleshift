import { NextResponse } from 'next/server'
import { createSimScenario, listForManager } from '@/lib/sim-scenarios'
import { respond, scenarioApiContext } from '@/lib/sim-scenario-route'

/** Manager: every simulation scenario of their company. */
export async function GET() {
  const ctx = await scenarioApiContext()
  if ('response' in ctx) return ctx.response
  return respond(await listForManager(ctx.userId))
}

/** Manager: create a draft scenario from structured data. */
export async function POST(req: Request) {
  const ctx = await scenarioApiContext()
  if ('response' in ctx) return ctx.response
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ errors: ['body must be JSON'] }, { status: 400 })
  return respond(await createSimScenario(ctx.userId, body))
}
