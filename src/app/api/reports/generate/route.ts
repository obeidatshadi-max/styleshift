// src/app/api/reports/generate/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { createAnthropicComplete } from '@/agents/llm'
import { isReportSessionType, type TranscriptSegment, type ReportContext } from '@/schemas/conversationReport'
import { extractSocialSignals } from '@/lib/report/socialSignals'
import { buildReportPrompt } from '@/lib/report/buildReportPrompt'
import { groundReport } from '@/lib/report/groundReport'
import { persistReport } from '@/lib/report/persistReport'
import { adaptRoleplaySession } from '@/lib/report/adapters/fromRoleplaySession'
import { adaptConversationTurns } from '@/lib/report/adapters/fromConversationTurns'
import { adaptAgentSession } from '@/lib/report/adapters/fromAgentSession'
import { adaptCustomerVisit } from '@/lib/report/adapters/fromCustomerVisit'

const RETRY_NOTE = '\n\nYour previous response was not valid JSON in the exact shape requested, or had no usable evidence. Return ONLY the JSON object, with every evidence reference a real segmentIndex from the transcript above.'

/** Loads the segments+context for a session by reading whichever store that
 * session type actually lives in, then runs its adapter. Returns null when
 * the session doesn't exist or doesn't belong to this rep (RLS also
 * enforces this, but a clear 404 beats an opaque empty-segments report). */
async function loadSessionData(
  supabase: Awaited<ReturnType<typeof createClient>>, sessionType: string, sessionId: string, repId: string,
): Promise<{ segments: TranscriptSegment[]; context: ReportContext; transcriptVersion: number } | null> {
  if (sessionType === 'human_partner' || sessionType === 'customer_visit') {
    const table = sessionType === 'human_partner' ? 'roleplay_sessions' : 'customer_visits'
    const { data: session } = await supabase.from(table).select('*').eq('id', sessionId).eq('rep_id', repId).single()
    if (!session) return null
    // transcript_segments spans every transcript version ever written for
    // this session (033_conversation_reports.sql), so the latest version
    // has to be picked out client-side. Ordering purely by segment_index
    // still leaves every version's own rows in ascending segment_index
    // order relative to each other, so filtering the fetched rows down to
    // the max transcript_version afterward yields a correctly ordered
    // transcript without a second ORDER BY.
    const { data: rows } = await supabase.from('transcript_segments')
      .select('*').eq('session_type', sessionType).eq('session_id', sessionId).eq('rep_id', repId)
      .order('segment_index', { ascending: true })
    const segmentRows = (rows ?? []) as { segment_index: number; speaker_role: 'rep' | 'counterpart'; text: string; start_ms: number | null; end_ms: number | null; transcript_version?: number }[]
    if (segmentRows.length === 0) return null
    const versionOf = (r: { transcript_version?: number }) => typeof r.transcript_version === 'number' ? r.transcript_version : 1
    const transcriptVersion = Math.max(...segmentRows.map(versionOf))
    const latest = segmentRows.filter(r => versionOf(r) === transcriptVersion)
    const { segments, context } = sessionType === 'human_partner'
      ? adaptRoleplaySession(latest, session) : adaptCustomerVisit(latest, session)
    return { segments, context, transcriptVersion }
  }
  if (sessionType === 'ai_doctor_voice') {
    const { data: turns } = await supabase.from('conversation_turns').select('*').eq('session_id', sessionId).eq('rep_id', repId).order('turn_index')
    if (!turns || turns.length === 0) return null
    const { data: doctor } = await supabase.from('doctors').select('*').eq('id', turns[0].doctor_id).single()
    if (!doctor) return null
    const { segments, context } = adaptConversationTurns(turns, doctor)
    return { segments, context, transcriptVersion: 1 }
  }
  if (sessionType === 'ai_doctor_text') {
    const { data: row } = await supabase.from('agent_sessions').select('*').eq('id', sessionId).eq('rep_id', repId).single()
    if (!row || !row.record) return null
    const { segments, context } = adaptAgentSession(row.record)
    return { segments, context, transcriptVersion: 1 }
  }
  return null
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await checkRateLimit('report-generate', user.id, 20, 3600)))
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })

  const body = await request.json().catch(() => null) as { sessionType?: string; sessionId?: string } | null
  if (!body || !isReportSessionType(body.sessionType) || typeof body.sessionId !== 'string')
    return NextResponse.json({ error: 'Invalid sessionType or sessionId' }, { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Report generation is not configured' }, { status: 503 })

  const loaded = await loadSessionData(supabase, body.sessionType, body.sessionId, user.id)
  if (!loaded) return NextResponse.json({ error: 'Session not found or has no transcript yet' }, { status: 404 })
  const { segments, context, transcriptVersion } = loaded

  const counterpartSignals = extractSocialSignals(segments, 'counterpart')
  const repSignals = extractSocialSignals(segments, 'rep')
  const { system, prompt, maxTokens } = buildReportPrompt(segments, context, counterpartSignals, repSignals)

  const complete = createAnthropicComplete(apiKey)
  let report = null
  for (const suffix of ['', RETRY_NOTE]) {
    const raw = await complete({ system, prompt: prompt + suffix, maxTokens })
    if (!raw) continue
    const start = raw.indexOf('{'), end = raw.lastIndexOf('}')
    const parsed = start !== -1 && end > start ? (() => { try { return JSON.parse(raw.slice(start, end + 1)) } catch { return null } })() : null
    report = parsed ? groundReport(parsed, segments, context, { sessionType: body.sessionType, transcriptVersion }) : null
    if (report) break
  }
  // Never replace a failed analysis with a plausible demo result — a real
  // failure surfaces as an error the rep can retry, not a silently invented report.
  if (!report) return NextResponse.json({ error: 'Report generation failed. Please try again.' }, { status: 502 })

  const saved = await persistReport(supabase, report, body.sessionType, body.sessionId, user.id)
  if (!saved.ok) return NextResponse.json({ error: 'Report generated but could not be saved' }, { status: 500 })

  return NextResponse.json({ reportId: saved.id, report })
}
