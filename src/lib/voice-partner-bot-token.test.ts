import { describe, it, expect } from 'vitest'
import { signBotToken, verifyBotToken } from './voice-partner-bot-token'

const SECRET = 'test-secret-do-not-use-in-prod'
const CLAIMS = { userId: 'u1', doctorId: 'd1', sessionId: 's1' }

describe('signBotToken / verifyBotToken', () => {
  it('round-trips valid claims', () => {
    const token = signBotToken(CLAIMS, SECRET)
    const verified = verifyBotToken(token, SECRET)
    expect(verified).toMatchObject(CLAIMS)
    expect(typeof verified?.exp).toBe('number')
  })

  it('rejects a token signed with a different secret', () => {
    const token = signBotToken(CLAIMS, SECRET)
    expect(verifyBotToken(token, 'wrong-secret')).toBeNull()
  })

  it('rejects a tampered payload', () => {
    const token = signBotToken(CLAIMS, SECRET)
    const [payload, sig] = token.split('.')
    const tampered = Buffer.from(JSON.stringify({ ...CLAIMS, userId: 'attacker' })).toString('base64url')
    expect(verifyBotToken(`${tampered}.${sig}`, SECRET)).toBeNull()
  })

  it('rejects an expired token', () => {
    const almostExpired = signBotToken(CLAIMS, SECRET, -1)
    expect(verifyBotToken(almostExpired, SECRET)).toBeNull()
  })

  it('rejects a malformed token string', () => {
    expect(verifyBotToken('not-a-real-token', SECRET)).toBeNull()
    expect(verifyBotToken('', SECRET)).toBeNull()
  })

  it('returns null when no secret is configured', () => {
    expect(verifyBotToken('anything', undefined)).toBeNull()
  })
})
