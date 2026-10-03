import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { createAnthropicComplete } from '@/agents/llm'
import { debriefPrompt, parseDebriefInput, parseDebriefResult } from '@/lib/coach-debrief'

export async function GET() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data, error } = await db.from('coach_debriefs').select('id,created_at,doctor_id,doctor_name,input,result').eq('rep_id', user.id).order('created_at', { ascending: false }).limit(30)
  return error ? NextResponse.json({ error: 'history_unavailable' }, { status: 503 }) : NextResponse.json({ entries: data })
}
export async function POST(req: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const input = parseDebriefInput(await req.json().catch(() => null))
  if (!input) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  const { data: doctor } = await db.from('doctors').select('id,name').eq('id', input.doctorId).eq('rep_id', user.id).maybeSingle()
  if (!doctor) return NextResponse.json({ error: 'doctor_not_found' }, { status: 404 })
  if (!(await checkRateLimit('coach-debrief', user.id, 20, 3600))) return NextResponse.json({ error: 'rate_limit' }, { status: 429 })
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  const raw = await createAnthropicComplete(key)(debriefPrompt(input, doctor.name))
  const result = raw ? parseDebriefResult(raw) : null
  if (!result) return NextResponse.json({ error: 'coach_unavailable' }, { status: 502 })
  const { data, error } = await db.from('coach_debriefs').insert({ rep_id: user.id, doctor_id: doctor.id, doctor_name: doctor.name, input, result }).select('id').single()
  return NextResponse.json({ result, saved: !error, id: data?.id ?? null })
}
export async function DELETE(req: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  const { error } = await db.from('coach_debriefs').delete().eq('id', id).eq('rep_id', user.id)
  return error ? NextResponse.json({ error: 'delete_failed' }, { status: 500 }) : NextResponse.json({ ok: true })
}
