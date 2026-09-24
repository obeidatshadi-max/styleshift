// src/app/api/customer-visits/[id]/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

// Must match the check constraint on customer_visits.status in
// supabase/migrations/033_conversation_reports.sql.
const VALID_STATUSES = ['recording', 'transcribing', 'pick_speaker', 'ready', 'failed']

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json().catch(() => null) as {
    speakerLabelRep?: string; speakerLabelCustomer?: string; status?: string
  } | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status))
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  const patch: Record<string, string> = {}
  if (body.speakerLabelRep) patch.speaker_label_rep = body.speakerLabelRep
  if (body.speakerLabelCustomer) patch.speaker_label_customer = body.speakerLabelCustomer
  if (body.status) patch.status = body.status
  patch.updated_at = new Date().toISOString()

  // RLS (rep_id = auth.uid()) is the real authorization check here — this
  // update simply can't touch another rep's row regardless of `id`.
  const { data, error } = await supabase.from('customer_visits').update(patch).eq('id', id).select('id').single()
  if (error || !data) return NextResponse.json({ error: 'Visit not found or not yours' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
