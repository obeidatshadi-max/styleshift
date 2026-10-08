import { createHmac, timingSafeEqual } from 'crypto'

export interface BotTokenClaims {
  userId: string
  doctorId: string
  sessionId: string
  exp: number
}

const DEFAULT_TTL_MS = 10 * 60 * 1000

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

/** Compact HMAC-signed token, not a JWT — this app has no other JWT
 * usage, and the claim set is fixed and tiny, so a hand-rolled
 * `payload.signature` pair (matching the hand-rolled rate-limit/admin-
 * client patterns already in `src/lib/`) avoids a new dependency for a
 * one-off internal token. `ttlMs` param exists only so the expiry test
 * can mint an already-expired token deterministically. */
export function signBotToken(
  claims: { userId: string; doctorId: string; sessionId: string },
  secret: string | undefined = process.env.VOICE_PARTNER_BOT_TOKEN_SECRET,
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  if (!secret) throw new Error('VOICE_PARTNER_BOT_TOKEN_SECRET not configured')
  const payload: BotTokenClaims = { ...claims, exp: Date.now() + ttlMs }
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${payloadB64}.${sign(payloadB64, secret)}`
}

function isBotTokenClaims(value: unknown): value is BotTokenClaims {
  if (!value || typeof value !== 'object') return false
  const c = value as Record<string, unknown>
  return typeof c.userId === 'string' && typeof c.doctorId === 'string'
    && typeof c.sessionId === 'string' && typeof c.exp === 'number'
}

export function verifyBotToken(
  token: string,
  secret: string | undefined = process.env.VOICE_PARTNER_BOT_TOKEN_SECRET,
): BotTokenClaims | null {
  if (!secret || !token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sig] = parts
  const expected = sign(payloadB64, secret)
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expected)
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null
  let claims: unknown
  try { claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) } catch { return null }
  if (!isBotTokenClaims(claims)) return null
  if (claims.exp < Date.now()) return null
  return claims
}
