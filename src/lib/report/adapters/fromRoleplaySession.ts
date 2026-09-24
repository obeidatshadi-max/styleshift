import type { TranscriptSegment, ReportContext, SocialStyle } from '@/schemas/conversationReport'
import { isSocialStyle } from '@/schemas/conversationReport'

export interface TranscriptSegmentRow {
  segment_index: number
  speaker_role: 'rep' | 'counterpart'
  text: string
  start_ms: number | null
  end_ms: number | null
}

export interface RoleplaySessionRow {
  talk_ratio: number | null
  rapid_turn_switches: number | null
  question_ratio: number | null
  open_question_ratio: number | null
  paraphrase_score: number | null
  active_listening_score: number | null
  rep_style: string | null
  partner_style: string | null
  adaptation_score: number | null
}

export function adaptRoleplaySession(
  rows: TranscriptSegmentRow[], session: RoleplaySessionRow,
): { segments: TranscriptSegment[]; context: ReportContext } {
  const segments: TranscriptSegment[] = rows.map(r => ({
    segmentIndex: r.segment_index,
    speakerRole: r.speaker_role,
    text: r.text,
    startMs: r.start_ms,
    endMs: r.end_ms,
    createdAt: null,
  }))

  const savedCounterpartStyle: SocialStyle | null = isSocialStyle(session.partner_style) ? session.partner_style : null

  const context: ReportContext = {
    objective: null,
    productContext: null,
    isSimulation: false,
    simulationPersona: null,
    savedCounterpartStyle,
    deterministicMetrics: {
      talkRatio: session.talk_ratio, rapidTurnSwitches: session.rapid_turn_switches,
      questionRatio: session.question_ratio, openQuestionRatio: session.open_question_ratio,
      paraphraseScore: session.paraphrase_score, activeListeningScore: session.active_listening_score,
      repStyle: session.rep_style, adaptationScore: session.adaptation_score,
    },
    qualityFlags: rows.length < 10 ? ['short_session'] : [], // MIN_RELIABLE_TURNS in roleplay-core.ts
  }
  return { segments, context }
}
