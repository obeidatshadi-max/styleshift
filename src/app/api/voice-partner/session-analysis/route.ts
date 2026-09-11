import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  computeSessionSignals, buildEvaluatorPrompt, parseEvaluatorResponse, groundEvaluatorResult,
  resolveDoctorStyleProfile,
} from '@/lib/session-evaluator'
import type { ConversationTurn, Doctor } from '@/types/game'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

const RETRY_NOTE = '\n\nYour previous response was not valid JSON matching the exact shape requested. Return ONLY the JSON object, exactly as specified, with no markdown fences and no other text.'

// Same hard guardrail as the live judge/opening prompts (voice-partner-core's
// SYSTEM) — this call only coaches communication style from a given
// transcript, but rationale/alternative text must not drift into inventing
// clinical claims that were never in the conversation.
const SYSTEM = 'You are an objective sales-coaching evaluator, not a clinician. Score and comment on COMMUNICATION STYLE only. NEVER invent clinical data, efficacy numbers, statistics, trial results, or real/branded drug names — refer to evidence only as generically as the transcript itself does. Output ONLY a single valid JSON object, no markdown fences, no commentary.'

async function callEvaluator(anthropicKey: string, prompt: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => null) as { content?: { text?: string }[] } | null
  return data?.content?.[0]?.text ?? ''
}

// Post-session Deep Analysis — deliberately a SEPARATE, lazy, on-demand call
// (not fired automatically after session-result), matching how this app's
// other derived-view features work (team-stats/report are computed at
// read time, not eagerly cached on write) and the spec's Quick Result vs
// Deep Analysis split: the quick result screen (session-result save) stays
// cheap/instant, this extra LLM call only happens if the rep opens Deep
// Analysis. See "keep live simulation separate from deep post-call
// analysis" — this route, not the live judge call, is where scoring happens.
export async function POST(req: Request) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (process.env.AI_VOICE_PARTNER_ENABLED !== 'true' || !anthropicKey) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Shared bucket with open/turn/speak/session-result (see open/route.ts) —
  // one extra evaluator call per analyzed session is a modest addition to
  // that same per-rep cost ceiling.
  if (!(await checkRateLimit('voice-partner', user.id, 20, 3600)))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => null) as { sessionId?: string; lang?: string } | null
  if (!body || !isUuid(body.sessionId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const lang = body.lang === 'ar' ? 'ar' : 'en'
  const sessionId = body.sessionId

  // RLS scopes this to the caller's own turns (or a manager's team) — see
  // migration 026's "own conversation turns read" / "manager..." policies.
  const { data: turnsData } = await supabase
    .from('conversation_turns').select('*').eq('session_id', sessionId).order('turn_index', { ascending: true })
  const turns = (turnsData as ConversationTurn[] | null) ?? []
  if (turns.length === 0) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const doctorId = turns.find(t => t.doctor_id)?.doctor_id ?? null
  let hasHiddenConcern = false
  // Style profile snapshot: resolved and persisted AT ANALYSIS TIME, not
  // re-derived live from `doctors` on every read — if a manager edits this
  // doctor's style weights later, past sessions still explain the profile
  // the rep was actually scored against (Explainability: a historical
  // record must stay accurate even after the source row changes).
  let styleProfile = resolveDoctorStyleProfile({ style: null, style_driver: null, style_expressive: null, style_amiable: null, style_analytical: null })
  if (doctorId) {
    const { data: doctor } = await supabase
      .from('doctors').select('style, style_driver, style_expressive, style_amiable, style_analytical, hidden_concern')
      .eq('id', doctorId).single()
    const d = doctor as Pick<Doctor, 'style' | 'style_driver' | 'style_expressive' | 'style_amiable' | 'style_analytical' | 'hidden_concern'> | null
    if (d) {
      hasHiddenConcern = !!d.hidden_concern?.trim()
      styleProfile = resolveDoctorStyleProfile(d)
    }
  }

  const signals = computeSessionSignals(turns, hasHiddenConcern)
  const prompt = buildEvaluatorPrompt(turns, signals, styleProfile, lang)

  let text = await callEvaluator(anthropicKey, prompt)
  let raw = text ? parseEvaluatorResponse(text) : null
  if (!raw) {
    text = await callEvaluator(anthropicKey, prompt + RETRY_NOTE)
    raw = text ? parseEvaluatorResponse(text) : null
  }
  if (!raw) return NextResponse.json({ error: 'invalid' }, { status: 422 })

  const { competencies, adaptation, adaptationScore, adaptationRecommendation, criticalMoments } = groundEvaluatorResult(raw, turns)

  const { error: scorecardError } = await supabase.from('session_scorecards').upsert({
    session_id: sessionId, rep_id: user.id, doctor_id: doctorId,
    competencies, signals, model: 'claude-haiku-4-5-20251001', updated_at: new Date().toISOString(),
    adaptation, adaptation_score: adaptationScore, adaptation_recommendation: adaptationRecommendation,
    doctor_style_profile: styleProfile,
  }, { onConflict: 'session_id' })
  if (scorecardError) return NextResponse.json({ error: 'insert_failed' }, { status: 500 })

  // Re-running analysis replaces this session's moments rather than
  // accumulating duplicates across repeated Deep Analysis views.
  await supabase.from('session_critical_moments').delete().eq('session_id', sessionId).eq('rep_id', user.id)
  if (criticalMoments.length > 0) {
    const { error: momentsError } = await supabase.from('session_critical_moments').insert(
      criticalMoments.map(m => ({
        session_id: sessionId, rep_id: user.id, doctor_id: doctorId,
        turn_index: m.turnIndex, role: m.role, quote: m.quote, turn_created_at: m.createdAt,
        observed_behavior: m.observedBehavior, missed_opportunity: m.missedOpportunity, alternative: m.alternative,
      })),
    )
    if (momentsError) return NextResponse.json({ error: 'insert_failed' }, { status: 500 })
  }

  return NextResponse.json({
    competencies, signals, criticalMoments,
    adaptation, adaptationScore, adaptationRecommendation, doctorStyleProfile: styleProfile,
  })
}
