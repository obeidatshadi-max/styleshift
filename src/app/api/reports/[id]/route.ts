// src/app/api/reports/[id]/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data, error } = await supabase.from('conversation_reports').select('report, superseded_by, status, failure_reason').eq('id', id).single()
  if (error || !data) return NextResponse.json({ error: 'Report not found' }, { status: 404 })

  return NextResponse.json({ report: data.report, outdated: data.superseded_by != null, status: data.status, failureReason: data.failure_reason })
}
