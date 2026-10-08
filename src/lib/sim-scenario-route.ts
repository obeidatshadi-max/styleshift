import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { scenarioBuilderEnabled, type ServiceResult } from '@/lib/sim-scenarios'

/** Flag + auth for every /api/sim-scenarios route. A disabled feature looks like a missing route. */
export async function scenarioApiContext() {
  if (!scenarioBuilderEnabled()) return { response: NextResponse.json({ error: 'not_found' }, { status: 404 }) } as const
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) } as const
  return { userId: user.id } as const
}

export function respond<T>(result: ServiceResult<T>) {
  return result.ok ? NextResponse.json(result.value) : NextResponse.json({ errors: result.errors }, { status: result.status })
}

export const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
