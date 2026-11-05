// src/app/api/transcript-segments/correct/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { isReportSessionType } from '@/schemas/conversationReport'
import { applyCorrection, type SegmentRow, type TextEdit } from '@/lib/transcript-edit'
import { ihiaEnabled } from '@/lib/ihia/server'

const MAX_ITEMS = 500
const MAX_PROPOSALS = 20

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json().catch(() => null) as {
    sessionType?: string; sessionId?: string; swapSegmentIndexes?: number[]; edits?: TextEdit[]; proposePhrases?: boolean
  } | null
  if (!body || !isReportSessionType(body.sessionType) || (body.sessionType !== 'human_partner' && body.sessionType !== 'customer_visit') || typeof body.sessionId !== 'string')
    return NextResponse.json({ error: 'Only human_partner or customer_visit sessions have correctable transcripts' }, { status: 400 })
  if ((body.swapSegmentIndexes !== undefined && (!Array.isArray(body.swapSegmentIndexes) || body.swapSegmentIndexes.length > MAX_ITEMS))
    || (body.edits !== undefined && (!Array.isArray(body.edits) || body.edits.length > MAX_ITEMS)))
    return NextResponse.json({ error: 'Invalid correction' }, { status: 400 })

  const { data: rows } = await supabase.from('transcript_segments').select('*')
    .eq('session_type', body.sessionType).eq('session_id', body.sessionId).order('transcript_version', { ascending: false })
  if (!rows || rows.length === 0) return NextResponse.json({ error: 'No transcript found' }, { status: 404 })

  const currentVersion = rows[0].transcript_version
  const latest = rows.filter(r => r.transcript_version === currentVersion) as SegmentRow[]
  const result = applyCorrection(latest, { swapSegmentIndexes: body.swapSegmentIndexes, edits: body.edits })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  if (result.changed === 0) return NextResponse.json({ error: 'Nothing was changed' }, { status: 400 })

  const newVersion = currentVersion + 1
  const newRows = result.rows.map(r => ({
    session_type: body.sessionType, session_id: body.sessionId, rep_id: user.id, transcript_version: newVersion,
    segment_index: r.segment_index, text: r.text, start_ms: r.start_ms, end_ms: r.end_ms, speaker_role: r.speaker_role,
  }))
  const { error } = await supabase.from('transcript_segments').insert(newRows)
  if (error) return NextResponse.json({ error: 'Could not save correction' }, { status: 500 })

  // Only the changed words go to the Iraqi phrase reviewers, never the whole line, and only when the
  // rep ticked the box. Failing to send them must not undo the saved correction.
  let proposalsSent = 0
  if (body.proposePhrases === true && ihiaEnabled() && result.proposals.length > 0) {
    const { error: proposalError } = await supabase.from('ihia_proposals')
      .insert(result.proposals.slice(0, MAX_PROPOSALS).map(p => ({ rep_id: user.id, heard: p.heard, meant: p.meant })))
    if (!proposalError) proposalsSent = Math.min(result.proposals.length, MAX_PROPOSALS)
  }

  return NextResponse.json({ newTranscriptVersion: newVersion, proposalsSent })
}
