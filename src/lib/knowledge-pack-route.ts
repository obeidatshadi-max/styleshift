import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { knowledgePacksEnabled, type Result } from '@/lib/knowledge-packs'

/** Flag + auth for every /api/knowledge-packs route. A disabled feature looks like a missing route. */
export async function knowledgeApiContext() {
  if (!knowledgePacksEnabled()) return { response: NextResponse.json({ error: 'not_found' }, { status: 404 }) } as const
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) } as const
  return { userId: user.id } as const
}

export function respond<T>(result: Result<T>) {
  return result.ok ? NextResponse.json(result.value) : NextResponse.json({ errors: result.errors }, { status: result.status })
}
