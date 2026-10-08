import { NextResponse } from 'next/server'
import { simulationContext, errorResponse, isUuid, MAX_MESSAGE_CHARS } from '@/lib/simulation-route'

export async function POST(req: Request) {
  const ctx = await simulationContext()
  if ('response' in ctx) return ctx.response

  const body = await req.json().catch(() => null) as { sessionId?: unknown; message?: unknown } | null
  if (!body || !isUuid(body.sessionId) || typeof body.message !== 'string' || body.message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const result = await ctx.orchestrator.sendMessage(body.sessionId, ctx.userId, body.message)
  if (!result.ok) return errorResponse(result.error)
  return NextResponse.json({ doctorText: result.doctorText, repTurns: result.repTurns })
}
