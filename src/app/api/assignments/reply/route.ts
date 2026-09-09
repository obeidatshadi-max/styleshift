import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAssignmentReply } from '@/lib/assignments'

const VALID_KINDS = ['doctor_session', 'colleague_session', 'note'] as const

/** Rep shares one roleplay session or a note against their active assignment. */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const kind = body?.kind
  if (!VALID_KINDS.includes(kind)) return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })

  const reply = await createAssignmentReply(user.id, {
    kind,
    session_id: typeof body?.session_id === 'string' ? body.session_id : undefined,
    note_text: typeof body?.note_text === 'string' ? body.note_text : undefined,
  })
  if (!reply) return NextResponse.json({ error: 'No active assignment or invalid reply' }, { status: 404 })
  return NextResponse.json(reply)
}
