import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { completeAssignment, createAssignment, getAssignmentForRep } from '@/lib/assignments'
import { OBJECTION_CATEGORIES } from '@/lib/social-style'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/** Rep view: the active assignment targeting the caller (null when none). */
export async function GET() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await getAssignmentForRep(user.id))
}

/** Manager creates an assignment (deactivates the previous one). */
export async function POST(req: Request) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const targetType = body?.target_type
  const targetKey = String(body?.target_key ?? '')
  const repIds = Array.isArray(body?.rep_ids) && body.rep_ids.length ? body.rep_ids.map(String) : null

  const validCategory = targetType === 'category' &&
    (OBJECTION_CATEGORIES as readonly string[]).includes(targetKey)
  const validLevel = targetType === 'level' && ['1', '2', '3', '4'].includes(targetKey)
  if (!validCategory && !validLevel) {
    return NextResponse.json({ error: 'Invalid target' }, { status: 400 })
  }

  const created = await createAssignment(user.id, { target_type: targetType, target_key: targetKey, rep_ids: repIds })
  if (!created) return NextResponse.json({ error: 'Not a manager' }, { status: 403 })
  return NextResponse.json(created)
}

/** Rep marks their active assignment as completed. */
export async function PATCH() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ok = await completeAssignment(user.id)
  if (!ok) return NextResponse.json({ error: 'No active assignment' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
