/** Arabic coaching feedback can be written in standard Arabic (the default) or Iraqi dialect.
 * The choice only changes AI-written feedback; app screens stay in standard Arabic and the
 * AI doctor already speaks Iraqi. It is stored per device in a cookie so every coaching
 * route can read it without each request having to send it. */
export type FeedbackDialect = 'msa' | 'iraqi'

export const FEEDBACK_DIALECT_COOKIE = 'styleshift_feedback_dialect'

export function parseFeedbackDialect(value: unknown): FeedbackDialect {
  return value === 'iraqi' ? 'iraqi' : 'msa'
}

/** Appended last to a coaching prompt so it overrides the earlier "standard Arabic" instruction.
 * Coaching is read, not spoken, so it asks for a light, readable Iraqi register. */
export const IRAQI_FEEDBACK_RULE =
  'LANGUAGE OVERRIDE (this replaces any earlier instruction to use Modern Standard Arabic): write every Arabic free-text field ' +
  'in natural Iraqi Arabic (central/Baghdadi), the way an Iraqi field trainer would write to a rep in a WhatsApp message. ' +
  'Keep it easy to read: short sentences, common Iraqi words such as شنو، شلون، ليش، هسه، أكو، ماكو، هواية، زين، مو، اللي. ' +
  'Do not use Gulf, Levantine or Egyptian forms (no أبي، الحين، بدي، شو، عايز، دلوقتي). ' +
  'Keep drug and product names, medical terms, numbers and units exactly as given. JSON keys and enumerated values stay in English exactly as specified.'

/** Extra prompt text for the chosen dialect, or '' when nothing changes. */
export function feedbackDialectRule(lang: string, dialect: FeedbackDialect): string {
  return lang === 'ar' && dialect === 'iraqi' ? `\n\n${IRAQI_FEEDBACK_RULE}` : ''
}
