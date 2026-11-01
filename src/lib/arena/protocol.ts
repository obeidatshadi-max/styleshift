import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * StyleShift Arena: shared rules for the live classroom quiz API.
 *
 * Participants have no StyleShift account. They join a class with a 6-character
 * code and get a random bearer token; the trainer creates the class with a PIN
 * and gets a trainer key. Everything here is pure so it can be unit tested.
 */

export const PHASES = ['lobby', 'pre', 'teams', 'post', 'results'] as const
export type Phase = (typeof PHASES)[number]

// No I, O, 0 or 1: codes are read off a projector and typed on phones.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/
const TEAM_ID_RE = /^t[a-z0-9]{8}$/
const PIN_RE = /^[0-9]{4,8}$/
const MARK_KEY_RE = /^(pre|post)_[A-Za-z0-9-]{1,64}$/
const PHOTO_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/

export const LIMITS = {
  participantsPerClass: 200,
  teamsPerClass: 40,
  answersChars: 60_000,
  boardChars: 100_000,
  photoChars: 400_000,
  maxSecs: 24 * 60 * 60,
  maxAuto: 500,
  maxMark: 50,
  maxMarkItems: 60,
} as const

export function makeCode(): string {
  let s = ''
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return s
}

/** Accepts "abc 123" style input from a phone keyboard. */
export function normalizeCode(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const c = v.replace(/[\s-]/g, '').toUpperCase()
  return CODE_RE.test(c) ? c : null
}

export const isPhase = (v: unknown): v is Phase => typeof v === 'string' && (PHASES as readonly string[]).includes(v)
export const isPin = (v: unknown): v is string => typeof v === 'string' && PIN_RE.test(v)
export const isTeamId = (v: unknown): v is string => typeof v === 'string' && TEAM_ID_RE.test(v)
export const isMarkKey = (v: unknown): v is string => typeof v === 'string' && MARK_KEY_RE.test(v)

/** Trimmed, whitespace-collapsed text between 1 and max characters, or null. */
export function cleanText(v: unknown, max: number, allowEmpty = false): string | null {
  if (typeof v !== 'string') return allowEmpty && v == null ? '' : null
  const t = v.replace(/\s+/g, ' ').trim()
  if (!t) return allowEmpty ? '' : null
  return [...t].length <= max ? t : null
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Quiz answers: a plain object whose JSON stays under the size cap. */
export function cleanAnswers(v: unknown): Record<string, unknown> | null {
  if (!isPlainObject(v)) return null
  const s = JSON.stringify(v)
  return s.length <= LIMITS.answersChars ? (JSON.parse(s) as Record<string, unknown>) : null
}

export function cleanBoard(v: unknown): Record<string, unknown> | null {
  if (!isPlainObject(v)) return null
  const s = JSON.stringify(v)
  return s.length <= LIMITS.boardChars ? (JSON.parse(s) as Record<string, unknown>) : null
}

export function cleanInt(v: unknown, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null
}

/** Trainer scores for written answers: question id -> whole points. */
export function cleanMarkItems(v: unknown): Record<string, number> | null {
  if (!isPlainObject(v)) return null
  const entries = Object.entries(v)
  if (entries.length > LIMITS.maxMarkItems) return null
  const out: Record<string, number> = {}
  for (const [k, n] of entries) {
    if (!/^[a-z0-9]{1,8}$/.test(k)) return null
    const score = cleanInt(n, LIMITS.maxMark)
    if (score === null) return null
    out[k] = score
  }
  return out
}

/** Team photo: a JPEG data URL produced by the page's canvas resize, or empty. */
export function cleanPhoto(v: unknown): string | null | undefined {
  if (v === undefined || v === null || v === '') return null
  if (typeof v !== 'string' || v.length > LIMITS.photoChars || !PHOTO_RE.test(v)) return undefined
  return v
}

export function photoBytes(dataUrl: string): Uint8Array {
  return new Uint8Array(Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'))
}

export const newToken = (): string => randomBytes(24).toString('base64url')
export const newSalt = (): string => randomBytes(16).toString('hex')
export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex')
export const hashPin = (pin: string, salt: string): string => scryptSync(pin, salt, 32).toString('hex')

export function safeEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function verifyPin(pin: unknown, salt: string, hash: string): boolean {
  return isPin(pin) && safeEqual(hashPin(pin, salt), hash)
}

export const isExpired = (expiresAt: string | null | undefined, now = Date.now()): boolean =>
  !!expiresAt && new Date(expiresAt).getTime() <= now
