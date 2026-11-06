import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { supabaseAssessorStore } from './assessor-store'
import { validationEnabled, type AssessorStore, type Result } from './assessor-service'

/** Shared gate for the assessor routes: flag, then sign-in. Everything after that is row-level security. */
export async function assessorContext(): Promise<{ response: NextResponse } | { store: AssessorStore }> {
  if (!validationEnabled()) return { response: NextResponse.json({ error: 'not_found' }, { status: 404 }) }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  return { store: supabaseAssessorStore(supabase, createAdminClient(), user.id) }
}

/** Turn a service result, or a database refusal, into a response. Raw database messages never reach the browser. */
export async function respond<T>(run: () => Promise<Result<T>>): Promise<NextResponse> {
  try {
    const r = await run()
    return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    // Row-level security refusing a write means: the pilot is not running, or this person is no longer a member.
    if (/row-level security|cannot change|keeps its/i.test(message)) return NextResponse.json({ error: 'not_allowed' }, { status: 403 })
    console.warn('validation assessor route failed:', message)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
