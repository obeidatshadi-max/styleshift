import { createHmac, timingSafeEqual } from 'crypto'
import { isClearStep, isObjectionType, type ClearStep, type ObjectionType } from '@/lib/voice-partner-core'

// A signed record of a session result that THE SERVER's judge decided.
//
// Before this, /api/voice-partner/session-result stored `outcome`, `clearSteps` and
// `turnCount` exactly as the browser sent them, and certification reads win rate from
// those rows. Now the judge routes (turn, live-judge) sign the result they produced and
// session-result stores only a result that carries a valid signature for the same rep,
// doctor and session. A hand-written `outcome: "won"` is refused.
//
// What this does NOT prove: that the conversation the judge saw is real. In the
// turn-based modes the browser still carries history between turns, and in the live
// call the transcript is still assembled in the browser (validation audit W5).

export interface ResultClaims {
  userId: string
  doctorId: string
  sessionId: string
  objectionType: ObjectionType
  outcome: 'won' | 'escalated'
  turnCount: number
  /** Sorted, unique. */
  clearSteps: ClearStep[]
  exp: number
}

const TTL_MS = 30 * 60 * 1000

/** Server-only secret. When it is not set, nothing is signed and session-result refuses
 * every result: failing closed, so an unconfigured deploy can never accept a forged win. */
function resultSecret(): string | null {
  return process.env.VOICE_PARTNER_RESULT_SECRET || null
}

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

export function normalizeClearSteps(steps: readonly ClearStep[]): ClearStep[] {
  return [...new Set(steps)].sort()
}

export function signResultToken(
  claims: Omit<ResultClaims, 'exp' | 'clearSteps'> & { clearSteps: readonly ClearStep[] },
  secret: string | null = resultSecret(), ttlMs: number = TTL_MS,
): string | null {
  if (!secret) return null
  const payload: ResultClaims = { ...claims, clearSteps: normalizeClearSteps(claims.clearSteps), exp: Date.now() + ttlMs }
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${payloadB64}.${sign(payloadB64, secret)}`
}

function isResultClaims(v: unknown): v is ResultClaims {
  if (!v || typeof v !== 'object') return false
  const c = v as Record<string, unknown>
  return typeof c.userId === 'string' && typeof c.doctorId === 'string' && typeof c.sessionId === 'string'
    && isObjectionType(c.objectionType) && (c.outcome === 'won' || c.outcome === 'escalated')
    && typeof c.turnCount === 'number' && Number.isInteger(c.turnCount) && c.turnCount >= 1
    && Array.isArray(c.clearSteps) && c.clearSteps.every(isClearStep) && typeof c.exp === 'number'
}

export function verifyResultToken(token: unknown, secret: string | null = resultSecret()): ResultClaims | null {
  if (!secret || typeof token !== 'string' || !token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sig] = parts
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(sign(payloadB64, secret))
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null
  let claims: unknown
  try { claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) } catch { return null }
  if (!isResultClaims(claims) || claims.exp < Date.now()) return null
  return claims
}
