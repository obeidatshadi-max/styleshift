import { createAdminClient } from '@/lib/supabase-admin'
import { isExpired, isTeamId, normalizeCode, photoBytes } from '@/lib/arena/protocol'

/**
 * Team photos for StyleShift Arena, served separately from /api/arena state so
 * the few-second state poll stays small. The URL carries a version number, so
 * a photo can be cached for a long time. Anyone with the class code can see the
 * class's team photos, the same people who see them on the projector.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = normalizeCode(url.searchParams.get('code'))
  const teamId = url.searchParams.get('team')
  if (!code || !isTeamId(teamId)) return new Response('Not found', { status: 404 })
  const db = createAdminClient()
  const { data: cls } = await db.from('arena_classes').select('id, expires_at').eq('code', code).maybeSingle()
  if (!cls || isExpired(cls.expires_at)) return new Response('Not found', { status: 404 })
  const { data: team } = await db.from('arena_teams').select('photo').eq('class_id', cls.id).eq('id', teamId).maybeSingle()
  if (!team?.photo) return new Response('Not found', { status: 404 })
  return new Response(photoBytes(team.photo) as BodyInit, {
    headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' },
  })
}
