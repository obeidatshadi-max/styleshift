// src/app/api/voice-partner/live-judge/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { SYSTEM, isDifficulty } from '@/lib/voice-partner-core'
import { shouldSkipJudge, buildLiveJudgePrompt, parseLiveJudgeResponse, transcriptToConversationTurns, type LiveTranscriptTurn } from '@/lib/voice-live-core'
import type { Doctor } from '@/types/game'

const MAX_TRANSCRIPT_ENTRIES = 200
const MAX_TURN_CHARS = 2000

function parseTranscript(raw: unknown): LiveTranscriptTurn[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_TRANSCRIPT_ENTRIES) return null
  const turns: LiveTranscriptTurn[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null
    const { role, text } = entry as Record<string, unknown>
    if (role !== 'doctor' && role !== 'rep') return null
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_TURN_CHARS) return null
    turns.push({ role, text })
  }
  return turns
}

export async function POST(req: Request) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (process.env.AI_VOICE_PARTNER_LIVE_ENABLED !== 'true' || !anthropicKey) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Shared bucket with the rest of voice-partner traffic (see open/route.ts).
  if (!(await checkRateLimit('voice-partner', user.id, 20, 3600)))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => null) as { doctorId?: string; difficulty?: string; sessionId?: string; transcript?: unknown } | null
  if (!body || typeof body.doctorId !== 'string' || !body.doctorId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (body.difficulty !== undefined && !isDifficulty(body.difficulty)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const transcript = parseTranscript(body.transcript)
  if (!transcript) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (shouldSkipJudge(transcript)) return NextResponse.json({ error: 'empty_transcript' }, { status: 400 })

  // RLS ensures the rep can only read their own doctor.
  const { data: doctor } = await supabase.from('doctors').select('*').eq('id', body.doctorId).single()
  if (!doctor) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const style = (doctor as Doctor).style
  if (!style) return NextResponse.json({ error: 'no_style' }, { status: 422 })

  const turnCount = transcript.filter(t => t.role === 'rep').length
  const prompt = buildLiveJudgePrompt(doctor as Doctor, style, 'en', transcript)

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, system: SYSTEM, messages: [{ role: 'user', content: prompt }] }),
    })
  } catch { res = new Response('', { status: 502 }) }

  const judged = res.ok
    ? parseLiveJudgeResponse((await res.json().catch(() => null) as { content?: { text?: string }[] } | null)?.content?.[0]?.text ?? '')
    : null

  // Judge failed (upstream error or malformed output): `voice_partner_sessions`
  // has NOT NULL constraints on objection_type/outcome (migration
  // 014_voice_partner_sessions.sql) and its own header comment states
  // "sessions that never resolve are never persisted" — a minimal/unscored
  // row is not a row this table can structurally hold. Don't attempt an
  // insert that would just fail its own NOT NULL constraint; tell the
  // client the call happened but couldn't be scored, and let the
  // VisitPrep-level wrapper's `doctor_visits` log (Task 8) be the only
  // record of this session, same as it already is for any turn-based
  // session that never reaches session-result.
  if (!judged) {
    return NextResponse.json({ ok: true, scored: false, turnCount })
  }

  // Best-effort evidence store, same rationale as turn/route.ts's insert —
  // never blocks the response on it.
  const sessionId = body.sessionId ?? crypto.randomUUID()
  const { error: turnInsertError } = await supabase.from('conversation_turns').insert(
    transcriptToConversationTurns(transcript, { sessionId, repId: user.id, doctorId: body.doctorId, objectionType: judged.objectionType }),
  )
  if (turnInsertError) console.warn('conversation_turns insert failed (live-judge):', turnInsertError.message)

  return NextResponse.json({ ...judged, turnCount })
}
