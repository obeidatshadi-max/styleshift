import { checkRateLimit } from '@/lib/rate-limit'

/**
 * Rate limits for the AI Doctor routes, one budget per kind of call.
 *
 * These routes used to share one budget of 20 calls per hour. One turn-based session uses
 * about 14 calls (open, 5 turns, 6 spoken lines, result, analysis), so a rep's second
 * session was blocked mid-conversation (architecture review 2026-11-27, F2).
 *
 *   start  - starting a session or drill: the number that matters for fair use.
 *   reply  - each judged reply and each spoken line inside a session. Sessions are already
 *            capped server-side (TURN_CAP), so this is a cost guard against scripted abuse.
 *   result - reading back a result, analysis or replay context after a session.
 */
export const VOICE_RATE_LIMITS = {
  start: { bucket: 'vp-start', limit: 30 },
  reply: { bucket: 'vp-reply', limit: 200 },
  result: { bucket: 'vp-result', limit: 60 },
} as const

export type VoiceCallKind = keyof typeof VOICE_RATE_LIMITS

export function checkVoiceRateLimit(kind: VoiceCallKind, userId: string): Promise<boolean> {
  const { bucket, limit } = VOICE_RATE_LIMITS[kind]
  return checkRateLimit(bucket, userId, limit, 3600)
}
