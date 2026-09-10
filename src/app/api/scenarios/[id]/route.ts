import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { setScenarioStatus } from '@/lib/company-scenarios'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

const VALID_STATUS = ['draft', 'approved', 'archived']

/** Manager approves, archives, or reverts a scenario to draft. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const status = body?.status
  if (!VALID_STATUS.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  const updated = await setScenarioStatus(user.id, id, status)
  if (!updated) return NextResponse.json({ error: 'Not found or not a manager' }, { status: 404 })
  return NextResponse.json(updated)
}
