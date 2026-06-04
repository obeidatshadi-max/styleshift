import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import type { Doctor, GeneratedScenario, StyleKey } from '@/types/game'

const DRIVE: Record<StyleKey, string> = {
  driver: 'Control & Achievement',
  expressive: 'Recognition & Ideas',
  amiable: 'Security & Harmony',
  analytical: 'Certainty & Accuracy',
}

// Hard guardrail: the model coaches COMMUNICATION STYLE only — never clinical claims.
const SYSTEM = `You write short role-play OBJECTION scenarios that train pharmaceutical sales reps to adapt to a customer's SOCIAL STYLE (Driver, Expressive, Amiable, Analytical).

Hard rules — follow exactly:
- NEVER invent clinical data, efficacy numbers, statistics, trial results, study names, dosages, or real/branded drug names.
- Refer to the product only as "your product"; refer to evidence generically ("the trial data", "the evidence pack", "the safety profile").
- The scenario and every rationale must teach COMMUNICATION STYLE, not medical claims.
- Output ONLY a single valid JSON object. No markdown fences, no commentary.`

function buildUserPrompt(d: Doctor, style: StyleKey, lang: 'en' | 'ar'): string {
  const langName = lang === 'ar' ? 'Arabic' : 'English'
  const phrases = d.key_phrases?.trim() ? `They often say things like: "${d.key_phrases.trim()}".` : ''
  const objections = d.objections?.length ? `Objection theme(s) they are likely to raise: ${d.objections.join(', ')}.` : ''
  const specialty = d.specialty ? `, ${d.specialty}` : ''
  return `Write one objection scenario. Write ALL text fields in ${langName}.
Customer: ${d.name}${specialty}. Social style: ${style} (core drive: ${DRIVE[style]}).
${phrases}
${objections}

Return JSON exactly in this shape:
{
  "name": "the customer's name",
  "style": "${style}",
  "crisis": "the objection in the customer's own voice, 1-2 sentences, echoing their phrasing",
  "q": "one short line telling the rep to choose a response",
  "opts": [
    {"t": "a response option", "r": "win" or "escalate", "why": "why it works/fails, in social-style terms"},
    {"t": "...", "r": "...", "why": "..."},
    {"t": "...", "r": "...", "why": "..."}
  ]
}
Exactly ONE option has "r":"win" — the response that best fits a ${style} customer. The other two are "escalate". Keep every field concise.`
}

function parseScenario(text: string): GeneratedScenario | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  let obj: unknown
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  const o = obj as Record<string, unknown>
  const styles = ['driver', 'expressive', 'amiable', 'analytical']
  if (!o || typeof o.name !== 'string' || typeof o.crisis !== 'string' || typeof o.q !== 'string') return null
  if (typeof o.style !== 'string' || !styles.includes(o.style)) return null
  if (!Array.isArray(o.opts) || o.opts.length !== 3) return null
  let wins = 0
  for (const opt of o.opts as Record<string, unknown>[]) {
    if (typeof opt.t !== 'string' || typeof opt.why !== 'string') return null
    if (opt.r !== 'win' && opt.r !== 'escalate') return null
    if (opt.r === 'win') wins++
  }
  if (wins !== 1) return null
  return obj as GeneratedScenario
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'not_configured' }, { status: 503 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { doctorId?: string; lang?: 'en' | 'ar' }
  if (!body.doctorId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  // RLS ensures the rep can only read their own doctor.
  const { data: doctor } = await supabase.from('doctors').select('*').eq('id', body.doctorId).single()
  if (!doctor) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const style = (doctor as Doctor).style
  if (!style) return NextResponse.json({ error: 'no_style' }, { status: 422 })

  const lang = body.lang === 'ar' ? 'ar' : 'en'

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
        system: SYSTEM,
        messages: [{ role: 'user', content: buildUserPrompt(doctor as Doctor, style, lang) }],
      }),
    })
  } catch {
    return NextResponse.json({ error: 'upstream' }, { status: 502 })
  }

  if (!res.ok) return NextResponse.json({ error: 'upstream' }, { status: 502 })
  const data = await res.json().catch(() => null) as { content?: { text?: string }[] } | null
  const text = data?.content?.[0]?.text ?? ''
  const scenario = parseScenario(text)
  if (!scenario) return NextResponse.json({ error: 'invalid' }, { status: 422 })

  return NextResponse.json({ scenario })
}
