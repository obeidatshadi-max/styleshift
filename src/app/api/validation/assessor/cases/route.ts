import { assessorContext, respond } from '@/lib/validation/assessor-route'
import { listCases } from '@/lib/validation/assessor-service'

export async function GET() {
  const ctx = await assessorContext()
  if ('response' in ctx) return ctx.response
  return respond(() => listCases(ctx.store))
}
