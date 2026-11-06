import { describe, it, expect, vi } from 'vitest'
import { parseExtras, runAnalysis } from './analysis-run'
import type { AnalysisInput } from './analysis'
import type { Pilot, PilotAdminStore } from './pilot-admin-service'

const pilot = (status: Pilot['status']): Pilot => ({ id: 'p', name: 'P', status, dataSource: 'synthetic', companyId: 'c' })
const storeFor = (p: Pilot | null) => ({ pilot: async () => p }) as unknown as PilotAdminStore
const empty: AnalysisInput = { dataSource: 'synthetic', cases: [], claims: [], securityGate: 'UNKNOWN', criticalIncidents: null }

describe('parseExtras', () => {
  it('defaults to an unknown gate and an uncounted incident number', () => {
    expect(parseExtras(new URLSearchParams())).toEqual({ securityGate: 'UNKNOWN', criticalIncidents: null })
  })
  it('reads the gate and a whole-number incident count', () => {
    expect(parseExtras(new URLSearchParams('gate=PASS&incidents=0'))).toEqual({ securityGate: 'PASS', criticalIncidents: 0 })
  })
  it.each(['gate=MAYBE', 'incidents=-1', 'incidents=1.5', 'incidents=abc', 'incidents=99999'])('rejects %s', q => {
    expect('error' in parseExtras(new URLSearchParams(q))).toBe(true)
  })
})

describe('runAnalysis', () => {
  it('is 404 for someone who does not administer the pilot, and loads nothing', async () => {
    const load = vi.fn(async () => empty)
    expect((await runAnalysis(storeFor(null), load, 'p', new URLSearchParams())).status).toBe(404)
    expect(load).not.toHaveBeenCalled()
  })

  it('rejects bad parameters before reading any data', async () => {
    const load = vi.fn(async () => empty)
    expect((await runAnalysis(storeFor(pilot('closed')), load, 'p', new URLSearchParams('gate=NOPE'))).status).toBe(400)
    expect(load).not.toHaveBeenCalled()
  })

  it('marks a pilot that is not closed as interim, and passes the extras to the loader', async () => {
    const load = vi.fn(async () => empty)
    const open = await runAnalysis(storeFor(pilot('running')), load, 'p', new URLSearchParams('gate=PASS&incidents=0'))
    expect(open.status).toBe(200)
    expect((open.body as { interim: boolean }).interim).toBe(true)
    expect(load).toHaveBeenCalledWith('p', { securityGate: 'PASS', criticalIncidents: 0 })
    const closed = await runAnalysis(storeFor(pilot('closed')), load, 'p', new URLSearchParams())
    expect((closed.body as { interim: boolean }).interim).toBe(false)
  })

  it('returns a report labelled with the data source, and writes nothing', async () => {
    const r = await runAnalysis(storeFor(pilot('closed')), async () => empty, 'p', new URLSearchParams())
    const body = r.body as { report: { label: string; recommendation: string } }
    expect(body.report.label).toMatch(/not pilot evidence/)
    expect(body.report.recommendation).toBe('NOT_PILOT_DATA')
  })
})
