import { isObjectionType, isClearStep, type ClearStep, type ObjectionType } from '@/lib/voice-partner-core'
import { isMetricKey, type MetricKey } from './metrics'
import type { DrillKind } from './roadmap'
import type { FieldObservation } from './followup'

// Who may do what with a follow-up. Pure, so every rule is unit-tested without a
// database. The routes load the profiles/rows and ask these functions; the database
// constraints in 20261104130000_coaching_followups.sql back the same rules up.

export interface Actor { id: string; role: string | null; companyId: string | null }
export interface FollowupOwner { repId: string; companyId: string; closedAt: string | null }

const isManager = (a: Actor) => a.role === 'manager' && !!a.companyId

/** A manager may assign only to a rep of their own company. */
export function canAssign(manager: Actor, rep: Actor): boolean {
  return isManager(manager) && rep.role === 'rep' && rep.companyId === manager.companyId && manager.id !== rep.id
}

/** The rep, or a manager of the same company. Nobody else, ever. */
export function canViewFollowup(actor: Actor, f: FollowupOwner): boolean {
  return actor.id === f.repId || (isManager(actor) && actor.companyId === f.companyId)
}

export function canAcknowledge(actor: Actor, f: FollowupOwner): boolean {
  return actor.id === f.repId && !f.closedAt
}

export function canClose(actor: Actor, f: FollowupOwner): boolean {
  return isManager(actor) && actor.companyId === f.companyId && !f.closedAt
}

/** Self-report: only the rep. Verification: only a manager of the company, never the rep themself. */
export function canWriteFieldCheck(actor: Actor, f: FollowupOwner, kind: 'self_reported' | 'verified'): boolean {
  if (f.closedAt) return false
  if (kind === 'self_reported') return actor.id === f.repId
  return isManager(actor) && actor.companyId === f.companyId && actor.id !== f.repId
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SOURCES = ['ai_doctor', 'colleague_roleplay', 'drill'] as const
const DRILL_KINDS: readonly DrillKind[] = ['precision_drill', 'ai_doctor_objection', 'colleague_roleplay', 'micro_practice']
export const MAX_NOTE_CHARS = 300

export interface FollowupRequest {
  repId: string
  metricKey: MetricKey | null
  source: typeof SOURCES[number] | null
  drillKind: DrillKind
  objectionType: ObjectionType | null
  clearStep: ClearStep | null
  note: string | null
  dueDate: string | null
}

const cleanNote = (v: unknown): string | null | undefined => {
  if (v === undefined || v === null || v === '') return null
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t.length > MAX_NOTE_CHARS ? undefined : t || null
}

/** Strict parse: anything unexpected is rejected, nothing is silently coerced. */
export function parseFollowupRequest(body: unknown): FollowupRequest | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (typeof b.repId !== 'string' || !UUID.test(b.repId)) return null
  if (!(DRILL_KINDS as readonly unknown[]).includes(b.drillKind)) return null
  const metricKey = b.metricKey ?? null
  if (metricKey !== null && !isMetricKey(metricKey)) return null
  const source = b.source ?? null
  if (source !== null && !(SOURCES as readonly unknown[]).includes(source)) return null
  const objectionType = b.objectionType ?? null
  if (objectionType !== null && !isObjectionType(objectionType)) return null
  const clearStep = b.clearStep ?? null
  if (clearStep !== null && !isClearStep(clearStep)) return null
  const note = cleanNote(b.note)
  if (note === undefined) return null
  const dueDate = b.dueDate ?? null
  if (dueDate !== null && (typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(dueDate)))) return null
  return {
    repId: b.repId, metricKey: metricKey as MetricKey | null, source: source as FollowupRequest['source'],
    drillKind: b.drillKind as DrillKind, objectionType: objectionType as ObjectionType | null,
    clearStep: clearStep as ClearStep | null, note, dueDate: dueDate as string | null,
  }
}

export interface FieldCheckRequest { followupId: string; kind: 'self_reported' | 'verified'; observed: FieldObservation; note: string | null }

export function parseFieldCheckRequest(body: unknown): FieldCheckRequest | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (typeof b.followupId !== 'string' || !UUID.test(b.followupId)) return null
  if (b.kind !== 'self_reported' && b.kind !== 'verified') return null
  if (b.observed !== 'seen' && b.observed !== 'not_seen' && b.observed !== 'unclear') return null
  const note = cleanNote(b.note)
  if (note === undefined) return null
  return { followupId: b.followupId, kind: b.kind, observed: b.observed, note }
}
