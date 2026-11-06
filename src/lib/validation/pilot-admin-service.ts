import { RUBRIC_VERSION } from './rubric'

/** Versions every new pilot records (docs/validation). A pilot never changes them after it starts. */
export const METHODOLOGY_VERSION = 'mm-1.0.0'
export const PROTOCOL_VERSION = 'bvp-1.0.0'

export const DATA_SOURCES = ['synthetic', 'staging', 'pilot'] as const
export const SESSION_TYPES = ['human_partner', 'ai_doctor_voice', 'ai_doctor_text'] as const
export const SCENARIO_TYPES = ['A', 'B', 'C', 'D'] as const
export const SCENARIO_VERSIONS = ['v1', 'v2'] as const
export const PHASES = ['baseline', 'practice', 'followup'] as const
export const MEMBER_ROLES = ['administrator', 'assessor', 'adjudicator'] as const
/** At least two assessors per case: agreement between assessors is what the pilot measures. */
export const MIN_ASSESSORS = 2
export const MAX_ASSESSORS = 5

type OneOf<T extends readonly string[]> = T[number]
export type DataSource = OneOf<typeof DATA_SOURCES>
export type SessionType = OneOf<typeof SESSION_TYPES>
export type MemberRole = OneOf<typeof MEMBER_ROLES>
export type PilotStatus = 'draft' | 'running' | 'closed'

export interface Pilot { id: string; name: string; status: PilotStatus; dataSource: DataSource; companyId: string }
export interface Member { userId: string; role: MemberRole; displayName: string }
export interface Person { id: string; displayName: string; role: string }
export interface CaseRow { id: string; repId: string; scenarioType: string; phase: string; assessorIds: string[] }

export interface NewCase {
  repId: string
  sessionType: SessionType
  sessionId: string
  scenarioType: OneOf<typeof SCENARIO_TYPES>
  scenarioVersion: OneOf<typeof SCENARIO_VERSIONS>
  phase: OneOf<typeof PHASES>
  seenBefore: boolean
  assessorIds: string[]
}

/**
 * What the service needs. The real store (pilot-admin-store.ts) checks that the caller administers the pilot as the
 * signed-in user, then writes with the server's admin client: these tables have no write policy for signed-in users.
 */
export interface PilotAdminStore {
  /** Pilots the caller administers. */
  myPilots(): Promise<Pilot[]>
  /** The pilot, only if the caller is one of its administrators; otherwise null. */
  pilot(pilotId: string): Promise<Pilot | null>
  createPilot(input: { companyId: string; name: string; dataSource: DataSource }): Promise<{ id: string }>
  members(pilotId: string): Promise<Member[]>
  people(companyId: string): Promise<Person[]>
  profile(userId: string): Promise<(Person & { companyId: string | null }) | null>
  addMember(pilotId: string, userId: string, role: MemberRole): Promise<void>
  cases(pilotId: string): Promise<CaseRow[]>
  sessionBelongsToRep(type: SessionType, sessionId: string, repId: string): Promise<boolean>
  addCase(pilotId: string, c: NewCase): Promise<{ id: string }>
  setStatus(pilotId: string, status: PilotStatus): Promise<void>
}

export interface Result<T> { status: number; body: T | { error: string } }
const fail = (status: number, error: string): Result<never> => ({ status, body: { error } })
const isOne = <T extends readonly string[]>(list: T, v: unknown): v is OneOf<T> => typeof v === 'string' && (list as readonly string[]).includes(v)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const pilotVersions = () => ({ rubric: RUBRIC_VERSION, methodology: METHODOLOGY_VERSION, protocol: PROTOCOL_VERSION })

export async function listPilots(store: PilotAdminStore): Promise<Result<{ pilots: Pilot[] }>> {
  return { status: 200, body: { pilots: await store.myPilots() } }
}

/** Only a manager of a company can start a pilot, and only for their own company. The creator becomes its administrator. */
export async function createPilot(store: PilotAdminStore, managerCompanyId: string | null, raw: unknown): Promise<Result<{ id: string }>> {
  if (!managerCompanyId) return fail(403, 'forbidden')
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (name.length < 1 || name.length > 120) return fail(400, 'The name must be 1 to 120 characters.')
  if (!isOne(DATA_SOURCES, b.dataSource)) return fail(400, 'Say whether the data is synthetic, staging or pilot.')
  return { status: 201, body: await store.createPilot({ companyId: managerCompanyId, name, dataSource: b.dataSource }) }
}

export async function getPilot(store: PilotAdminStore, pilotId: string): Promise<Result<{ pilot: Pilot; versions: ReturnType<typeof pilotVersions>; members: Member[]; cases: CaseRow[]; people: Person[] }>> {
  const pilot = await store.pilot(pilotId)
  if (!pilot) return fail(404, 'not_found')
  const [members, cases, people] = await Promise.all([store.members(pilotId), store.cases(pilotId), store.people(pilot.companyId)])
  return { status: 200, body: { pilot, versions: pilotVersions(), members, cases, people } }
}

