import { createHmac, timingSafeEqual } from 'node:crypto'
import { parseDebriefInput, parseDebriefResult, type DebriefInput, type DebriefResult } from './coach-debrief'

export interface RecoverableDebrief {
  id: string
  rep_id: string
  doctor_id: string
  doctor_name: string
  input: DebriefInput
  result: DebriefResult
  created_at: string
}
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.ANTHROPIC_API_KEY
const signature = (body: string) => createHmac('sha256', key()!).update(`debrief-recovery-v1:${body}`).digest('base64url')

/** A save retry must carry the server's original report, not arbitrary client-authored AI output. */
export function signDebrief(row: RecoverableDebrief): string | null {
  if (!key()) return null
  const body = Buffer.from(JSON.stringify({ row, expires: Date.now() + 7 * 86400_000 })).toString('base64url')
  return `${body}.${signature(body)}`
}

export function verifyDebrief(token: unknown, owner: string): RecoverableDebrief | null {
  if (!key() || typeof token !== 'string' || token.length > 150_000) return null
  try {
    const [body, sig, extra] = token.split('.')
    if (!body || !sig || extra) return null
    const a = Buffer.from(sig), b = Buffer.from(signature(body))
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const { row, expires } = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!Number.isFinite(expires) || expires < Date.now() || row.rep_id !== owner ||
      !parseDebriefInput(row.input) || !parseDebriefResult(JSON.stringify(row.result)) || row.doctor_id !== row.input.doctorId) return null
    return row
  } catch { return null }
}
