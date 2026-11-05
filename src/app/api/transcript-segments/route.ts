// src/app/api/transcript-segments/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { ihiaEnabled } from '@/lib/ihia/server'

/** The newest transcript version of one of the caller's own recordings, for the correction screen. */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const url = new URL(request.url)
  const sessionType = url.searchParams.get('sessionType')
  const sessionId = url.searchParams.get('sessionId')
  if ((sessionType !== 'human_partner' && sessionType !== 'customer_visit') || !sessionId)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { data, error } = await supabase.from('transcript_segments')
    .select('segment_index, speaker_role, text, transcript_version')
    .eq('session_type', sessionType).eq('session_id', sessionId).eq('rep_id', user.id)
    .order('segment_index', { ascending: true })
  if (error) return NextResponse.json({ error: 'Could not load the transcript' }, { status: 503 })

  const rows = (data ?? []) as { segment_index: number; speaker_role: 'rep' | 'counterpart'; text: string; transcript_version: number }[]
  if (rows.length === 0) return NextResponse.json({ error: 'No transcript found' }, { status: 404 })
  const transcriptVersion = Math.max(...rows.map(r => r.transcript_version))
  return NextResponse.json({
    transcriptVersion,
    // The phrase-sharing tick box only makes sense when the Iraqi phrase library is switched on.
    canProposePhrases: ihiaEnabled(),
    segments: rows.filter(r => r.transcript_version === transcriptVersion)
      .map(r => ({ segmentIndex: r.segment_index, speakerRole: r.speaker_role, text: r.text })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
