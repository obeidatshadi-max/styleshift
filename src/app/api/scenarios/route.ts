import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createScenario, listApprovedScenariosForRep, listScenariosForManager } from '@/lib/company-scenarios'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/**
 * A manager gets every scenario for their company (any status); anyone else
 * gets only the approved ones for their company — the rep-facing practice pool.
 */
export async function GET() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const managerView = await listScenariosForManager(user.id)
  if (managerView) return NextResponse.json(managerView)
  return NextResponse.json(await listApprovedScenariosForRep(user.id))
}

/** Manager drafts a new scenario (status starts at 'draft', not yet visible to reps). */
export async function POST(req: Request) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const created = await createScenario(user.id, {
    style: body?.style, category: body?.category, name: String(body?.name ?? ''), crisis: String(body?.crisis ?? ''),
    q: String(body?.q ?? ''), opts: Array.isArray(body?.opts) ? body.opts : [],
  })
  if (!created) return NextResponse.json({ error: 'Invalid scenario or not a manager' }, { status: 400 })
  return NextResponse.json(created)
}
