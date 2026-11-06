import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { getTeamStatsForUser } from '@/lib/team-stats'
import { validationEnabled } from './assessor-service'
import { supabasePilotAdminStore } from './pilot-admin-store'
import type { PilotAdminStore } from './pilot-admin-service'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: string) => UUID.test(v)

/** Shared gate for the pilot-administration routes: flag, sign-in. Whether the caller administers a given pilot is checked in the store. */
export async function adminContext(): Promise<{ response: NextResponse } | { store: PilotAdminStore; userId: string }> {
  if (!validationEnabled()) return { response: NextResponse.json({ error: 'not_found' }, { status: 404 }) }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  return { store: supabasePilotAdminStore(supabase, createAdminClient(), user.id), userId: user.id }
}

/** The company this user manages, or null. Same gate as the manager dashboard. */
export async function managedCompanyId(userId: string): Promise<string | null> {
  return (await getTeamStatsForUser(userId))?.companyId ?? null
}

export async function jsonBody(req: Request): Promise<unknown> {
  return req.json().catch(() => null)
}
