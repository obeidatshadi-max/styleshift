import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { createAnthropicComplete } from '@/agents/llm'
import { keyMessageEnabled, parsePracticeInput } from '@/lib/key-message'
import { practiceKeyMessage } from '@/lib/key-message-service'

type Ctx = { params: Promise<{ id: string }> }
const uuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)

/** A rep submits a written attempt in one style and gets feedback. The first attempt marks the message done. */
export async function POST(req: Request, { params }: Ctx) {
  if (!keyMessageEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!uuid(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  const input = parsePracticeInput(await req.json().catch(() => null))
  if (!input) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  if (!(await checkRateLimit('key-message-practice', user.id, 40, 3600))) return NextResponse.json({ error: 'rate_limit' }, { status: 429 })
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  const r = await practiceKeyMessage(createAdminClient(), createAnthropicComplete(key), user.id, id, input)
  return NextResponse.json(r.body, { status: r.status })
}
