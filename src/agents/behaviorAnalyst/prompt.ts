import { COMPETENCIES, DIRECTIONS } from '@/schemas/observation'
import type { StyleShiftSession } from '@/schemas/session'
import { DRIVE } from '@/lib/doctor-context'
import { langName } from '@/lib/voice-partner-core'
import { defaultScoringConfig, type ScoringConfig } from '@/scoring/config'
import { SCORED_COMPETENCIES } from '@/schemas/scoring'
import type { StyleKey } from '@/types/game'

export const ANALYST_SYSTEM = `You are an objective behavioral observer for pharmaceutical sales role-plays. You read a COMPLETED transcript and record what the sales rep observably did.

Hard rules — follow exactly:
- Observe only. NEVER coach, advise, suggest, recommend, or say what the rep should/could have done. No "should", "could have", "try", "next time", "consider".
- NEVER give a score, grade, rating or overall verdict. Describe behavior only.
- Every observation MUST be backed by evidence: a VERBATIM quote copied exactly from a transcript line, with that line's turn number. If you cannot quote it, do not report it.
- Do not invent behaviors, quotes, turn numbers, or timestamps. Report nothing for a competency the transcript does not exercise.
- NEVER invent clinical data or judge whether the rep's product claims are medically true.
- Describe the rep's behavior and its visible effect on the doctor's next line. Do not speculate about the rep's intentions or skill.
- Output ONLY a single valid JSON object. No markdown fences, no commentary.`

const COMPETENCY_GUIDE: Record<typeof COMPETENCIES[number], string> = {
  questioning: 'Types and quality of questions asked: open vs closed, relevance, follow-ups.',
  active_listening: 'Paraphrasing, reflecting the doctor\'s words, acknowledging feelings, picking up on what the doctor just said vs ignoring it or talking over it.',
  discovery: 'Uncovering the doctor\'s real needs, patient types, concerns or reasons behind a stated objection, versus assuming.',
  communication_clarity: 'Structure, brevity, plain language; long or rambling turns; clear vs vague statements.',
  adaptation: 'Whether the rep\'s pace, depth, tone and content fit THIS doctor\'s communication style and current mood, and shifted when the doctor\'s reaction shifted.',
  objection_handling: 'How the rep responded when the doctor raised resistance: acknowledged it, clarified it, answered it, checked resolution, or argued/dismissed it.',
  value_communication: 'Linking the product to what this doctor cares about; using generic evidence references; features vs benefits tied to the doctor\'s situation.',
  closing: 'Summarizing, proposing a concrete next step, or asking for commitment, and how the doctor responded.',
}

const STYLE_KEYS: readonly StyleKey[] = ['driver', 'expressive', 'amiable', 'analytical']

function doctorStyleLine(session: StyleShiftSession): string {
  const { weights, dominant, source } = session.socialStyle
  if (source === 'unknown') return 'Doctor communication style: unknown — judge adaptation only from how the doctor visibly reacted.'
  const total = STYLE_KEYS.reduce((a, k) => a + weights[k], 0)
  const blend = STYLE_KEYS
    .map(k => ({ k, pct: total > 0 ? Math.round((weights[k] / total) * 100) : 0 }))
    .filter(p => p.pct > 0).sort((a, b) => b.pct - a.pct)
    .map(p => `${p.pct}% ${p.k} (drive: ${DRIVE[p.k]})`).join(', ')
  return `Doctor communication style: ${blend}${dominant ? `; dominant ${dominant}` : ''}. Use this only to judge whether the rep's approach fit the doctor.`
}

export function formatTranscript(session: StyleShiftSession): string {
  return session.transcript
    .map(t => `[turn ${t.turnIndex} | ${t.role}] ${t.text}`)
    .join('\n')
}

/** The behavior keys the analyst may report for a competency, straight from
 * the scoring config so the prompt can never drift from what gets scored. */
function catalogFor(competency: typeof COMPETENCIES[number], cfg: ScoringConfig): string {
  if (!(SCORED_COMPETENCIES as readonly string[]).includes(competency)) {
    return '    behavior: a free short label (observed but not scored)'
  }
  const rules = cfg.competencies[competency as typeof SCORED_COMPETENCIES[number]].behaviors
  return Object.entries(rules).map(([key, r]) => `    * ${key} — ${r.description}`).join('\n')
}

export function buildAnalystPrompt(session: StyleShiftSession, cfg: ScoringConfig = defaultScoringConfig): string {
  const competencies = COMPETENCIES.map(c => `- ${c}: ${COMPETENCY_GUIDE[c]}\n${catalogFor(c, cfg)}`).join('\n')
  return `Session context:
- Doctor: ${session.physician.name || 'unknown'}${session.specialty ? ` (${session.specialty})` : ''}
- Difficulty: ${session.difficulty}
- Objection type this session: ${session.objections.activeType ?? 'unspecified'}
- ${doctorStyleLine(session)}
- Write the "behavior" and "observation" text in ${langName(session.lang)}. Keep "quote" text exactly as it appears in the transcript, in its original language.

Competencies and the ONLY behavior keys you may report under each (use these exact keys; if what the rep did matches none of them, report nothing for it):
${competencies}

Transcript (each line is "[turn N | speaker] text"):
${session.transcript.length ? formatTranscript(session) : '(empty)'}

Task: list the rep's observable behaviors, each tied to one competency. Include both behaviors that moved the doctor toward engagement and behaviors that moved them away or passed over an opening. Report between 3 and 15 observations; fewer if the transcript is short.

Return JSON exactly in this shape:
{
  "observations": [
    {
      "competency": "${COMPETENCIES.join('" | "')}",
      "behavior": "exact behavior key from the list above",
      "observation": "one neutral sentence describing what happened and the doctor's visible reaction — no advice",
      "evidence": [ { "turnIndex": 2, "quote": "exact words copied from that turn" } ],
      "direction": "${DIRECTIONS.join('" | "')}",
      "confidence": 0.0
    }
  ]
}
"direction": positive = moved the doctor toward engagement or agreement; negative = moved them away or missed an opening they gave; neutral = no visible effect.
"confidence": 0 to 1, how clearly the transcript supports this reading.`
}
