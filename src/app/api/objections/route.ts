import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'

/**
 * Iraqi Objection Bank (public/objections.html). Open without a StyleShift account:
 * anyone with the link can add. Each browser keeps a random secret key (X-Board-Key) and
 * sees and rates only the entries it added; the table stores a hash of the key, never the key.
 * Writes are rate limited per connection.
 */

const STYLES = ['driver', 'expressive', 'amiable', 'analytical'] as const
const COLUMNS = 'id, style, text_ar, context, rebuttal, code_switch, realism, created_at'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LIMITS = { text_ar: 500, context: 120, rebuttal: 300 }

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

const KEY_RE = /^[A-Za-z0-9-]{32,64}$/
/** Hash of the browser's secret key, or null when the key is missing or malformed. */
function ownerHash(request: Request): string | null {
  const key = request.headers.get('x-board-key') ?? ''
  return KEY_RE.test(key) ? createHash('sha256').update(key).digest('hex') : null
}

export async function GET(request: Request) {
  const owner = ownerHash(request)
  if (!owner) return json({ error: 'Bad request' }, 400)
  const { data, error } = await createAdminClient()
    .from('workshop_objections')
    .select(COLUMNS)
    .eq('owner_hash', owner)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return json({ error: 'Could not load the board.' }, 500)
  return json({ objections: data ?? [] })
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Bad request' }, 400)
  }
  if (!body || typeof body !== 'object') return json({ error: 'Bad request' }, 400)
  const owner = ownerHash(request)
  if (!owner) return json({ error: 'Bad request' }, 400)

  if (!(await checkRateLimit('objections', clientIp(request), 60, 600)))
    return json({ error: 'Too many entries from this connection. Wait a few minutes.' }, 429)

  const admin = createAdminClient()

  if (body.action === 'add') {
    const style = body.style as (typeof STYLES)[number]
    if (!STYLES.includes(style)) return json({ error: 'Pick a Social Style.' }, 400)
    const row = {
      style,
      text_ar: text(body.text_ar),
      context: text(body.context),
      rebuttal: text(body.rebuttal),
      code_switch: body.codeSwitch === true,
      owner_hash: owner,
    }
    if (!row.text_ar) return json({ error: 'Write the objection.' }, 400)
    for (const k of Object.keys(LIMITS) as (keyof typeof LIMITS)[])
      if (row[k].length > LIMITS[k]) return json({ error: `Too long (max ${LIMITS[k]} characters).` }, 400)
    const { data, error } = await admin.from('workshop_objections').insert(row).select(COLUMNS).single()
    if (error) return json({ error: 'Could not save. Try again.' }, 500)
    return json({ objection: data })
  }

  if (body.action === 'rate') {
    const realism = body.realism
    if (typeof body.id !== 'string' || !UUID_RE.test(body.id)) return json({ error: 'Bad request' }, 400)
    if (typeof realism !== 'number' || !Number.isInteger(realism) || realism < 1 || realism > 5)
      return json({ error: 'Rating must be 1 to 5.' }, 400)
    const { data, error } = await admin
      .from('workshop_objections')
      .update({ realism })
      .eq('id', body.id)
      .eq('owner_hash', owner)
      .select('id')
    if (error) return json({ error: 'Could not save. Try again.' }, 500)
    if (!data?.length) return json({ error: 'Not found' }, 404)
    return json({ ok: true })
  }

  return json({ error: 'Bad request' }, 400)
}
