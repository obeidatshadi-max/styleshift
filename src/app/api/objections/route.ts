import { NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'

/**
 * Iraqi Objection Bank (public/objections.html). Open without a StyleShift account:
 * anyone with the link can read the board; adding or rating needs the workshop code
 * set in OBJECTION_BANK_CODE. With no code set, the board is read-only.
 */

const STYLES = ['driver', 'expressive', 'amiable', 'analytical'] as const
const COLUMNS = 'id, style, text_ar, context, rebuttal, code_switch, realism, created_at'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LIMITS = { text_ar: 500, context: 120, rebuttal: 300 }

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const digest = (s: string) => createHash('sha256').update(s.trim().toUpperCase()).digest()

/** Constant-time compare, case- and space-insensitive. False when no code is configured. */
function codeMatches(given: unknown): boolean {
  const expected = process.env.OBJECTION_BANK_CODE?.trim()
  if (!expected || typeof given !== 'string' || !given.trim()) return false
  return timingSafeEqual(digest(given), digest(expected))
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export async function GET() {
  const { data, error } = await createAdminClient()
    .from('workshop_objections')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return json({ error: 'Could not load the board.' }, 500)
  return json({ objections: data ?? [], writable: !!process.env.OBJECTION_BANK_CODE?.trim() })
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Bad request' }, 400)
  }
  if (!body || typeof body !== 'object') return json({ error: 'Bad request' }, 400)

  // One budget for code guesses and writes from one connection.
  if (!(await checkRateLimit('objections', clientIp(request), 60, 600)))
    return json({ error: 'Too many attempts. Wait a few minutes.' }, 429)

  if (!process.env.OBJECTION_BANK_CODE?.trim()) return json({ error: 'The board is closed for new entries.' }, 403)
  if (!codeMatches(body.code)) return json({ error: 'Wrong workshop code.' }, 401)

  const admin = createAdminClient()

  if (body.action === 'check') return json({ ok: true })

  if (body.action === 'add') {
    const style = body.style as (typeof STYLES)[number]
    if (!STYLES.includes(style)) return json({ error: 'Pick a Social Style.' }, 400)
    const row = {
      style,
      text_ar: text(body.text_ar),
      context: text(body.context),
      rebuttal: text(body.rebuttal),
      code_switch: body.codeSwitch === true,
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
      .select('id')
    if (error) return json({ error: 'Could not save. Try again.' }, 500)
    if (!data?.length) return json({ error: 'Not found' }, 404)
    return json({ ok: true })
  }

  return json({ error: 'Bad request' }, 400)
}
