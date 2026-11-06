// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import PilotAdminPanel from './PilotAdminPanel'
import { analyse } from '@/lib/validation/analysis'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const P = '11111111-1111-4111-8111-111111111111'
const REP = '22222222-2222-4222-8222-222222222222', A1 = '33333333-3333-4333-8333-333333333333', A2 = '44444444-4444-4444-8444-444444444444'
const SESSION = '55555555-5555-4555-8555-555555555555'

const detail = (status: string) => ({
  pilot: { id: P, name: 'Pilot one', status, dataSource: 'synthetic', companyId: 'c' },
  versions: { rubric: 'hrr-1.0.0', methodology: 'mm-1.0.0', protocol: 'bvp-1.0.0' },
  members: [{ userId: A1, role: 'assessor', displayName: 'Ana' }, { userId: A2, role: 'assessor', displayName: 'Bo' }],
  cases: [],
  people: [{ id: REP, displayName: 'Rami', role: 'rep' }, { id: A1, displayName: 'Ana', role: 'rep' }, { id: A2, displayName: 'Bo', role: 'rep' }],
})

function api(status = 'draft') {
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST' && url.endsWith('/cases')) return Response.json({ id: 'k1', warnings: ['Bo is a manager in the same company.'] }, { status: 201 })
    if (init?.method === 'POST') return Response.json({ status: 'running' })
    if (url === '/api/validation/admin/pilots') return Response.json({ pilots: [{ id: P, name: 'Pilot one', status, dataSource: 'synthetic', companyId: 'c' }] })
    return Response.json(detail(status))
  })
}

describe('pilot administration panel', () => {
  it('lists pilots and opens one, showing the versions it is locked to', async () => {
    vi.stubGlobal('fetch', api())
    render(<PilotAdminPanel />)
    fireEvent.click(await screen.findByText(/Pilot one · draft · synthetic data/))
    await screen.findByText(/Rubric hrr-1.0.0 · methodology mm-1.0.0 · protocol bvp-1.0.0/)
    expect(screen.getByText('Start pilot')).toBeTruthy()
  })

  it('asks before starting and sends nothing if declined; sends the status change when confirmed', async () => {
    const fetch = api()
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('confirm', () => false)
    render(<PilotAdminPanel />)
    fireEvent.click(await screen.findByText(/Pilot one/))
    fireEvent.click(await screen.findByText('Start pilot'))
    expect(fetch.mock.calls.some(c => c[0].endsWith('/status'))).toBe(false)
    vi.stubGlobal('confirm', () => true)
    fireEvent.click(screen.getByText('Start pilot'))
    await screen.findByText('Pilot is running.')
    const call = fetch.mock.calls.find(c => c[0] === `/api/validation/admin/pilots/${P}/status`)!
    expect(JSON.parse(call[1].body)).toEqual({ status: 'running' })
  })

  it('offers case entry only while the pilot is a draft', async () => {
    vi.stubGlobal('fetch', api('running'))
    render(<PilotAdminPanel />)
    fireEvent.click(await screen.findByText(/Pilot one/))
    await screen.findByText('Close pilot')
    expect(screen.queryByText('Add case')).toBeNull()
    expect(screen.queryByText('Start pilot')).toBeNull()
  })

  it('adds a case with the chosen assessors and shows the server\'s warning', async () => {
    const fetch = api()
    vi.stubGlobal('fetch', fetch)
    render(<PilotAdminPanel />)
    fireEvent.click(await screen.findByText(/Pilot one/))
    await screen.findByText('Add case')
    fireEvent.change(screen.getByLabelText('Representative'), { target: { value: REP } })
    fireEvent.change(screen.getByLabelText('Session id'), { target: { value: SESSION } })
    fireEvent.click(screen.getByLabelText('Ana'))
    fireEvent.click(screen.getByLabelText('Bo'))
    fireEvent.click(screen.getByText('Add case'))
    await screen.findByText('Case added.')
    await waitFor(() => expect(screen.getByText(/Bo is a manager in the same company/)).toBeTruthy())
    const call = fetch.mock.calls.find(c => c[0] === `/api/validation/admin/pilots/${P}/cases`)!
    expect(JSON.parse(call[1].body)).toEqual({
      repId: REP, sessionType: 'ai_doctor_text', sessionId: SESSION, scenarioType: 'A', scenarioVersion: 'v1', phase: 'baseline', seenBefore: false, assessorIds: [A1, A2],
    })
  })

  it('runs the analysis with the entered inputs and shows the label, recommendation, indicators and minimums', async () => {
    const report = analyse({ dataSource: 'synthetic', cases: [], claims: [], securityGate: 'PASS', criticalIncidents: 0 })
    const fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/analysis')) return Response.json({ pilotStatus: 'running', interim: true, report })
      if (url === '/api/validation/admin/pilots') return Response.json({ pilots: [{ id: P, name: 'Pilot one', status: 'running', dataSource: 'synthetic', companyId: 'c' }] })
      return Response.json(detail('running'))
    })
    vi.stubGlobal('fetch', fetch)
    render(<PilotAdminPanel />)
    fireEvent.click(await screen.findByText(/Pilot one/))
    await screen.findByText('Run analysis')
    fireEvent.change(screen.getByLabelText('Critical incidents'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Security gate'), { target: { value: 'PASS' } })
    fireEvent.click(screen.getByText('Run analysis'))
    await screen.findByText(/not pilot evidence/)
    expect(screen.getByText(/INTERIM: the pilot is not closed/)).toBeTruthy()
    expect(screen.getByText('NOT PILOT DATA')).toBeTruthy()
    expect(screen.getByText('evidenceValidity')).toBeTruthy()
    expect(screen.getByText(/doubleRatedSessions: 0 of 30/)).toBeTruthy()
    const call = fetch.mock.calls.find(c => String(c[0]).includes('/analysis'))!
    expect(call[0]).toBe(`/api/validation/admin/pilots/${P}/analysis?gate=PASS&incidents=0`)
  })
})