export async function addMember(store: PilotAdminStore, pilotId: string, raw: unknown): Promise<Result<{ ok: true }>> {
  const pilot = await store.pilot(pilotId)
  if (!pilot) return fail(404, 'not_found')
  if (pilot.status === 'closed') return fail(409, 'This pilot is closed.')
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (typeof b.userId !== 'string' || !UUID.test(b.userId)) return fail(400, 'Choose a person.')
  if (!isOne(MEMBER_ROLES, b.role)) return fail(400, 'Choose a role.')
  const person = await store.profile(b.userId)
  if (!person || person.companyId !== pilot.companyId) return fail(400, 'That person is not in this company.')
  if (b.role === 'administrator' && person.role !== 'manager') return fail(400, 'Only a manager can administer a pilot.')
  const held = (await store.members(pilotId)).filter(m => m.userId === b.userId).map(m => m.role)
  if (held.includes(b.role)) return fail(409, 'This person already has that role in the pilot.')
  // The database refuses this pairing too (human readers of the pilot must stay independent of its administrators).
  if ((b.role === 'assessor' && held.includes('administrator')) || (b.role === 'administrator' && held.includes('assessor'))) return fail(409, 'An administrator cannot also be an assessor in the same pilot.')
  if (b.role === 'assessor') {
    // Nobody rates their own conversation.
    if ((await store.cases(pilotId)).some(c => c.repId === b.userId)) return fail(409, 'This person is a representative in the pilot and cannot also be an assessor.')
  }
  await store.addMember(pilotId, b.userId, b.role)
  return { status: 200, body: { ok: true } }
}

/**
 * Add one case: a real session of a real representative of the company, the scenario and phase it belongs to, and at
 * least two assessors. Cases are added only while the pilot is a draft, so the plan is fixed before anyone rates.
 */
export async function addCase(store: PilotAdminStore, pilotId: string, raw: unknown): Promise<Result<{ id: string; warnings: string[] }>> {
  const pilot = await store.pilot(pilotId)
  if (!pilot) return fail(404, 'not_found')
  if (pilot.status !== 'draft') return fail(409, 'Cases can only be added while the pilot is a draft.')
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (typeof b.repId !== 'string' || !UUID.test(b.repId)) return fail(400, 'Choose the representative.')
  if (!isOne(SESSION_TYPES, b.sessionType)) return fail(400, 'Choose the session type.')
  if (typeof b.sessionId !== 'string' || !UUID.test(b.sessionId)) return fail(400, 'The session id is not valid.')
  if (!isOne(SCENARIO_TYPES, b.scenarioType)) return fail(400, 'Scenario type is A, B, C or D.')
  if (!isOne(SCENARIO_VERSIONS, b.scenarioVersion)) return fail(400, 'Scenario version is v1 or v2.')
  if (!isOne(PHASES, b.phase)) return fail(400, 'Phase is baseline, practice or followup.')
  if (typeof b.seenBefore !== 'boolean') return fail(400, 'Say whether the representative has seen this scenario before.')
  const ids = Array.isArray(b.assessorIds) ? [...new Set(b.assessorIds.filter((x): x is string => typeof x === 'string'))] : []
  if (ids.length < MIN_ASSESSORS || ids.length > MAX_ASSESSORS || ids.some(i => !UUID.test(i))) return fail(400, `Choose ${MIN_ASSESSORS} to ${MAX_ASSESSORS} different assessors.`)
  if (ids.includes(b.repId)) return fail(400, 'A representative cannot rate their own conversation.')

  const rep = await store.profile(b.repId)
  if (!rep || rep.companyId !== pilot.companyId) return fail(400, 'That representative is not in this company.')
  const members = await store.members(pilotId)
  const assessors = ids.map(id => members.find(m => m.userId === id && m.role === 'assessor'))
  if (assessors.some(a => !a)) return fail(400, 'Every assessor must first be added to the pilot as an assessor.')
  if (!(await store.sessionBelongsToRep(b.sessionType, b.sessionId, b.repId))) return fail(400, 'That session does not exist for this representative.')

  const warnings: string[] = []
  for (const id of ids) {
    const p = await store.profile(id)
    if (p?.role === 'manager') warnings.push(`${p.displayName} is a manager in the same company and may know this representative; a manager from outside the company would be blinder.`)
  }
  const made = await store.addCase(pilotId, {
    repId: b.repId, sessionType: b.sessionType, sessionId: b.sessionId, scenarioType: b.scenarioType,
    scenarioVersion: b.scenarioVersion, phase: b.phase, seenBefore: b.seenBefore, assessorIds: ids,
  })
  return { status: 201, body: { id: made.id, warnings } }
}

/**
 * draft -> running -> closed, never back. Starting needs at least one case, every case with at least two assessors, and
 * an administrator. Closing is final: ratings stop being accepted, and the data can be analysed.
 */
export async function changeStatus(store: PilotAdminStore, pilotId: string, raw: unknown): Promise<Result<{ status: PilotStatus }>> {
  const pilot = await store.pilot(pilotId)
  if (!pilot) return fail(404, 'not_found')
  const to = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>).status : undefined)
  if (to !== 'running' && to !== 'closed') return fail(400, 'Status is running or closed.')
  const allowed = (pilot.status === 'draft' && to === 'running') || (pilot.status === 'running' && to === 'closed')
  if (!allowed) return fail(409, `A pilot cannot go from ${pilot.status} to ${to}.`)
  if (to === 'running') {
    const cases = await store.cases(pilotId)
    if (cases.length === 0) return fail(409, 'Add at least one case before starting.')
    if (cases.some(c => c.assessorIds.length < MIN_ASSESSORS)) return fail(409, `Every case needs at least ${MIN_ASSESSORS} assessors before starting.`)
  }
  await store.setStatus(pilotId, to)
  return { status: 200, body: { status: to } }
}
