import type { StyleKey } from '@/types/game'
import { SPECIALTIES } from '@/lib/game-data'
import { DRIVE } from '@/lib/doctor-context'
import { IRAQI_DIALECT_LINE, langName } from '@/lib/voice-partner-core'
import type { StyleShiftSession } from '@/schemas/session'
import type { CoachCandidate } from './select'

export const COACH_SYSTEM = `You are a supportive, practical sales coach for pharmaceutical representatives. You write coaching for a role-play that has ALREADY been observed and scored by other systems.

Hard rules — follow exactly:
- You do NOT score, grade, rate or rank. Never write a number that expresses performance (no "7/10", "60%", "scored", "rating"). Never say how well the rep did overall.
- Coach ONLY the coaching points you are given. Do not add new points or invent behaviors.
- Ground everything in the observation, evidence and doctor reaction provided. Do not claim anything that is not in them.
- NEVER invent clinical data, efficacy numbers, statistics, percentages, trial results, study names, dosages, or real/branded drug names. Refer to the product only as "your product" and to evidence generically ("the trial data", "the evidence pack").
- Be specific and actionable, warm and direct. Address the rep as "you". No shaming, no generic advice ("build rapport", "be confident").
- The "better response" must be something the rep could actually say to THIS doctor, in the rep's own voice, short (1-3 sentences), fitting the doctor's style and the situation.
- Output ONLY a single valid JSON object. No markdown fences, no commentary.`

const STYLE_KEYS: readonly StyleKey[] = ['driver', 'expressive', 'amiable', 'analytical']

function personaSummary(session: StyleShiftSession): string {
  const { physician, specialty, socialStyle, objections, difficulty } = session
  const total = STYLE_KEYS.reduce((a, k) => a + socialStyle.weights[k], 0)
  const drives = socialStyle.source === 'unknown' || total <= 0
    ? 'communication style not known'
    : STYLE_KEYS.map(k => ({ k, pct: Math.round((socialStyle.weights[k] / total) * 100) }))
        .filter(p => p.pct > 0).sort((a, b) => b.pct - a.pct)
        .map(p => `${p.pct}% ${DRIVE[p.k]}`).join(', ')
  const lines = [
    `Doctor: ${physician.name || 'unknown'}${specialty ? `, ${SPECIALTIES[specialty].name}` : ''}${physician.workplace ? ` at ${physician.workplace}` : ''}`,
    `What drives them: ${drives}`,
    `Difficulty: ${difficulty}`,
    `Objection theme: ${objections.activeType ?? (objections.onProfile.join(', ') || 'unspecified')}`,
  ]
  if (physician.keyPhrases?.trim()) lines.push(`They often say: "${physician.keyPhrases.trim()}"`)
  return lines.join('\n')
}

function objectivesBlock(session: StyleShiftSession): string {
  if (!session.learningObjectives.length) return '(none set — link nothing; use null for objectiveId)'
  return session.learningObjectives
    .map(o => `- ${o.id}: ${o.label}${o.targetObjection ? ` [objection: ${o.targetObjection}]` : ''}`).join('\n')
}

function candidateBlock(c: CoachCandidate): string {
  const evidence = c.evidence.map(e => `    turn ${e.turnIndex} (${e.role}): "${e.quote}"`).join('\n')
  const standing = c.standing === 'weaker' ? 'one of the weaker areas this session'
    : c.standing === 'stronger' ? 'one of the stronger areas this session' : 'a middling area this session'
  return `[${c.ref}] ${c.kind === 'improve' ? 'IMPROVE' : 'BUILD ON A STRENGTH'} — ${c.competency}, behavior "${c.behavior}" (${c.behaviorDescription})
  Observed: ${c.observation}
  Evidence:
${evidence}
  Doctor's next line: ${c.doctorReaction ? `"${c.doctorReaction}"` : '(none)'}
  Standing: ${c.standing === 'unranked' ? 'not ranked' : standing}`
}

export function buildCoachPrompt(session: StyleShiftSession, candidates: CoachCandidate[]): string {
  const languageLine = session.lang === 'ar'
    ? `Write all coaching text in Arabic. For the "betterResponseExample", ${IRAQI_DIALECT_LINE}`
    : `Write all text in ${langName(session.lang)}.`
  return `${languageLine}

Physician persona:
${personaSummary(session)}

Learning objectives for this rep:
${objectivesBlock(session)}

Coaching points to write (already chosen and ordered; do not change them):
${candidates.map(candidateBlock).join('\n\n')}

For EACH point, write:
- whatHappened: 1-2 neutral sentences on what the rep did, based on the evidence.
- whyItMattered: 1-2 sentences on the effect on THIS doctor, using the doctor's next line.
- whatToDoDifferently: for IMPROVE, the specific alternative behavior; for BUILD ON A STRENGTH, how to take the same behavior further.
- betterResponseExample: what the rep could say instead, in their own voice, 1-3 sentences.
- practiceAction: ONE concrete action for the next role-play (observable, doable in a few minutes).
- objectiveId: the id of the learning objective this serves, or null.

Return JSON exactly in this shape:
{
  "points": [
    { "ref": "c1", "whatHappened": "...", "whyItMattered": "...", "whatToDoDifferently": "...", "betterResponseExample": "...", "practiceAction": "...", "objectiveId": null }
  ]
}`
}
