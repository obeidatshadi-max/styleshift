import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { createAnthropicComplete } from '@/agents/llm'
import { debriefPrompt, parseDebriefInput, parseDebriefResult } from '@/lib/coach-debrief'
import { signDebrief, verifyDebrief, type RecoverableDebrief } from '@/lib/debrief-recovery'

const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
type DB = Awaited<ReturnType<typeof createClient>>
async function existing(db: DB, id: string, owner: string) {
  return db.from('coach_debriefs').select('id,input,result').eq('id', id).eq('rep_id', owner).maybeSingle()
}
async function persist(db: DB, row: RecoverableDebrief) {
  const { data, error } = await db.from('coach_debriefs').insert(row).select('id').single()
  if (!error) return NextResponse.json({ result: row.result, saved: true, id: data.id })
  // A lost response or simultaneous retry can hit the primary key. Return the canonical report.
  if (error.code === '23505') {
    const { data: previous } = await existing(db, row.id, row.rep_id)
    if (previous) {
      if (JSON.stringify(parseDebriefInput(previous.input)) !== JSON.stringify(row.input)) return NextResponse.json({ error: 'request_conflict' }, { status: 409 })
      return NextResponse.json({ result: previous.result, saved: true, id: previous.id })
    }
  }
  return NextResponse.json({ result: row.result, saved: false, id: row.id, recoveryToken: signDebrief(row) })
}
export async function GET(req: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const doctorId = new URL(req.url).searchParams.get('doctorId')
  if (doctorId && !uuid(doctorId)) return NextResponse.json({ error: 'invalid_doctor' }, { status: 400 })
  let query = db.from('coach_debriefs').select('id,created_at,doctor_id,doctor_name,input,result').eq('rep_id', user.id)
  if (doctorId) query = query.eq('doctor_id', doctorId)
  const { data, error } = await query.order('created_at', { ascending: false }).limit(doctorId ? 1 : 30)
  return error ? NextResponse.json({ error: 'history_unavailable', ownerId: user.id }, { status: 503 }) : NextResponse.json({ entries: data, ownerId: user.id })
}
export async function POST(req: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const input = parseDebriefInput(body)
  if (!input || (body.requestId !== undefined && !uuid(body.requestId))) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  const { data: doctor } = await db.from('doctors').select('id,name').eq('id', input.doctorId).eq('rep_id', user.id).maybeSingle()
  if (!doctor) return NextResponse.json({ error: 'doctor_not_found' }, { status: 404 })
  if (body.requestId) {
    const { data, error } = await existing(db, body.requestId, user.id)
    if (error) return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 })
    if (data) {
      if (JSON.stringify(parseDebriefInput(data.input)) !== JSON.stringify(input)) return NextResponse.json({ error: 'request_conflict' }, { status: 409 })
      return NextResponse.json({ result: data.result, saved: true, id: data.id })
    }
  }
  if (!(await checkRateLimit('coach-debrief', user.id, 20, 3600))) return NextResponse.json({ error: 'rate_limit' }, { status: 429 })
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  const raw = await createAnthropicComplete(key)(debriefPrompt(input, doctor.name))
  const result = raw ? parseDebriefResult(raw) : null
  if (!result) return NextResponse.json({ error: 'coach_unavailable' }, { status: 502 })
  return persist(db, { id: body.requestId ?? randomUUID(), rep_id: user.id, doctor_id: doctor.id, doctor_name: doctor.name, input, result, created_at: new Date().toISOString() })
}
export async function PUT(req: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const row = verifyDebrief(body?.recoveryToken, user.id)
  if (!row) return NextResponse.json({ error: 'invalid_or_expired_recovery' }, { status: 400 })
  const { data: doctor } = await db.from('doctors').select('id').eq('id', row.doctor_id).eq('rep_id', user.id).maybeSingle()
  if (!doctor) return NextResponse.json({ error: 'doctor_not_found' }, { status: 404 })
  if (!(await checkRateLimit('coach-save', user.id, 60, 3600))) return NextResponse.json({ error: 'rate_limit' }, { status: 429 })
  return persist(db, row)
}
export async function DELETE(req: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!uuid(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  const { error } = await db.from('coach_debriefs').delete().eq('id', id).eq('rep_id', user.id)
  return error ? NextResponse.json({ error: 'delete_failed' }, { status: 500 }) : NextResponse.json({ ok: true })
}
