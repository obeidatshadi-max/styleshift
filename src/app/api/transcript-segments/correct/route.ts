// src/app/api/transcript-segments/correct/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { isReportSessionType } from '@/schemas/conversationReport'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json().catch(() => null) as { sessionType?: string; sessionId?: string; swapSegmentIndexes?: number[] } | null
  if (!body || !isReportSessionType(body.sessionType) || (body.sessionType !== 'human_partner' && body.sessionType !== 'customer_visit') || typeof body.sessionId !== 'string')
    return NextResponse.json({ error: 'Only human_partner or customer_visit sessions have correctable transcripts' }, { status: 400 })

  const { data: rows } = await supabase.from('transcript_segments').select('*')
    .eq('session_type', body.sessionType).eq('session_id', body.sessionId).order('transcript_version', { ascending: false })
  if (!rows || rows.length === 0) return NextResponse.json({ error: 'No transcript found' }, { status: 404 })

  const currentVersion = rows[0].transcript_version
  const latest = rows.filter(r => r.transcript_version === currentVersion) as { segment_index: number; speaker_role: 'rep' | 'counterpart'; text: string; start_ms: number | null; end_ms: number | null }[]
  const swap = new Set(body.swapSegmentIndexes ?? [])
  const newVersion = currentVersion + 1

  const newRows = latest.map(r => ({
    session_type: body.sessionType, session_id: body.sessionId, rep_id: user.id, transcript_version: newVersion,
    segment_index: r.segment_index, text: r.text, start_ms: r.start_ms, end_ms: r.end_ms,
    speaker_role: swap.has(r.segment_index) ? (r.speaker_role === 'rep' ? 'counterpart' : 'rep') : r.speaker_role,
  }))

  const { error } = await supabase.from('transcript_segments').insert(newRows)
  if (error) return NextResponse.json({ error: 'Could not save correction' }, { status: 500 })

  return NextResponse.json({ newTranscriptVersion: newVersion })
}
