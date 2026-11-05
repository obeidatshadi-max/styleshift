import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { createAnthropicComplete } from '@/agents/llm'
import { keyMessageEnabled, parseKeyMessageInput } from '@/lib/key-message'
import { createKeyMessage, listForUser } from '@/lib/key-message-service'

async function caller() {
  if (!keyMessageEnabled()) return { response: NextResponse.json({ error: 'not_found' }, { status: 404 }) }
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  return { userId: user.id }
}

/** Rep: messages for me. Manager: the messages I set, with completion counts. */
export async function GET() {
  const c = await caller()
  if ('response' in c) return c.response
  const r = await listForUser(createAdminClient(), c.userId)
  return NextResponse.json(r.body, { status: r.status })
}

/** Create a key message and generate its four style versions. Managers address reps; reps write for themselves. */
export async function POST(req: Request) {
  const c = await caller()
  if ('response' in c) return c.response
  const input = parseKeyMessageInput(await req.json().catch(() => null))
  if (!input) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  if (!(await checkRateLimit('key-message-create', c.userId, 20, 3600))) return NextResponse.json({ error: 'rate_limit' }, { status: 429 })
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  const r = await createKeyMessage(createAdminClient(), createAnthropicComplete(key), c.userId, input)
  return NextResponse.json(r.body, { status: r.status })
}
