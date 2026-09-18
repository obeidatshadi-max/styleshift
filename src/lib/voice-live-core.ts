import type { Doctor, StyleKey } from '@/types/game'
import { type ObjectionType, isObjectionType, type ClearStep, isClearStep, personaLines } from '@/lib/voice-partner-core'

export type LiveTranscriptTurn = { role: 'rep' | 'doctor'; text: string }

/** No rep turn exists yet — nothing to score. Mirrors the empty/near-empty
 * transcript skip rule from the design spec: never spend a judge call, or
 * save a session, on a call the rep never actually spoke in. */
export function shouldSkipJudge(transcript: LiveTranscriptTurn[]): boolean {
  return transcript.filter(t => t.role === 'rep').length === 0
}

/** One-shot judge prompt over a FULL completed conversation, unlike
 * `buildJudgePrompt` (per-turn, mid-conversation, doctor already knows the
 * objection type going in). Here the objection type itself is also unknown
 * up front — the live bot picks a free-text objection from the doctor's
 * `objections`/`objection_notes`, not a structured ObjectionType — so the
 * judge classifies it post-hoc from the transcript, alongside scoring. */
export function buildLiveJudgePrompt(doctor: Doctor, style: StyleKey, lang: 'en' | 'ar', transcript: LiveTranscriptTurn[]): string {
  const conversation = transcript.map(t => `${t.role === 'doctor' ? 'Doctor' : 'Rep'}: ${t.text}`).join('\n')
  return `${personaLines(doctor, style, lang)}

You just finished a live spoken practice conversation with a sales rep. Review the full transcript below as an objective observer — you are not the doctor now, you are scoring the rep's performance.

Full conversation:
${conversation || '(no conversation recorded)'}

Classify the objection the doctor raised into exactly one of these five types:
- "wrong_info": the doctor's concern was based on a factual misunderstanding
- "doubt": the doctor doesn't believe the claim without more evidence
- "true_objection": the doctor has a real, valid concern about the product/fit
- "indifference": the doctor doesn't see why this matters to their practice
- "false_objection": the doctor's stated reason isn't their real reason

Decide the outcome: "won" if the rep resolved the doctor's concern by the end of the conversation, "escalated" if the doctor remained unconvinced or disengaged.

Identify every CLEAR objection-handling step the rep demonstrated at any point in the conversation:
- "clarify": asked an open-ended question to understand the concern better
- "listen": paraphrased, reflected back, or repeated what the doctor said
- "empathy": acknowledged how the doctor feels or thinks about this
- "answer": gave a substantive response addressing the objection
- "recheck": asked whether their answer resolved the concern or if anything remains

Return JSON exactly in this shape:
{
  "objectionType": "wrong_info" | "doubt" | "true_objection" | "indifference" | "false_objection",
  "outcome": "won" | "escalated",
  "clearSteps": ["clarify", "listen", "empathy", "answer", "recheck"]
}
"clearSteps" = the subset of the five steps the rep demonstrated anywhere in the conversation — empty array if none.`
}

export function parseLiveJudgeResponse(text: string): { objectionType: ObjectionType; outcome: 'won' | 'escalated'; clearSteps: ClearStep[] } | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  let obj: unknown
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  const o = obj as Record<string, unknown>
  if (!o || !isObjectionType(o.objectionType)) return null
  if (o.outcome !== 'won' && o.outcome !== 'escalated') return null
  const clearSteps: ClearStep[] = Array.isArray(o.clearSteps) ? o.clearSteps.filter(isClearStep) : []
  return { objectionType: o.objectionType, outcome: o.outcome, clearSteps }
}

export type ConversationTurnRow = {
  session_id: string; rep_id: string; doctor_id: string; turn_index: number
  role: 'rep' | 'doctor'; text: string; objection_type: ObjectionType; clear_steps_hit: ClearStep[]
}

/** Backfills `conversation_turns` from a realtime transcript so Phase 2-6
 * deep analysis keeps working on this mode too. `clear_steps_hit` is left
 * empty on every row — the judge here scores the whole conversation, not
 * each turn, so per-turn step attribution would be fabricated, not derived.
 * `trust`/`skepticism`/`engagement`/`time_pressure` are intentionally
 * omitted (column is nullable): this mode has no physician-state model, so
 * Pressure Shift naturally finds no pressure moment for these sessions
 * rather than a faked one. */
export function transcriptToConversationTurns(
  transcript: LiveTranscriptTurn[],
  ctx: { sessionId: string; repId: string; doctorId: string; objectionType: ObjectionType },
): ConversationTurnRow[] {
  return transcript.map((turn, index) => ({
    session_id: ctx.sessionId, rep_id: ctx.repId, doctor_id: ctx.doctorId, turn_index: index,
    role: turn.role, text: turn.text, objection_type: ctx.objectionType, clear_steps_hit: [],
  }))
}
