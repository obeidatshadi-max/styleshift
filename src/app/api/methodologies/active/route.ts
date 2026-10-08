import { NextResponse } from 'next/server'
import { activeMethodologyFor } from '@/lib/methodologies'
import { methodologyApiContext } from '@/lib/methodology-route'

/** Any signed-in member: their company's active methodology, or null. Used to show the company's own wording. */
export async function GET() {
  const ctx = await methodologyApiContext()
  if ('response' in ctx) return ctx.response
  return NextResponse.json({ methodology: await activeMethodologyFor(ctx.userId) })
}
