import { adminContext, jsonBody, managedCompanyId } from '@/lib/validation/pilot-admin-route'
import { respond } from '@/lib/validation/assessor-route'
import { createPilot, listPilots } from '@/lib/validation/pilot-admin-service'

export async function GET() {
  const ctx = await adminContext()
  if ('response' in ctx) return ctx.response
  return respond(() => listPilots(ctx.store))
}

export async function POST(req: Request) {
  const ctx = await adminContext()
  if ('response' in ctx) return ctx.response
  return respond(async () => createPilot(ctx.store, await managedCompanyId(ctx.userId), await jsonBody(req)))
}
