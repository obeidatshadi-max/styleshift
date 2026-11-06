import { analyse, type AnalysisInput, type AnalysisReport } from './analysis'
import type { PilotAdminStore, PilotStatus, Result } from './pilot-admin-service'

export type AnalysisExtras = Pick<AnalysisInput, 'securityGate' | 'criticalIncidents'>
const GATES = ['PASS', 'CONDITIONAL', 'FAIL', 'UNKNOWN'] as const

/** `?incidents=0&gate=PASS`: the two inputs nobody can compute from the stored data. Anything else is ignored. */
export function parseExtras(params: URLSearchParams): AnalysisExtras | { error: string } {
  const gate = params.get('gate') ?? 'UNKNOWN'
  if (!(GATES as readonly string[]).includes(gate)) return { error: 'gate is PASS, CONDITIONAL, FAIL or UNKNOWN.' }
  const raw = params.get('incidents')
  let criticalIncidents: number | null = null
  if (raw !== null && raw !== '') {
    if (!/^\d{1,4}$/.test(raw)) return { error: 'incidents is a whole number.' }
    criticalIncidents = Number(raw)
  }
  return { securityGate: gate as AnalysisExtras['securityGate'], criticalIncidents }
}

/**
 * Run the pre-specified analysis for a pilot the caller administers. Read-only: it writes nothing and changes no
 * rating. Available at any status; a pilot that is not closed is labelled interim so a partial result is never mistaken
 * for a final one.
 */
export async function runAnalysis(
  store: PilotAdminStore,
  load: (pilotId: string, extras: AnalysisExtras) => Promise<AnalysisInput>,
  pilotId: string,
  params: URLSearchParams,
): Promise<Result<{ pilotStatus: PilotStatus; interim: boolean; report: AnalysisReport }>> {
  const pilot = await store.pilot(pilotId)
  if (!pilot) return { status: 404, body: { error: 'not_found' } }
  const extras = parseExtras(params)
  if ('error' in extras) return { status: 400, body: { error: extras.error } }
  const report = analyse(await load(pilotId, extras))
  return { status: 200, body: { pilotStatus: pilot.status, interim: pilot.status !== 'closed', report } }
}
