import { cookies } from 'next/headers'
import { FEEDBACK_DIALECT_COOKIE, parseFeedbackDialect, type FeedbackDialect } from './feedback-dialect'

/** Reads the rep's coaching-feedback dialect from the request cookie. Missing or unreadable means standard Arabic. */
export async function readFeedbackDialect(): Promise<FeedbackDialect> {
  try {
    return parseFeedbackDialect((await cookies()).get(FEEDBACK_DIALECT_COOKIE)?.value)
  } catch {
    return 'msa'
  }
}
